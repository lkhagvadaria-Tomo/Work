-- Row Level Security (§9). Every application table gets explicit policies.
-- The server data layer runs request-scoped queries as role `authenticated` with
-- request.jwt.claims set, so these policies are enforced on every query
-- (identically on Supabase/PostgREST if that surface is ever enabled).

-- Lock down by default: no table access without a policy.
alter table departments              enable row level security;
alter table employees                enable row level security;
alter table quarters                 enable row level security;
alter table objectives               enable row level security;
alter table key_results              enable row level security;
alter table work_items               enable row level security;
alter table deliverable_requirements enable row level security;
alter table deliverables             enable row level security;
alter table evidence                 enable row level security;
alter table reviews                  enable row level security;
alter table approvals                enable row level security;
alter table implementation_records   enable row level security;
alter table metric_validations       enable row level security;
alter table gate_rules               enable row level security;
alter table closure_profiles         enable row level security;
alter table gate_runs                enable row level security;
alter table gate_findings            enable row level security;
alter table closure_requests         enable row level security;
alter table quarter_closures         enable row level security;
alter table audit_logs               enable row level security;
alter table notifications            enable row level security;
alter table work_state_transitions   enable row level security;

-- Baseline grants: table-level permission, row filtering via policies.
grant usage on schema public to authenticated, anon;
grant select on all tables in schema public to authenticated;
grant insert, update on
  objectives, key_results, work_items, deliverable_requirements, deliverables,
  evidence, reviews, approvals, implementation_records, metric_validations,
  gate_runs, gate_findings, closure_requests, notifications,
  departments, employees, quarters, gate_rules, closure_profiles
to authenticated;
grant insert on audit_logs to authenticated;
grant delete on evidence, deliverable_requirements to authenticated;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Org structure: readable by all signed-in employees; writable by admin only.
-- ---------------------------------------------------------------------------
create policy departments_select on departments for select
  using (app.current_employee_id() is not null);
create policy departments_admin_write on departments for insert
  with check (app.is_admin());
create policy departments_admin_update on departments for update
  using (app.is_admin()) with check (app.is_admin());

create policy employees_select on employees for select
  using (app.current_employee_id() is not null);
create policy employees_admin_write on employees for insert
  with check (app.is_admin());
create policy employees_admin_update on employees for update
  using (app.is_admin()) with check (app.is_admin());

create policy quarters_select on quarters for select
  using (app.current_employee_id() is not null);
create policy quarters_admin_write on quarters for insert
  with check (app.is_admin());
create policy quarters_admin_update on quarters for update
  using (app.is_admin()) with check (app.is_admin());

create policy transitions_select on work_state_transitions for select
  using (true);

-- ---------------------------------------------------------------------------
-- OKR: owner + manager chain + department director + admin (+ assigned
-- reviewers/approvers for context, via app.can_read_kr).
-- ---------------------------------------------------------------------------
create policy objectives_select on objectives for select using (
  employee_id = app.current_employee_id()
  or app.manages(employee_id)
  or app.directs_department(app.department_of(employee_id))
  or app.is_admin()
  or exists (select 1 from key_results k where k.objective_id = objectives.id
             and app.can_read_kr(k.id))
);
create policy objectives_write on objectives for insert with check (
  app.is_admin() or app.directs_department(app.department_of(employee_id))
);
create policy objectives_update on objectives for update using (
  app.is_admin() or app.directs_department(app.department_of(employee_id))
) with check (
  app.is_admin() or app.directs_department(app.department_of(employee_id))
);

create policy key_results_select on key_results for select
  using (app.can_read_kr(id));
create policy key_results_insert on key_results for insert with check (
  exists (select 1 from objectives o where o.id = objective_id
          and (app.is_admin() or app.directs_department(app.department_of(o.employee_id))))
);
-- owner may update progress fields but never set CLOSED (closure functions only)
create policy key_results_update on key_results for update using (
  app.can_read_kr(id) and (
    app.is_admin()
    or exists (select 1 from objectives o where o.id = objective_id
               and (o.employee_id = app.current_employee_id()
                    or app.directs_department(app.department_of(o.employee_id))))
  )
) with check (status <> 'CLOSED' or app.is_admin());

-- ---------------------------------------------------------------------------
-- Work items
-- ---------------------------------------------------------------------------
create policy work_items_select on work_items for select
  using (app.can_read_work(id));
create policy work_items_insert on work_items for insert with check (
  created_by = app.current_employee_id()
  and (
    owner_id = app.current_employee_id()
    or app.manages(owner_id)
    or app.directs_department(department_id)
    or app.is_admin()
  )
);
-- owner/reviewer/approver/manager/director may update; CLOSED unreachable here
-- (trigger requires the closure flag which only finalize_work_closure sets).
create policy work_items_update on work_items for update
  using (app.can_read_work(id))
  with check (status <> 'CLOSED' or app.is_admin());

