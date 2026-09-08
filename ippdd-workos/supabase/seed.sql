-- IPPDD WorkOS seed: org structure, dev personas, quarter, closure profiles,
-- gate rules, and pilot work items. The pilot OKR dataset (from the authoritative
-- workbook IPPDD_OKR_Q3_2026-08-01_v1.0) is applied by supabase/seed_okr.sql,
-- generated from scripts/pilot/la_okr_2026Q3.json — run both.
--
-- Dev persona auth UUIDs (0000…000N) are DEVELOPMENT ONLY: they are used by the
-- gated dev impersonation login (docs/DECISIONS.md D-004). In production,
-- auth_user_id is linked on first Google sign-in via app.link_employee().

begin;

-- Departments ---------------------------------------------------------------
insert into departments (id, code, name) values
  ('d0000000-0000-4000-8000-000000000001','IPPDD',
   'Investment Product & Process Development Department (ХОБПХГ)'),
  ('d0000000-0000-4000-8000-000000000002','ISCMD',
   'Investment Sales & Client Management Department (ХОБХУГ)');

-- Employees -----------------------------------------------------------------
insert into employees (id, auth_user_id, employee_code, email, full_name,
                       department_id, position_title, manager_id, system_role) values
  ('e0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
   'HQ_IPPDD_MJ','munkh-erdene.o@netgroup.mn','О.Мөнх-Эрдэнэ',
   'd0000000-0000-4000-8000-000000000001','Газрын захирал',null,'DIRECTOR'),
  ('e0000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',
   'HQ_IPPDD_LA','lkhagvadari.a@netgroup.mn','А.Лхагвадарь',
   'd0000000-0000-4000-8000-000000000001','Менежер',
   'e0000000-0000-4000-8000-000000000001','EMPLOYEE'),
  ('e0000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003',
   'HQ_IPPDD_OO','onon.or@netgroup.mn','Б.Онон',
   'd0000000-0000-4000-8000-000000000001','Менежер',
   'e0000000-0000-4000-8000-000000000001','REVIEWER'),
  -- development-only administrator persona (not a production identity)
  ('e0000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004',
   'DEV_ADMIN','workos-admin@dev.local','WorkOS Admin (dev)',
   'd0000000-0000-4000-8000-000000000001','System Administrator',null,'ADMIN');

update departments set director_employee_id = 'e0000000-0000-4000-8000-000000000001'
  where code = 'IPPDD';

-- Quarter (dates from the authoritative workbook) ------------------------------
insert into quarters (id, year, quarter, code, start_date, end_date, status) values
  ('a0000000-0000-4000-8000-000000000001', 2026, 3, '2026-Q3',
   date '2026-07-06', date '2026-10-02', 'ACTIVE');

-- Closure profiles (§16) — admin-configurable governance ----------------------
insert into closure_profiles
  (work_type, requires_deliverables, requires_self_qc, required_review_types,
   requires_approval, required_approval_types, requires_implementation,
   requires_validation, requires_metric, requires_evidence, min_evidence_count,
   simplified_closure, notes)
