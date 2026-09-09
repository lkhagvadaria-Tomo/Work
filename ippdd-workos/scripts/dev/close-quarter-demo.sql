-- DEV/DEMO ONLY: drives the seeded pilot quarter to full closure through the
-- REAL governance path (state machine trigger + SECURITY DEFINER sign-offs),
-- so KR closure, quarter closure and the certificate can be exercised locally.
-- Never run against production data.
--
-- Personas are switched via request.jwt.claims exactly like the app does.
-- All transitions still pass the trigger; all closures pass the authority and
-- blocker checks inside app.finalize_*_closure.

\set ON_ERROR_STOP on
begin;

-- claim helpers -------------------------------------------------------------
create or replace function pg_temp.as_la() returns void language sql as
$$ select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',true) $$;
create or replace function pg_temp.as_reviewer() returns void language sql as
$$ select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003"}',true) $$;
create or replace function pg_temp.as_director() returns void language sql as
$$ select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true) $$;

do $$
declare
  w record;
  req record;
  gr uuid;
  cr uuid;
  la uuid := 'e0000000-0000-4000-8000-000000000002';
  reviewer uuid := 'e0000000-0000-4000-8000-000000000003';
  director uuid := 'e0000000-0000-4000-8000-000000000001';
  kr record;
  krcr uuid;
  qid uuid := 'a0000000-0000-4000-8000-000000000001';
  qcr uuid;
begin
  -- ── close every open pilot work item through the full lifecycle ──────────
  for w in select * from work_items where status not in ('CLOSED','CANCELLED') order by work_code loop
    perform pg_temp.as_la();

    -- deliverables: final version for every requirement
    for req in select * from deliverable_requirements where work_item_id = w.id loop
      if not exists (select 1 from deliverables d where d.requirement_id = req.id and d.final_version) then
        insert into deliverables (work_item_id, requirement_id, name, version, final_version, submitted_by, submitted_at)
        values (w.id, req.id, req.name || ' v1.0', 'v1.0', true, la, now());
      end if;
    end loop;

    -- evidence (profile minimums are 1–2)
    insert into evidence (work_item_id, evidence_type, title, description, created_by)
    values
      (w.id, 'MEETING_DECISION', w.work_code || ' — хурлын шийдвэр', 'demo', la),
      (w.id, 'DOCUMENT', w.work_code || ' — эцсийн багц', 'demo', la);

    -- self QC
    insert into reviews (work_item_id, reviewer_id, review_type, decision, reviewed_at, comment)
    values (w.id, la, 'SELF_QC', 'PASS', now(), 'demo self QC');

    -- reviews required by the profile (beyond self QC)
    perform pg_temp.as_reviewer();
    insert into reviews (work_item_id, reviewer_id, review_type, decision, reviewed_at, comment)
    select w.id, reviewer, rt, 'PASS', now(), 'demo review'
      from closure_profiles p, unnest(p.required_review_types) rt
     where p.work_type = w.work_type and rt <> 'SELF_QC';

    -- approvals required by the profile
    perform pg_temp.as_director();
    insert into approvals (work_item_id, approver_id, approval_type, deliverable_version, decision, approved_at)
    select w.id, director, at, 'v1.0', 'APPROVE', now()
      from closure_profiles p, unnest(p.required_approval_types) at
     where p.work_type = w.work_type and p.requires_approval;

    -- implementation where required
    if w.implementation_required or exists
       (select 1 from closure_profiles p where p.work_type = w.work_type and p.requires_implementation) then
      perform pg_temp.as_la();
      insert into implementation_records (work_item_id, implementation_status, environment, implemented_by, implemented_at, comment)
      values (w.id, 'LIVE', 'production', la, now(), 'demo implementation');
    end if;

    -- metrics: actuals + validation by the reviewer
    perform pg_temp.as_la();
    update metric_validations set actual_value = coalesce(target_value, 1)
     where work_item_id = w.id and actual_value is null;
    perform pg_temp.as_reviewer();
    update metric_validations
       set validation_status = 'PASS', validated_by = reviewer, validated_at = now()
     where work_item_id = w.id and validation_status = 'PENDING';

    -- lifecycle transitions (trigger-guarded)
    perform pg_temp.as_la();
    if w.status = 'NOT_STARTED' then
      update work_items set status = 'IN_PROGRESS' where id = w.id;
    end if;
    if exists (select 1 from closure_profiles p where p.work_type = w.work_type and p.requires_approval) then
      update work_items set status = 'SUBMITTED' where id = w.id;
      perform pg_temp.as_reviewer();
      update work_items set status = 'UNDER_REVIEW' where id = w.id;
      update work_items set status = 'REVIEW_PASSED' where id = w.id;
      perform pg_temp.as_la();
      update work_items set status = 'WAITING_APPROVAL' where id = w.id;
      perform pg_temp.as_director();
      update work_items set status = 'APPROVED' where id = w.id;
      if w.implementation_required then
        update work_items set status = 'IMPLEMENTATION' where id = w.id;
        update work_items set status = 'VALIDATION' where id = w.id;
      end if;
    end if;

    -- gate run + closure request + director sign-off (the only path to CLOSED)
    perform pg_temp.as_la();
    insert into gate_runs (scope_type, scope_id, result, total_checks, passed_checks, run_by, completed_at)
    values ('WORK_ITEM', w.id, 'PASS', 7, 7, la, now()) returning id into gr;
    insert into closure_requests (scope_type, scope_id, requested_by, gate_run_id, status)
    values ('WORK_ITEM', w.id, la, gr, 'READY_FOR_SIGNOFF') returning id into cr;
    perform pg_temp.as_director();
    perform app.finalize_work_closure(cr, 'APPROVE', 'demo sign-off');
    raise notice 'closed %', w.work_code;
  end loop;

  -- ── close every KR (director sign-off, achievement = 100) ────────────────
  for kr in
    select k.id, o.objective_code || '-' || k.kr_code as label
      from key_results k join objectives o on o.id = k.objective_id
     where o.quarter_id = qid and k.status <> 'CLOSED'
  loop
    perform pg_temp.as_la();
    insert into closure_requests (scope_type, scope_id, requested_by, status)
    values ('KEY_RESULT', kr.id, la, 'READY_FOR_SIGNOFF') returning id into krcr;
    perform pg_temp.as_director();
    perform app.finalize_kr_closure(krcr, 'APPROVE', 'demo', 100);
    raise notice 'closed %', kr.label;
  end loop;

  -- ── quarter closure → permanent record / certificate ─────────────────────
  perform pg_temp.as_la();
  insert into closure_requests (scope_type, scope_id, requested_by, status)
  values ('QUARTER', qid, la, 'READY_FOR_SIGNOFF') returning id into qcr;
  perform pg_temp.as_director();
  perform app.finalize_quarter_closure(qcr, 'APPROVE', 'Q3 demo хаалт');
  raise notice 'quarter closed';
end $$;

commit;

select qc.id as closure_id, e.full_name, qc.weighted_achievement, qc.krs_closed, qc.krs_total
  from quarter_closures qc join employees e on e.id = qc.employee_id;