-- ---------------------------------------------------------------------------
-- Work-scoped child tables: visibility follows the work item.
-- ---------------------------------------------------------------------------
create policy dreq_select on deliverable_requirements for select
  using (app.can_read_work(work_item_id));
create policy dreq_write on deliverable_requirements for insert with check (
  app.can_read_work(work_item_id) and exists (
    select 1 from work_items w where w.id = work_item_id
      and (w.owner_id = app.current_employee_id() or app.manages(w.owner_id)
           or app.directs_department(w.department_id) or app.is_admin())
      and w.status not in ('CLOSED','CANCELLED'))
);
create policy dreq_update on deliverable_requirements for update
  using (app.can_read_work(work_item_id))
  with check (app.can_read_work(work_item_id));
create policy dreq_delete on deliverable_requirements for delete using (
  app.is_admin() or exists (
    select 1 from work_items w where w.id = work_item_id
      and w.owner_id = app.current_employee_id()
      and w.status in ('NOT_STARTED','IN_PROGRESS','RETURNED'))
);

create policy deliverables_select on deliverables for select
  using (app.can_read_work(work_item_id));
create policy deliverables_insert on deliverables for insert with check (
  app.can_read_work(work_item_id) and exists (
    select 1 from work_items w where w.id = work_item_id
      and w.status not in ('CLOSED','CANCELLED'))
);
create policy deliverables_update on deliverables for update
  using (app.can_read_work(work_item_id))
  with check (app.can_read_work(work_item_id));

create policy evidence_select on evidence for select
  using (app.can_read_work(work_item_id));
create policy evidence_insert on evidence for insert with check (
  created_by = app.current_employee_id()
  and app.can_read_work(work_item_id)
  and verified = false
);
-- creator edits own unverified evidence; verification only via app.verify_evidence()
create policy evidence_update on evidence for update using (
  created_by = app.current_employee_id() and verified = false
) with check (verified = false);
create policy evidence_delete on evidence for delete using (
  created_by = app.current_employee_id() and verified = false
  and exists (select 1 from work_items w where w.id = work_item_id
              and w.status not in ('CLOSED','CANCELLED'))
);

-- ---------------------------------------------------------------------------
-- Reviews: assigned reviewer decides; participants read.
-- ---------------------------------------------------------------------------
create policy reviews_select on reviews for select
  using (app.can_read_work(work_item_id));
create policy reviews_insert on reviews for insert with check (
  app.can_read_work(work_item_id)
  and (
    -- SELF_QC is recorded by the owner on their own work
    (review_type = 'SELF_QC' and reviewer_id = app.current_employee_id()
      and exists (select 1 from work_items w where w.id = work_item_id
                  and w.owner_id = app.current_employee_id()))
    -- other reviews are requested by owner/manager/director/admin
    or exists (select 1 from work_items w where w.id = work_item_id
               and (w.owner_id = app.current_employee_id() or app.manages(w.owner_id)
                    or app.directs_department(w.department_id) or app.is_admin()))
  )
);
create policy reviews_decide on reviews for update using (
  reviewer_id = app.current_employee_id() and decision = 'PENDING'
) with check (reviewer_id = app.current_employee_id());

-- ---------------------------------------------------------------------------
-- Approvals: assigned approver decides; never the owner (trigger + here).
-- ---------------------------------------------------------------------------
create policy approvals_select on approvals for select
  using (app.can_read_work(work_item_id));
create policy approvals_insert on approvals for insert with check (
  app.can_read_work(work_item_id)
  and approver_id <> app.current_employee_id()  -- you request approval FROM someone
  or app.is_admin()
);
create policy approvals_decide on approvals for update using (
  approver_id = app.current_employee_id() and decision = 'PENDING'
) with check (approver_id = app.current_employee_id());

-- ---------------------------------------------------------------------------
-- Implementation & metric validation
-- ---------------------------------------------------------------------------
create policy impl_select on implementation_records for select
  using (app.can_read_work(work_item_id));
create policy impl_insert on implementation_records for insert with check (
  app.can_read_work(work_item_id)
);
create policy impl_update on implementation_records for update
  using (app.can_read_work(work_item_id))
  with check (app.can_read_work(work_item_id));

create policy metric_select on metric_validations for select using (
  (work_item_id is not null and app.can_read_work(work_item_id))
  or (key_result_id is not null and app.can_read_kr(key_result_id))
);
create policy metric_insert on metric_validations for insert with check (
  (work_item_id is not null and app.can_read_work(work_item_id))
  or (key_result_id is not null and app.can_read_kr(key_result_id))
);
create policy metric_update on metric_validations for update using (
  (work_item_id is not null and app.can_read_work(work_item_id))
  or (key_result_id is not null and app.can_read_kr(key_result_id))
) with check (
  -- validation PASS/FAIL must carry the validator's own identity
  validation_status in ('PENDING','NOT_APPLICABLE')
  or validated_by = app.current_employee_id()
);

