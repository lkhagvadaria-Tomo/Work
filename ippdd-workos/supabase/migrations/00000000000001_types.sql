-- Closed vocabularies as PostgreSQL enums (see docs/DECISIONS.md D-009).
create extension if not exists pgcrypto;

create type system_role as enum (
  'EMPLOYEE','REVIEWER','APPROVER','MANAGER','DIRECTOR','ADMIN'
);

create type quarter_status as enum (
  'PLANNING','ACTIVE','CLOSING','CLOSED','ARCHIVED'
);

create type objective_status as enum (
  'DRAFT','ACTIVE','CLOSED','CANCELLED'
);

create type kr_status as enum (
  'NOT_STARTED','IN_PROGRESS','AT_RISK','ACHIEVED','CLOSED','CANCELLED'
);

create type work_type as enum (
  'POLICY','PROCEDURE','STANDARD','GUIDELINE','PROCESS','PROCESS_IMPROVEMENT',
  'REPORT','ANALYSIS','CHANGE_PROPOSAL','AI_AGENT','AUTOMATION','PILOT','TRAINING',
  'COMMITTEE','PROJECT','SPRINT','KPI','BAU','AUDIT_ACTION','MANAGEMENT_ASSIGNMENT','OTHER'
);

create type work_priority as enum ('LOW','MEDIUM','HIGH','CRITICAL');

create type work_status as enum (
  'NOT_STARTED','IN_PROGRESS','SUBMITTED','UNDER_REVIEW','REVIEW_PASSED',
  'WAITING_APPROVAL','APPROVED','IMPLEMENTATION','VALIDATION','CLOSED',
  'RETURNED','BLOCKED','REJECTED','CANCELLED'
);

create type deliverable_status as enum (
  'WORKING','REVIEW_CANDIDATE','APPROVED','SUPERSEDED'
);

create type evidence_type as enum (
  'DOCUMENT','SPREADSHEET','PRESENTATION','SCREENSHOT','REPORT','EMAIL',
  'MEETING_DECISION','UAT','PRODUCTION','METRIC','APPROVAL','TRAINING','SYSTEM_LOG','OTHER'
);

create type review_type as enum (
  'SELF_QC','FUNCTIONAL','LEGAL','COMPLIANCE','RISK','IT','SECURITY',
  'PROCESS_OWNER','DIRECTOR','OTHER'
);

create type review_decision as enum ('PENDING','PASS','RETURN','REJECT');

create type approval_type as enum (
  'FUNCTIONAL','DIRECTOR','COMMITTEE','EXECUTIVE','FINAL_SIGNOFF','OTHER'
);

create type approval_decision as enum ('PENDING','APPROVE','RETURN','REJECT');

create type implementation_status as enum (
  'NOT_REQUIRED','NOT_STARTED','IN_PROGRESS','PILOT','LIVE','FAILED','ROLLED_BACK'
);

create type validation_status as enum ('PENDING','PASS','FAIL','NOT_APPLICABLE');

create type gate_result as enum ('PASS','WARNING','FAIL','NOT_APPLICABLE');

create type gate_scope as enum ('WORK_ITEM','KEY_RESULT','QUARTER');

create type finding_severity as enum ('INFO','LOW','MEDIUM','HIGH','CRITICAL');

create type closure_status as enum (
  'PENDING','GATE_FAILED','READY_FOR_SIGNOFF','APPROVED','REJECTED','CANCELLED'
);

create type target_operator as enum ('GTE','LTE','GT','LT','EQ','BOOLEAN');