values
  ('POLICY',    true,  true, '{FUNCTIONAL,LEGAL}', true, '{DIRECTOR}', false, false, false, true, 1, false,
   'final deliverable + self QC + functional & legal review + director approval + final version + registration evidence'),
  ('PROCEDURE', true,  true, '{FUNCTIONAL}',       true, '{DIRECTOR}', false, false, false, true, 1, false, null),
  ('STANDARD',  true,  true, '{FUNCTIONAL}',       true, '{DIRECTOR}', false, false, false, true, 1, false, null),
  ('GUIDELINE', true,  true, '{FUNCTIONAL}',       true, '{DIRECTOR}', false, false, false, true, 1, false, null),
  ('PROCESS',   true,  true, '{FUNCTIONAL,PROCESS_OWNER}', true, '{DIRECTOR}', false, false, false, true, 1, false, null),
  ('PROCESS_IMPROVEMENT', true, true, '{FUNCTIONAL}', true, '{DIRECTOR}', true, true, false, true, 2, false,
   'approved design + UAT + acceptance + live implementation + implementation evidence'),
  ('REPORT',    true,  true, '{FUNCTIONAL}',       true, '{DIRECTOR}', false, false, false, true, 1, false,
   'final report + source/data validation + reviewer acceptance + evidence'),
  ('ANALYSIS',  true,  true, '{FUNCTIONAL}',       true, '{DIRECTOR}', false, false, false, true, 1, false, null),
  ('CHANGE_PROPOSAL', true, true, '{FUNCTIONAL}',  true, '{DIRECTOR}', true, true, false, true, 1, false,
   'proposal approval alone is NOT closure: change implemented + implementation validated'),
  ('AI_AGENT',  true,  true, '{FUNCTIONAL,IT}',    true, '{DIRECTOR}', true, true, true, true, 2, false,
   'working version + defined test + test pass + human acceptance + deployment/use evidence + target metric'),
  ('AUTOMATION',true,  true, '{FUNCTIONAL,IT}',    true, '{DIRECTOR}', true, true, true, true, 2, false, null),
  ('PILOT',     true,  true, '{FUNCTIONAL}',       true, '{DIRECTOR}', true, true, true, true, 1, false,
   'pilot completed + acceptance criteria measured + acceptance decision'),
  ('TRAINING',  true,  false,'{FUNCTIONAL}',       true, '{DIRECTOR}', false, true, true, true, 1, false,
   'required completion + completion evidence + assessment threshold when applicable'),
  ('COMMITTEE', true,  true, '{FUNCTIONAL}',       true, '{COMMITTEE}', false, false, false, true, 2, false,
   'material prepared + meeting/decision evidence + decision register updated'),
  ('PROJECT',   true,  true, '{FUNCTIONAL}',       true, '{DIRECTOR}', true, true, false, true, 1, false, null),
  ('SPRINT',    false, true, '{SELF_QC}',          false,'{}',         false, false, false, true, 1, true,
   'simplified closure: sprint work closes on self QC + evidence'),
  ('KPI',       false, false,'{FUNCTIONAL}',       false,'{}',         false, true, true, true, 1, true, null),
  ('BAU',       false, true, '{SELF_QC}',          false,'{}',         false, false, false, true, 1, true,
   'simplified closure for routine BAU'),
  ('AUDIT_ACTION', true, true,'{FUNCTIONAL}',      true, '{DIRECTOR}', true, true, false, true, 1, false, null),
  ('MANAGEMENT_ASSIGNMENT', true, true,'{FUNCTIONAL}', true,'{DIRECTOR}', false, false, false, true, 1, false, null),
  ('OTHER',     true,  true, '{FUNCTIONAL}',       true, '{DIRECTOR}', false, false, false, true, 1, false, null);

-- Gate rules (G1–G7, §17) — engine check keys ---------------------------------
insert into gate_rules (code, name, description, scope_type, rule_type, required, severity) values
  ('G1-DELIV','G1 Deliverable','All required deliverables exist; final version where required','WORK_ITEM','DELIVERABLES_COMPLETE',true,'CRITICAL'),
  ('G2-SELFQC','G2 Self QC','Owner self-QC review passed','WORK_ITEM','SELF_QC_PASSED',true,'HIGH'),
  ('G3-REVIEW','G3 Review','All required review types passed','WORK_ITEM','REVIEWS_PASSED',true,'CRITICAL'),
  ('G4-APPROVAL','G4 Approval / Sign-off','All required approvals granted, version-referenced','WORK_ITEM','APPROVALS_PASSED',true,'CRITICAL'),
  ('G5-IMPL','G5 Implementation','Implementation requirement satisfied (LIVE/PILOT/NOT_REQUIRED)','WORK_ITEM','IMPLEMENTATION_SATISFIED',true,'CRITICAL'),
  ('G6-METRIC','G6 Outcome / Metric Validation','Metric validations passed','WORK_ITEM','METRIC_SATISFIED',true,'HIGH'),
  ('G7-EVIDENCE','G7 Evidence Lock / Closure Readiness','Minimum evidence attached; no open critical findings','WORK_ITEM','EVIDENCE_SUFFICIENT',true,'HIGH'),
  ('W-DEADLINE','Deadline check','Warn when the work item is past its deadline','WORK_ITEM','DEADLINE_CHECK',false,'MEDIUM'),
  ('W-VERSION','Version integrity','Warn when an approved deliverable changed in Drive after approval','WORK_ITEM','VERSION_INTEGRITY',false,'HIGH'),
  ('KR-WORK','KR: governed work closed','All governed work items under the KR are closed','KEY_RESULT','KR_WORK_CLOSED',true,'CRITICAL'),
  ('KR-METRIC','KR: metric achieved','KR metric validations passed','KEY_RESULT','KR_METRIC_SATISFIED',true,'CRITICAL'),
  ('Q-KRS','Quarter: KRs closed','All KRs of the employee''s quarter are closed','QUARTER','QUARTER_KRS_CLOSED',true,'CRITICAL'),
  ('Q-EVIDENCE','Quarter: evidence completeness','Evidence completeness across the quarter''s work','QUARTER','QUARTER_EVIDENCE',false,'MEDIUM');

commit;
