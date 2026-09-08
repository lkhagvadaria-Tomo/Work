-- Core relational model (master prompt §7). Governance-critical integrity lives here,
-- never only in the UI (§8).

-- 7.1 departments ------------------------------------------------------------
create table departments (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name                  text not null,
  parent_department_id  uuid references departments(id) on delete restrict,
  director_employee_id  uuid, -- fk added after employees exists
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 7.2 employees --------------------------------------------------------------
create table employees (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid unique,          -- linked on first successful Google sign-in
  employee_code  text not null unique,
  email          text not null unique check (position('@' in email) > 1),
  full_name      text not null,
  department_id  uuid not null references departments(id) on delete restrict,
  position_title text,
  manager_id     uuid references employees(id) on delete set null,
  system_role    system_role not null default 'EMPLOYEE',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (manager_id is distinct from id)
);

alter table departments
  add constraint departments_director_fk
  foreign key (director_employee_id) references employees(id) on delete set null;

create index employees_department_idx on employees(department_id);
create index employees_manager_idx on employees(manager_id);

-- 7.3 quarters ---------------------------------------------------------------
create table quarters (
  id         uuid primary key default gen_random_uuid(),
  year       int not null check (year between 2020 and 2100),
  quarter    int not null check (quarter between 1 and 4),
  code       text not null unique,     -- e.g. 2026-Q3
  start_date date not null,
  end_date   date not null,
  status     quarter_status not null default 'PLANNING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, quarter),
  check (end_date > start_date),
  check (code = format('%s-Q%s', year, quarter))
);

-- 7.4 objectives -------------------------------------------------------------
create table objectives (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references employees(id) on delete restrict,
  quarter_id     uuid not null references quarters(id) on delete restrict,
  objective_code text not null check (objective_code ~ '^O[0-9]+$'),
  title          text not null,
  description    text,
  weight         numeric(5,2) not null check (weight >= 0 and weight <= 100),
  status         objective_status not null default 'ACTIVE',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, quarter_id, objective_code)
);

create index objectives_employee_quarter_idx on objectives(employee_id, quarter_id);

-- 7.5 key_results ------------------------------------------------------------
create table key_results (
  id                  uuid primary key default gen_random_uuid(),
  objective_id        uuid not null references objectives(id) on delete restrict,
  kr_code             text not null check (kr_code ~ '^KR[0-9]+$'),
  title               text not null,
  description         text,
  weight              numeric(5,2) not null check (weight >= 0 and weight <= 100),
  target_description  text,
  target_value        numeric,
  target_unit         text,
  measurement_method  text,
  baseline            text,
  deadline            date,
  status              kr_status not null default 'NOT_STARTED',
  achievement_value   numeric,
  achievement_percent numeric(5,2) check (achievement_percent between 0 and 100),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  closed_at           timestamptz,
  unique (objective_id, kr_code),
  check (status <> 'CLOSED' or closed_at is not null)
);

create index key_results_objective_idx on key_results(objective_id);

-- 7.6 work_items -------------------------------------------------------------
create table work_items (
  id                      uuid primary key default gen_random_uuid(),
  key_result_id           uuid references key_results(id) on delete restrict,
  owner_id                uuid not null references employees(id) on delete restrict,
  department_id           uuid not null references departments(id) on delete restrict,
  quarter_id              uuid not null references quarters(id) on delete restrict,
  work_code               text not null unique,
  title                   text not null,
  description             text,
  work_type               work_type not null,
  priority                work_priority not null default 'MEDIUM',
  definition_of_done      text,
  acceptance_criteria     text,
  start_date              date,
  deadline                date,
  status                  work_status not null default 'NOT_STARTED',
  reviewer_id             uuid references employees(id) on delete set null,
  approver_id             uuid references employees(id) on delete set null,
  implementation_required boolean not null default false,
  validation_required     boolean not null default false,
  created_by              uuid not null references employees(id) on delete restrict,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  submitted_at            timestamptz,
  closed_at               timestamptz,
  check (status <> 'CLOSED' or closed_at is not null),
  -- segregation of duties: independent approval (§9)
  check (approver_id is distinct from owner_id)
);