-- ---------------------------------------------------------------------------
-- Gate configuration: read-all, admin-write.
-- ---------------------------------------------------------------------------
create policy gate_rules_select on gate_rules for select
  using (app.current_employee_id() is not null);
create policy gate_rules_admin_ins on gate_rules for insert with check (app.is_admin());
create policy gate_rules_admin_upd on gate_rules for update
  using (app.is_admin()) with check (app.is_admin());

create policy closure_profiles_select on closure_profiles for select
  using (app.current_employee_id() is not null);
create policy closure_profiles_admin_ins on closure_profiles for insert with check (app.is_admin());
create policy closure_profiles_admin_upd on closure_profiles for update
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Gate runs & findings: readable when the scope is readable; created by the
-- user who ran the gate; historical (no updates except finding resolution).
-- ---------------------------------------------------------------------------
create or replace function app.can_read_scope(s gate_scope, sid uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select case s
    when 'WORK_ITEM'  then app.can_read_work(sid)
    when 'KEY_RESULT' then app.can_read_kr(sid)
    when 'QUARTER'    then app.current_employee_id() is not null
  end
$$;

create policy gate_runs_select on gate_runs for select
  using (app.can_read_scope(scope_type, scope_id));
create policy gate_runs_insert on gate_runs for insert with check (
  run_by = app.current_employee_id() and app.can_read_scope(scope_type, scope_id)
);

create policy gate_findings_select on gate_findings for select using (
  exists (select 1 from gate_runs g where g.id = gate_run_id
          and app.can_read_scope(g.scope_type, g.scope_id))
);
create policy gate_findings_insert on gate_findings for insert with check (
  exists (select 1 from gate_runs g where g.id = gate_run_id
          and g.run_by = app.current_employee_id())
);
create policy gate_findings_resolve on gate_findings for update using (
  exists (select 1 from gate_runs g where g.id = gate_run_id
          and app.can_read_scope(g.scope_type, g.scope_id))
) with check (resolved = false or resolved_by = app.current_employee_id());

-- ---------------------------------------------------------------------------
-- Closure requests: requester creates; finalization only via SECURITY DEFINER
-- functions (status here cannot move to APPROVED/REJECTED by direct update).
-- ---------------------------------------------------------------------------
create policy closure_select on closure_requests for select using (
  requested_by = app.current_employee_id()
  or app.manages(requested_by)
  or app.directs_department(app.department_of(requested_by))
  or app.is_admin()
  or (scope_type = 'WORK_ITEM' and app.can_read_work(scope_id))
);
create policy closure_insert on closure_requests for insert with check (
  requested_by = app.current_employee_id()
  and status in ('PENDING','READY_FOR_SIGNOFF')
  and app.can_read_scope(scope_type, scope_id)
);
create policy closure_update on closure_requests for update using (
  requested_by = app.current_employee_id() and status in ('PENDING','GATE_FAILED','READY_FOR_SIGNOFF')
) with check (
  status in ('PENDING','READY_FOR_SIGNOFF','CANCELLED')  -- APPROVE/REJECT via definer fn only
);

create policy quarter_closures_select on quarter_closures for select using (
  employee_id = app.current_employee_id()
  or app.manages(employee_id)
  or app.directs_department(app.department_of(employee_id))
  or app.is_admin()
);
-- inserts happen only inside app.finalize_quarter_closure (SECURITY DEFINER)

-- ---------------------------------------------------------------------------
-- Audit: append via app.audit()/direct insert as self; read own actions,
-- entity-scoped for participants, full for directors/admin. Immutable.
-- ---------------------------------------------------------------------------
create policy audit_insert on audit_logs for insert with check (
  actor_id = app.current_employee_id()
);
create policy audit_select on audit_logs for select using (
  app.is_admin()
  or app.current_system_role() = 'DIRECTOR'
  or actor_id = app.current_employee_id()
  or (entity_type = 'work_item'  and app.can_read_work(entity_id))
  or (entity_type = 'key_result' and app.can_read_kr(entity_id))
);

-- ---------------------------------------------------------------------------
-- Notifications: strictly recipient-scoped; creation via app.notify().
-- ---------------------------------------------------------------------------
create policy notifications_select on notifications for select
  using (recipient_id = app.current_employee_id());
create policy notifications_mark_read on notifications for update
  using (recipient_id = app.current_employee_id())
  with check (recipient_id = app.current_employee_id());
