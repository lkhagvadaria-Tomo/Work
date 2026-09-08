-- Helper schema, triggers and SECURITY DEFINER governance functions.
create schema if not exists app;
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Identity helpers (claims are set per-transaction by the server data layer,
-- and by Supabase automatically when PostgREST is used).
-- ---------------------------------------------------------------------------
create or replace function app.jwt() returns jsonb
language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

create or replace function app.auth_uid() returns uuid
language sql stable as
$$ select nullif(app.jwt()->>'sub','')::uuid $$;

create or replace function app.current_employee_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from public.employees where auth_user_id = app.auth_uid() and active $$;

create or replace function app.current_system_role() returns system_role
language sql stable security definer set search_path = public as
$$ select system_role from public.employees where auth_user_id = app.auth_uid() and active $$;

create or replace function app.is_admin() returns boolean
language sql stable as
$$ select app.current_system_role() = 'ADMIN' $$;

-- is the current employee (transitively, up to 4 levels) the manager of emp?
create or replace function app.manages(emp uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  with recursive chain as (
    select e.id, e.manager_id, 1 as depth from public.employees e where e.id = emp
    union all
    select e.id, e.manager_id, c.depth + 1
    from public.employees e join chain c on e.id = c.manager_id
    where c.depth < 4
  )
  select exists (select 1 from chain where manager_id = app.current_employee_id())
$$;

-- is the current employee the director for this department (named director on the
-- department, or a DIRECTOR-role member of it)?
create or replace function app.directs_department(dept uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.departments d
    where d.id = dept and d.director_employee_id = app.current_employee_id()
  ) or exists (
    select 1 from public.employees e
    where e.id = app.current_employee_id()
      and e.department_id = dept and e.system_role = 'DIRECTOR'
  )
$$;

create or replace function app.department_of(emp uuid) returns uuid
language sql stable security definer set search_path = public as
$$ select department_id from public.employees where id = emp $$;

-- may the current employee read this work item? (single source of truth for
-- work-scoped visibility, reused by child-table policies)
create or replace function app.can_read_work(w uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.work_items wi
    where wi.id = w
      and (
        wi.owner_id    = app.current_employee_id()
        or wi.reviewer_id = app.current_employee_id()
        or wi.approver_id = app.current_employee_id()
        or app.manages(wi.owner_id)
        or app.directs_department(wi.department_id)
        or app.is_admin()
      )
  )
$$;

create or replace function app.can_read_kr(kr uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.key_results k
    join public.objectives o on o.id = k.objective_id
    where k.id = kr
      and (
        o.employee_id = app.current_employee_id()
        or app.manages(o.employee_id)
        or app.directs_department(app.department_of(o.employee_id))
        or app.is_admin()
        -- reviewers/approvers of work under this KR need its context (§9)
        or exists (
          select 1 from public.work_items wi
          where wi.key_result_id = k.id
            and (wi.reviewer_id = app.current_employee_id()
                 or wi.approver_id = app.current_employee_id())
        )
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at() returns trigger
language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'departments','employees','quarters','objectives','key_results','work_items',
    'deliverable_requirements','deliverables','evidence','approvals',
    'implementation_records','metric_validations','gate_rules','closure_profiles',
    'closure_requests'
  ] loop
    execute format(
      'create trigger %I_updated_at before update on public.%I
       for each row execute function app.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Work state machine guard (§15) + employee-cannot-close (§3, D-005)
-- ---------------------------------------------------------------------------
create or replace function app.enforce_work_transition() returns trigger
language plpgsql as
$$
begin
  if old.status = new.status then
    return new;
  end if;
  if not exists (
    select 1 from public.work_state_transitions
    where from_status = old.status and to_status = new.status
  ) then
    raise exception 'invalid work transition % -> %', old.status, new.status
      using errcode = 'P0001';
  end if;
  if new.status = 'CLOSED' then
    -- reachable only through app.finalize_work_closure(), which sets this flag
    if coalesce(current_setting('app.allow_close', true), '') <> '1' then
      raise exception 'CLOSED can only be set by the closure gate + human sign-off'
        using errcode = 'P0001';
    end if;
    new.closed_at := coalesce(new.closed_at, now());
  end if;
  if new.status = 'SUBMITTED' and old.status = 'IN_PROGRESS' then
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  return new;
end
$$;

create trigger work_items_transition before update of status on work_items
for each row execute function app.enforce_work_transition();

-- a work item can never be born CLOSED; non-admin users start at the beginning
create or replace function app.enforce_work_insert() returns trigger
language plpgsql as
$$
begin
  if new.status = 'CLOSED' and coalesce(current_setting('app.allow_close', true), '') <> '1' then
    raise exception 'a work item cannot be created as CLOSED';
  end if;
  if app.current_employee_id() is not null and not app.is_admin()
     and new.status not in ('NOT_STARTED','IN_PROGRESS') then
    raise exception 'new work items must start as NOT_STARTED or IN_PROGRESS';
  end if;
  return new;
end
$$;

create trigger work_items_insert_guard before insert on work_items
for each row execute function app.enforce_work_insert();

-- ---------------------------------------------------------------------------
-- Approvals: segregation of duties + relatedness (§8)
-- ---------------------------------------------------------------------------
create or replace function app.enforce_approval_integrity() returns trigger
language plpgsql as
$$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.work_items where id = new.work_item_id;
  if v_owner is null then
    raise exception 'approval references missing work item';
  end if;
  if new.approver_id = v_owner then
    raise exception 'segregation of duties: owner cannot approve own work';
  end if;
  return new;
end
$$;

create trigger approvals_integrity before insert or update on approvals
for each row execute function app.enforce_approval_integrity();

-- ---------------------------------------------------------------------------
-- Audit log immutability
-- ---------------------------------------------------------------------------
create or replace function app.audit_logs_immutable() returns trigger
language plpgsql as
$$ begin raise exception 'audit_logs are append-only'; end $$;

create trigger audit_logs_no_update before update or delete on audit_logs
for each row execute function app.audit_logs_immutable();

create or replace function app.audit(
  p_entity_type text, p_entity_id uuid, p_action text,
  p_old jsonb default null, p_new jsonb default null, p_request_id text default null
) returns void
language sql security definer set search_path = public as
$$
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, old_values, new_values, request_id)
  values (app.current_employee_id(), p_entity_type, p_entity_id, p_action, p_old, p_new, p_request_id)
$$;

create or replace function app.notify(
  p_recipient uuid, p_type text, p_title text, p_message text,
  p_entity_type text default null, p_entity_id uuid default null
) returns void
language sql security definer set search_path = public as
$$
  insert into public.notifications (recipient_id, type, title, message, entity_type, entity_id)
  values (p_recipient, p_type, p_title, p_message, p_entity_type, p_entity_id)
$$;

-- ---------------------------------------------------------------------------
-- First-login employee linking (§10): only pre-provisioned, active employees
-- with a matching verified email may enter; everyone else is rejected.
-- ---------------------------------------------------------------------------
create or replace function app.link_employee(p_auth_uid uuid, p_email text) returns uuid
language plpgsql security definer set search_path = public as
$$
declare v_id uuid;
begin
  select id into v_id from public.employees
  where lower(email) = lower(p_email) and active;
  if v_id is null then
    return null; -- unauthorized: no provisioned employee for this account
  end if;
  update public.employees set auth_user_id = p_auth_uid
  where id = v_id and (auth_user_id is null or auth_user_id = p_auth_uid);
  if not found then
    return null; -- email already linked to a different auth account
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Authoritative closure readiness re-check in SQL (defense in depth, D-005).
-- The TypeScript Gate Engine produces the rich findings; this function is the
-- final, non-bypassable verification used by finalize_work_closure().
-- Returns the list of blocking condition codes (empty = ready).
-- ---------------------------------------------------------------------------
create or replace function app.work_closure_blockers(p_work uuid) returns text[]
language plpgsql stable security definer set search_path = public as
$$
declare
  w public.work_items%rowtype;
  prof public.closure_profiles%rowtype;
  blockers text[] := '{}';
  rt review_type;
  at approval_type;
begin
  select * into w from public.work_items where id = p_work;
  if w.id is null then return array['WORK_NOT_FOUND']; end if;

  select * into prof from public.closure_profiles where work_type = w.work_type;
  if prof.id is null then
    -- default: strictest profile
    prof.requires_deliverables := true;  prof.requires_self_qc := true;
    prof.required_review_types := '{FUNCTIONAL}'; prof.requires_approval := true;
    prof.required_approval_types := '{DIRECTOR}';
    prof.requires_implementation := w.implementation_required;
    prof.requires_validation := w.validation_required;
    prof.requires_metric := false; prof.requires_evidence := true;
    prof.min_evidence_count := 1; prof.simplified_closure := false;
  end if;

  if prof.requires_deliverables and exists (
    select 1 from public.deliverable_requirements r
    where r.work_item_id = w.id and r.required
      and not exists (
        select 1 from public.deliverables d
        where d.work_item_id = w.id and d.requirement_id = r.id
          and (not r.require_final_version or d.final_version))
  ) then blockers := blockers || 'DELIVERABLES_INCOMPLETE'; end if;

  if prof.requires_self_qc and not exists (
    select 1 from public.reviews rv
    where rv.work_item_id = w.id and rv.review_type = 'SELF_QC' and rv.decision = 'PASS'
  ) then blockers := blockers || 'SELF_QC_MISSING'; end if;

  foreach rt in array prof.required_review_types loop
    if not exists (
      select 1 from public.reviews rv
      where rv.work_item_id = w.id and rv.review_type = rt and rv.decision = 'PASS'
    ) then blockers := blockers || ('REVIEW_MISSING:' || rt::text); end if;
  end loop;

  if prof.requires_approval then
    foreach at in array prof.required_approval_types loop
      if not exists (
        select 1 from public.approvals a
        where a.work_item_id = w.id and a.approval_type = at and a.decision = 'APPROVE'
      ) then blockers := blockers || ('APPROVAL_MISSING:' || at::text); end if;
    end loop;
  end if;

  if (prof.requires_implementation or w.implementation_required) and not exists (
    select 1 from public.implementation_records ir
    where ir.work_item_id = w.id and ir.implementation_status in ('LIVE','PILOT','NOT_REQUIRED')
  ) then blockers := blockers || 'IMPLEMENTATION_MISSING'; end if;

  if (prof.requires_validation or w.validation_required or prof.requires_metric) and exists (
    select 1 from public.metric_validations mv
    where mv.work_item_id = w.id and mv.validation_status in ('PENDING','FAIL')
  ) then blockers := blockers || 'VALIDATION_NOT_PASSED'; end if;

  if (prof.requires_validation or w.validation_required) and not exists (
    select 1 from public.metric_validations mv where mv.work_item_id = w.id
  ) then blockers := blockers || 'VALIDATION_MISSING'; end if;

  if prof.requires_evidence and (
    select count(*) from public.evidence e where e.work_item_id = w.id
  ) < prof.min_evidence_count then
    blockers := blockers || 'EVIDENCE_INSUFFICIENT';
  end if;

  -- open critical findings on the latest closure gate run block closure
  if exists (
    select 1 from public.gate_findings f
    join public.gate_runs g on g.id = f.gate_run_id
    where g.scope_type = 'WORK_ITEM' and g.scope_id = w.id
      and f.severity = 'CRITICAL' and f.result = 'FAIL' and not f.resolved
      and g.id = (select id from public.gate_runs
                  where scope_type = 'WORK_ITEM' and scope_id = w.id
                  order by started_at desc limit 1)
  ) then blockers := blockers || 'CRITICAL_FINDINGS_OPEN'; end if;

  return blockers;
end
$$;

-- ---------------------------------------------------------------------------
-- Final human sign-off (§3): RULE GATE PASS + HUMAN SIGN-OFF = CLOSED.
-- Caller must be the work item's designated approver, the department director,
-- or an admin — and never the owner.
-- ---------------------------------------------------------------------------
create or replace function app.finalize_work_closure(
  p_request uuid, p_decision approval_decision, p_comment text default null
) returns closure_status
language plpgsql security definer set search_path = public as
$$
declare
  req public.closure_requests%rowtype;
  w public.work_items%rowtype;
  g public.gate_runs%rowtype;
  me uuid := app.current_employee_id();
  blockers text[];
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_decision not in ('APPROVE','RETURN','REJECT') then
    raise exception 'invalid decision %', p_decision;
  end if;
  if p_decision in ('RETURN','REJECT') and coalesce(trim(p_comment),'') = '' then
    raise exception 'comment required for RETURN/REJECT';
  end if;

  select * into req from public.closure_requests
  where id = p_request and scope_type = 'WORK_ITEM'
  for update;
  if req.id is null then raise exception 'closure request not found'; end if;
  if req.status not in ('PENDING','READY_FOR_SIGNOFF') then
    raise exception 'closure request already finalized (%)', req.status;
  end if;

  select * into w from public.work_items where id = req.scope_id for update;

  if w.owner_id = me then
    raise exception 'segregation of duties: owner cannot sign off own closure';
  end if;
  if not (w.approver_id = me or app.directs_department(w.department_id) or app.is_admin()) then
    raise exception 'not authorized to sign off this closure';
  end if;

  if p_decision = 'APPROVE' then
    -- gate run must exist, match scope, not be FAIL, and not be stale (§44)
    select * into g from public.gate_runs where id = req.gate_run_id;
    if g.id is null or g.scope_type <> 'WORK_ITEM' or g.scope_id <> w.id then
      raise exception 'closure request has no valid gate run';
    end if;
    if g.result = 'FAIL' then
      raise exception 'gate result is FAIL — closure blocked';
    end if;
    if g.started_at < w.updated_at then
      raise exception 'stale gate run: work item changed after evaluation — re-run the gate';
    end if;
    blockers := app.work_closure_blockers(w.id);
    if array_length(blockers, 1) is not null then
      update public.closure_requests set status = 'GATE_FAILED' where id = req.id;
      raise exception 'closure blocked: %', array_to_string(blockers, ', ');
    end if;

    perform set_config('app.allow_close', '1', true);
    update public.work_items
      set status = 'CLOSED', closed_at = now()
      where id = w.id;
    perform set_config('app.allow_close', '', true);

    update public.closure_requests
      set status = 'APPROVED', final_approver_id = me, final_decision = 'APPROVE',
          final_comment = p_comment, finalized_at = now()
      where id = req.id;
    perform app.audit('work_item', w.id, 'CLOSE',
      jsonb_build_object('status', w.status), jsonb_build_object('status','CLOSED'));
    perform app.notify(w.owner_id, 'WORK_CLOSED', 'Ажил хаагдлаа',
      w.work_code || ' — ' || w.title, 'work_item', w.id);
    return 'APPROVED';
  else
    update public.closure_requests
      set status = case when p_decision = 'REJECT' then 'REJECTED' else 'PENDING' end,
          final_approver_id = me, final_decision = p_decision,
          final_comment = p_comment, finalized_at = case when p_decision='REJECT' then now() else null end
      where id = req.id;
    perform app.audit('closure_request', req.id, 'CLOSURE_' || p_decision::text, null,
      jsonb_build_object('comment', p_comment));
    perform app.notify(w.owner_id, 'CLOSURE_' || p_decision::text,
      'Хаалтын хүсэлт буцаагдлаа', coalesce(p_comment,''), 'work_item', w.id);
    return (select status from public.closure_requests where id = req.id);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- KR closure: every governed work item under the KR must be CLOSED or
-- CANCELLED and the KR metric validated (when one exists).
-- ---------------------------------------------------------------------------
create or replace function app.kr_closure_blockers(p_kr uuid) returns text[]
language sql stable security definer set search_path = public as
$$
  select coalesce(array_agg(b), '{}') from (
    select 'WORK_OPEN:' || wi.work_code as b
    from public.work_items wi
    where wi.key_result_id = p_kr and wi.status not in ('CLOSED','CANCELLED')
    union all
    select 'KR_METRIC_NOT_PASSED'
    where exists (select 1 from public.metric_validations mv
                  where mv.key_result_id = p_kr and mv.validation_status in ('PENDING','FAIL'))
  ) x
$$;

create or replace function app.finalize_kr_closure(
  p_request uuid, p_decision approval_decision, p_comment text default null,
  p_achievement_percent numeric default null
) returns closure_status
language plpgsql security definer set search_path = public as
$$
declare
  req public.closure_requests%rowtype;
  k public.key_results%rowtype;
  owner_emp uuid; dept uuid;
  me uuid := app.current_employee_id();
  blockers text[];
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into req from public.closure_requests
  where id = p_request and scope_type = 'KEY_RESULT' for update;
  if req.id is null then raise exception 'closure request not found'; end if;
  if req.status not in ('PENDING','READY_FOR_SIGNOFF') then
    raise exception 'closure request already finalized (%)', req.status;
  end if;
  select * into k from public.key_results where id = req.scope_id for update;
  select o.employee_id, app.department_of(o.employee_id) into owner_emp, dept
  from public.objectives o where o.id = k.objective_id;
  if owner_emp = me then
    raise exception 'segregation of duties: owner cannot sign off own KR closure';
  end if;
  if not (app.directs_department(dept) or app.is_admin()) then
    raise exception 'not authorized to sign off KR closure';
  end if;
  if p_decision = 'APPROVE' then
    blockers := app.kr_closure_blockers(k.id);
    if array_length(blockers, 1) is not null then
      update public.closure_requests set status = 'GATE_FAILED' where id = req.id;
      raise exception 'KR closure blocked: %', array_to_string(blockers, ', ');
    end if;
    update public.key_results
      set status = 'CLOSED', closed_at = now(),
          achievement_percent = coalesce(p_achievement_percent, achievement_percent)
      where id = k.id;
    update public.closure_requests
      set status = 'APPROVED', final_approver_id = me, final_decision = 'APPROVE',
          final_comment = p_comment, finalized_at = now()
      where id = req.id;
    perform app.audit('key_result', k.id, 'CLOSE');
    perform app.notify(owner_emp, 'KR_CLOSED', 'KR хаагдлаа', k.kr_code, 'key_result', k.id);
    return 'APPROVED';
  else
    if coalesce(trim(p_comment),'') = '' then
      raise exception 'comment required for RETURN/REJECT';
    end if;
    update public.closure_requests
      set status = case when p_decision = 'REJECT' then 'REJECTED' else 'PENDING' end,
          final_approver_id = me, final_decision = p_decision, final_comment = p_comment,
          finalized_at = case when p_decision='REJECT' then now() else null end
      where id = req.id;
    perform app.audit('closure_request', req.id, 'KR_CLOSURE_' || p_decision::text);
    return (select status from public.closure_requests where id = req.id);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Quarter closure for one employee (§32–33)
-- ---------------------------------------------------------------------------
create or replace function app.quarter_closure_blockers(p_quarter uuid, p_employee uuid)
returns text[]
language sql stable security definer set search_path = public as
$$
  select coalesce(array_agg(b), '{}') from (
    select o.objective_code || '-' || k.kr_code || ' NOT_CLOSED' as b
    from public.objectives o
    join public.key_results k on k.objective_id = o.id
    where o.quarter_id = p_quarter and o.employee_id = p_employee
      and o.status <> 'CANCELLED'
      and k.status not in ('CLOSED','CANCELLED')
  ) x
$$;

create or replace function app.finalize_quarter_closure(
  p_request uuid, p_decision approval_decision, p_comment text default null
) returns closure_status
language plpgsql security definer set search_path = public as
$$
declare
  req public.closure_requests%rowtype;
  me uuid := app.current_employee_id();
  blockers text[];
  dept uuid;
  v_weighted numeric; v_evidence numeric; v_total int; v_closed int;
  v_gate gate_result;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into req from public.closure_requests
  where id = p_request and scope_type = 'QUARTER' for update;
  if req.id is null then raise exception 'closure request not found'; end if;
  if req.status not in ('PENDING','READY_FOR_SIGNOFF') then
    raise exception 'closure request already finalized (%)', req.status;
  end if;
  dept := app.department_of(req.requested_by);
  if req.requested_by = me then
    raise exception 'segregation of duties: employee cannot sign off own quarter';
  end if;
  if not (app.directs_department(dept) or app.is_admin()) then
    raise exception 'only the department director (or admin) signs off quarter closure';
  end if;

  if p_decision = 'APPROVE' then
    blockers := app.quarter_closure_blockers(req.scope_id, req.requested_by);
    if array_length(blockers, 1) is not null then
      update public.closure_requests set status = 'GATE_FAILED' where id = req.id;
      raise exception 'quarter closure blocked: %', array_to_string(blockers, ', ');
    end if;

    select
      round(sum(o.weight / 100.0 * k.weight / 100.0 * coalesce(k.achievement_percent, 0)), 2),
      count(*) filter (where k.status = 'CLOSED'),
      count(*)
      into v_weighted, v_closed, v_total
    from public.objectives o
    join public.key_results k on k.objective_id = o.id
    where o.quarter_id = req.scope_id and o.employee_id = req.requested_by
      and o.status <> 'CANCELLED' and k.status <> 'CANCELLED';

    select round(100.0 * count(*) filter (where ev_count > 0) / greatest(count(*), 1), 2)
      into v_evidence
    from (
      select wi.id, (select count(*) from public.evidence e where e.work_item_id = wi.id) as ev_count
      from public.work_items wi
      join public.objectives o on o.employee_id = wi.owner_id and o.quarter_id = wi.quarter_id
      where wi.quarter_id = req.scope_id and wi.owner_id = req.requested_by
        and wi.status <> 'CANCELLED'
      group by wi.id
    ) t;

    select coalesce((select result from public.gate_runs where id = req.gate_run_id), 'PASS')
      into v_gate;
    if v_gate = 'FAIL' then
      raise exception 'quarter gate result is FAIL — closure blocked';
    end if;

    update public.closure_requests
      set status = 'APPROVED', final_approver_id = me, final_decision = 'APPROVE',
          final_comment = p_comment, finalized_at = now()
      where id = req.id;

    insert into public.quarter_closures
      (quarter_id, employee_id, closure_request_id, weighted_achievement,
       evidence_completeness, krs_total, krs_closed, final_gate_result, final_approver_id)
    values
      (req.scope_id, req.requested_by, req.id, v_weighted,
       coalesce(v_evidence, 100), coalesce(v_total,0), coalesce(v_closed,0), v_gate, me);

    perform app.audit('quarter', req.scope_id, 'QUARTER_CLOSE',
      null, jsonb_build_object('employee', req.requested_by));
    perform app.notify(req.requested_by, 'QUARTER_CLOSED',
      'Улирлын хаалт баталгаажлаа', null, 'quarter', req.scope_id);
    return 'APPROVED';
  else
    if coalesce(trim(p_comment),'') = '' then
      raise exception 'comment required for RETURN/REJECT';
    end if;
    update public.closure_requests
      set status = case when p_decision = 'REJECT' then 'REJECTED' else 'PENDING' end,
          final_approver_id = me, final_decision = p_decision, final_comment = p_comment,
          finalized_at = case when p_decision='REJECT' then now() else null end
      where id = req.id;
    return (select status from public.closure_requests where id = req.id);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Evidence verification (reviewer / approver / manager / director; not creator)
-- ---------------------------------------------------------------------------
create or replace function app.verify_evidence(p_evidence uuid) returns void
language plpgsql security definer set search_path = public as
$$
declare e public.evidence%rowtype; w public.work_items%rowtype;
        me uuid := app.current_employee_id();
begin
  select * into e from public.evidence where id = p_evidence for update;
  if e.id is null then raise exception 'evidence not found'; end if;
  select * into w from public.work_items where id = e.work_item_id;
  if e.created_by = me then
    raise exception 'creator cannot verify own evidence';
  end if;
  if not (w.reviewer_id = me or w.approver_id = me or app.manages(w.owner_id)
          or app.directs_department(w.department_id) or app.is_admin()) then
    raise exception 'not authorized to verify this evidence';
  end if;
  update public.evidence
    set verified = true, verified_by = me, verified_at = now()
    where id = p_evidence;
  perform app.audit('evidence', p_evidence, 'VERIFY');
end
$$;

revoke all on function app.finalize_work_closure(uuid, approval_decision, text) from public;
revoke all on function app.finalize_kr_closure(uuid, approval_decision, text, numeric) from public;
revoke all on function app.finalize_quarter_closure(uuid, approval_decision, text) from public;
revoke all on function app.link_employee(uuid, text) from public;
grant execute on function app.finalize_work_closure(uuid, approval_decision, text) to authenticated;
grant execute on function app.finalize_kr_closure(uuid, approval_decision, text, numeric) to authenticated;
grant execute on function app.finalize_quarter_closure(uuid, approval_decision, text) to authenticated;
grant execute on function app.link_employee(uuid, text) to service_role;