create index work_items_owner_idx on work_items(owner_id);
create index work_items_kr_idx on work_items(key_result_id);
create index work_items_status_idx on work_items(status);
create index work_items_reviewer_idx on work_items(reviewer_id);
create index work_items_approver_idx on work_items(approver_id);
create index work_items_dept_quarter_idx on work_items(department_id, quarter_id);

-- 7.7 deliverable_requirements ----------------------------------------------
create table deliverable_requirements (
  id                    uuid primary key default gen_random_uuid(),
  work_item_id          uuid not null references work_items(id) on delete cascade,
  name                  text not null,
  description           text,
  required              boolean not null default true,
  sequence              int not null default 1 check (sequence > 0),
  require_final_version boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (work_item_id, name)
);

-- 7.8 deliverables -----------------------------------------------------------
create table deliverables (
  id             uuid primary key default gen_random_uuid(),
  work_item_id   uuid not null references work_items(id) on delete cascade,
  requirement_id uuid references deliverable_requirements(id) on delete set null,
  name           text not null,
  drive_file_id  text,
  drive_url      text check (drive_url is null or drive_url ~* '^https://(docs|drive)\.google\.com/'),
  drive_name     text,
  mime_type      text,
  version        text not null default 'v0.1' check (version ~ '^v[0-9]+\.[0-9]+$'),
  status         deliverable_status not null default 'WORKING',
  submitted_by   uuid references employees(id) on delete set null,
  submitted_at   timestamptz,
  final_version  boolean not null default false,
  -- Drive metadata snapshot for changed-after-approval detection (D-008)
  drive_modified_time timestamptz,
  approved_modified_time timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index deliverables_work_item_idx on deliverables(work_item_id);
create index deliverables_requirement_idx on deliverables(requirement_id);

-- 7.9 evidence ---------------------------------------------------------------
create table evidence (
  id             uuid primary key default gen_random_uuid(),
  work_item_id   uuid not null references work_items(id) on delete cascade,
  deliverable_id uuid references deliverables(id) on delete set null,
  evidence_type  evidence_type not null,
  title          text not null,
  description    text,
  drive_file_id  text,
  drive_url      text check (drive_url is null or drive_url ~* '^https://(docs|drive)\.google\.com/'),
  external_url   text check (external_url is null or external_url ~* '^https://'),
  source_system  text,
  verified       boolean not null default false,
  verified_by    uuid references employees(id) on delete set null,
  verified_at    timestamptz,
  created_by     uuid not null references employees(id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (verified = false or (verified_by is not null and verified_at is not null)),
  check (drive_file_id is not null or drive_url is not null or external_url is not null or description is not null)
);

create index evidence_work_item_idx on evidence(work_item_id);

-- 7.10 reviews ---------------------------------------------------------------
create table reviews (
  id                  uuid primary key default gen_random_uuid(),
  work_item_id        uuid not null references work_items(id) on delete cascade,
  reviewer_id         uuid not null references employees(id) on delete restrict,
  review_type         review_type not null,
  deliverable_version text,
  decision            review_decision not null default 'PENDING',
  comment             text,
  created_at          timestamptz not null default now(),
  reviewed_at         timestamptz,
  check (decision = 'PENDING' or reviewed_at is not null),
  check (decision not in ('RETURN','REJECT') or (comment is not null and length(trim(comment)) > 0))
);

create index reviews_work_item_idx on reviews(work_item_id);
create index reviews_reviewer_idx on reviews(reviewer_id) where decision = 'PENDING';
-- one open review per (work item, review type, reviewer)
create unique index reviews_one_pending
  on reviews(work_item_id, review_type, reviewer_id) where decision = 'PENDING';

-- 7.11 approvals -------------------------------------------------------------
create table approvals (
  id                  uuid primary key default gen_random_uuid(),
  work_item_id        uuid not null references work_items(id) on delete cascade,
  approver_id         uuid not null references employees(id) on delete restrict,
  approval_type       approval_type not null,
  deliverable_version text,
  decision            approval_decision not null default 'PENDING',
  comment             text,
  requested_at        timestamptz not null default now(),
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (decision <> 'APPROVE' or approved_at is not null),
  check (decision not in ('RETURN','REJECT') or (comment is not null and length(trim(comment)) > 0))
);

create index approvals_work_item_idx on approvals(work_item_id);
create index approvals_approver_idx on approvals(approver_id) where decision = 'PENDING';
-- prevent duplicate active approval request for the same stage (§8)
create unique index approvals_one_pending
  on approvals(work_item_id, approval_type) where decision = 'PENDING';

-- 7.12 implementation_records -------------------------------------------------
create table implementation_records (
  id                    uuid primary key default gen_random_uuid(),
  work_item_id          uuid not null references work_items(id) on delete cascade,
  implementation_status implementation_status not null default 'NOT_STARTED',
  environment           text,
  implemented_at        timestamptz,
  implemented_by        uuid references employees(id) on delete set null,
  evidence_id           uuid references evidence(id) on delete set null,
  comment               text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (implementation_status not in ('LIVE','PILOT') or implemented_at is not null)
);

create index implementation_records_work_item_idx on implementation_records(work_item_id);

-- 7.13 metric_validations ------------------------------------------------------
create table metric_validations (
  id                uuid primary key default gen_random_uuid(),
  key_result_id     uuid references key_results(id) on delete cascade,
  work_item_id      uuid references work_items(id) on delete cascade,
  metric_name       text not null,
  target_operator   target_operator not null default 'GTE',
  target_value      numeric,
  actual_value      numeric,
  unit              text,
  validation_status validation_status not null default 'PENDING',
  evidence_id       uuid references evidence(id) on delete set null,
  validated_by      uuid references employees(id) on delete set null,
  validated_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (key_result_id is not null or work_item_id is not null),
  check (validation_status not in ('PASS','FAIL') or (validated_by is not null and validated_at is not null))
);

create index metric_validations_kr_idx on metric_validations(key_result_id);
create index metric_validations_work_idx on metric_validations(work_item_id);

-- 7.14 gate_rules --------------------------------------------------------------
create table gate_rules (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  description   text,
  scope_type    gate_scope not null default 'WORK_ITEM',
  work_type     work_type,             -- null = applies to all work types
  rule_type     text not null,         -- engine check key, e.g. 'DELIVERABLES_COMPLETE'
  required      boolean not null default true,
  severity      finding_severity not null default 'HIGH',
  configuration jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- work-type closure profiles (§16) — configurable without code changes (§34)
create table closure_profiles (
  id                       uuid primary key default gen_random_uuid(),
  work_type                work_type not null unique,
  requires_deliverables    boolean not null default true,
  requires_self_qc         boolean not null default true,
  required_review_types    review_type[] not null default '{FUNCTIONAL}',
  requires_approval        boolean not null default true,
  required_approval_types  approval_type[] not null default '{DIRECTOR}',
  requires_implementation  boolean not null default false,
  requires_validation      boolean not null default false,
  requires_metric          boolean not null default false,
  requires_evidence        boolean not null default true,
  min_evidence_count       int not null default 1 check (min_evidence_count >= 0),
  simplified_closure       boolean not null default false,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- 7.15 gate_runs ---------------------------------------------------------------
create table gate_runs (
  id             uuid primary key default gen_random_uuid(),
  scope_type     gate_scope not null,
  scope_id       uuid not null,
  gate_type      text not null default 'CLOSURE',
  result         gate_result not null,
  total_checks   int not null default 0 check (total_checks >= 0),
  passed_checks  int not null default 0 check (passed_checks >= 0),
  warning_checks int not null default 0 check (warning_checks >= 0),
  failed_checks  int not null default 0 check (failed_checks >= 0),
  run_by         uuid references employees(id) on delete set null,
  run_source     text not null default 'USER',   -- USER | SYSTEM | SCHEDULER
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  check (passed_checks + warning_checks + failed_checks <= total_checks)
);

create index gate_runs_scope_idx on gate_runs(scope_type, scope_id, started_at desc);

-- 7.16 gate_findings -----------------------------------------------------------
create table gate_findings (
  id                  uuid primary key default gen_random_uuid(),
  gate_run_id         uuid not null references gate_runs(id) on delete cascade,
  rule_id             uuid references gate_rules(id) on delete set null,
  severity            finding_severity not null,
  result              gate_result not null,
  title               text not null,
  description         text,
  recommended_action  text,
  related_entity_type text,
  related_entity_id   uuid,
  resolved            boolean not null default false,
  resolved_by         uuid references employees(id) on delete set null,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  check (resolved = false or (resolved_by is not null and resolved_at is not null))
);

create index gate_findings_run_idx on gate_findings(gate_run_id);

-- 7.17 closure_requests --------------------------------------------------------
create table closure_requests (
  id                uuid primary key default gen_random_uuid(),
  scope_type        gate_scope not null,
  scope_id          uuid not null,
  requested_by      uuid not null references employees(id) on delete restrict,
  requested_at      timestamptz not null default now(),
  gate_run_id       uuid references gate_runs(id) on delete set null,
  status            closure_status not null default 'PENDING',
  final_approver_id uuid references employees(id) on delete set null,
  final_decision    approval_decision,
  final_comment     text,
  finalized_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (status not in ('APPROVED','REJECTED') or (final_approver_id is not null and finalized_at is not null))
);

create index closure_requests_scope_idx on closure_requests(scope_type, scope_id);
-- one open closure request per scope (§8, §44)
create unique index closure_requests_one_open
  on closure_requests(scope_type, scope_id)
  where status in ('PENDING','READY_FOR_SIGNOFF');

-- quarter closure record / certificate (§32–33)
create table quarter_closures (
  id                    uuid primary key default gen_random_uuid(),
  quarter_id            uuid not null references quarters(id) on delete restrict,
  employee_id           uuid not null references employees(id) on delete restrict,
  closure_request_id    uuid not null references closure_requests(id) on delete restrict,
  weighted_achievement  numeric(5,2),
  evidence_completeness numeric(5,2),
  krs_total             int not null,
  krs_closed            int not null,
  final_gate_result     gate_result not null,
  final_approver_id     uuid not null references employees(id) on delete restrict,
  approved_at           timestamptz not null default now(),
  unique (quarter_id, employee_id)
);

-- 7.18 audit_logs --------------------------------------------------------------
create table audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references employees(id) on delete set null,
  entity_type text not null,
  entity_id   uuid,
  action      text not null,
  old_values  jsonb,
  new_values  jsonb,
  request_id  text,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index audit_logs_entity_idx on audit_logs(entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on audit_logs(actor_id, created_at desc);

-- 7.19 notifications -----------------------------------------------------------
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references employees(id) on delete cascade,
  type         text not null,
  title        text not null,
  message      text,
  entity_type  text,
  entity_id    uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_recipient_idx on notifications(recipient_id, created_at desc)
  where read_at is null;

-- work state machine: allowed transitions defined centrally (§15) -------------
create table work_state_transitions (
  from_status work_status not null,
  to_status   work_status not null,
  primary key (from_status, to_status)
);

insert into work_state_transitions (from_status, to_status) values
  ('NOT_STARTED','IN_PROGRESS'), ('NOT_STARTED','CANCELLED'),
  ('IN_PROGRESS','SUBMITTED'),   ('IN_PROGRESS','BLOCKED'), ('IN_PROGRESS','CANCELLED'),
  ('SUBMITTED','UNDER_REVIEW'),  ('SUBMITTED','RETURNED'),
  ('UNDER_REVIEW','REVIEW_PASSED'), ('UNDER_REVIEW','RETURNED'), ('UNDER_REVIEW','REJECTED'),
  ('REVIEW_PASSED','WAITING_APPROVAL'),
  ('WAITING_APPROVAL','APPROVED'), ('WAITING_APPROVAL','RETURNED'), ('WAITING_APPROVAL','REJECTED'),
  ('APPROVED','IMPLEMENTATION'), ('APPROVED','VALIDATION'),
  ('IMPLEMENTATION','VALIDATION'), ('IMPLEMENTATION','BLOCKED'),
  ('VALIDATION','BLOCKED'),
  ('RETURNED','IN_PROGRESS'), ('RETURNED','CANCELLED'),
  ('BLOCKED','IN_PROGRESS'),  ('BLOCKED','CANCELLED'),
  ('REJECTED','IN_PROGRESS'), ('REJECTED','CANCELLED'),
  -- CLOSED is additionally guarded by the closure flag (see triggers migration):
  ('APPROVED','CLOSED'), ('IMPLEMENTATION','CLOSED'), ('VALIDATION','CLOSED'),
  ('IN_PROGRESS','CLOSED'); -- simplified-closure work types only; flag + profile enforced
