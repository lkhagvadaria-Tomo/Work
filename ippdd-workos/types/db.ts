/** Domain types mirroring the SQL schema (supabase/migrations). */

export type SystemRole =
  | "EMPLOYEE" | "REVIEWER" | "APPROVER" | "MANAGER" | "DIRECTOR" | "ADMIN";

export type QuarterStatus = "PLANNING" | "ACTIVE" | "CLOSING" | "CLOSED" | "ARCHIVED";
export type ObjectiveStatus = "DRAFT" | "ACTIVE" | "CLOSED" | "CANCELLED";
export type KrStatus =
  | "NOT_STARTED" | "IN_PROGRESS" | "AT_RISK" | "ACHIEVED" | "CLOSED" | "CANCELLED";

export type WorkType =
  | "POLICY" | "PROCEDURE" | "STANDARD" | "GUIDELINE" | "PROCESS"
  | "PROCESS_IMPROVEMENT" | "REPORT" | "ANALYSIS" | "CHANGE_PROPOSAL"
  | "AI_AGENT" | "AUTOMATION" | "PILOT" | "TRAINING" | "COMMITTEE"
  | "PROJECT" | "SPRINT" | "KPI" | "BAU" | "AUDIT_ACTION"
  | "MANAGEMENT_ASSIGNMENT" | "OTHER";

export type WorkPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type WorkStatus =
  | "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "UNDER_REVIEW"
  | "REVIEW_PASSED" | "WAITING_APPROVAL" | "APPROVED" | "IMPLEMENTATION"
  | "VALIDATION" | "CLOSED" | "RETURNED" | "BLOCKED" | "REJECTED" | "CANCELLED";

export type DeliverableStatus = "WORKING" | "REVIEW_CANDIDATE" | "APPROVED" | "SUPERSEDED";

export type EvidenceType =
  | "DOCUMENT" | "SPREADSHEET" | "PRESENTATION" | "SCREENSHOT" | "REPORT"
  | "EMAIL" | "MEETING_DECISION" | "UAT" | "PRODUCTION" | "METRIC"
  | "APPROVAL" | "TRAINING" | "SYSTEM_LOG" | "OTHER";

export type ReviewType =
  | "SELF_QC" | "FUNCTIONAL" | "LEGAL" | "COMPLIANCE" | "RISK" | "IT"
  | "SECURITY" | "PROCESS_OWNER" | "DIRECTOR" | "OTHER";

export type ReviewDecision = "PENDING" | "PASS" | "RETURN" | "REJECT";

export type ApprovalType =
  | "FUNCTIONAL" | "DIRECTOR" | "COMMITTEE" | "EXECUTIVE" | "FINAL_SIGNOFF" | "OTHER";

export type ApprovalDecision = "PENDING" | "APPROVE" | "RETURN" | "REJECT";

export type ImplementationStatus =
  | "NOT_REQUIRED" | "NOT_STARTED" | "IN_PROGRESS" | "PILOT" | "LIVE"
  | "FAILED" | "ROLLED_BACK";

export type ValidationStatus = "PENDING" | "PASS" | "FAIL" | "NOT_APPLICABLE";
export type GateResult = "PASS" | "WARNING" | "FAIL" | "NOT_APPLICABLE";
export type GateScope = "WORK_ITEM" | "KEY_RESULT" | "QUARTER";
export type FindingSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ClosureStatus =
  | "PENDING" | "GATE_FAILED" | "READY_FOR_SIGNOFF" | "APPROVED" | "REJECTED" | "CANCELLED";
export type TargetOperator = "GTE" | "LTE" | "GT" | "LT" | "EQ" | "BOOLEAN";

export interface Employee {
  id: string;
  auth_user_id: string | null;
  employee_code: string;
  email: string;
  full_name: string;
  department_id: string;
  position_title: string | null;
  manager_id: string | null;
  system_role: SystemRole;
  active: boolean;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  parent_department_id: string | null;
  director_employee_id: string | null;
  active: boolean;
}

export interface Quarter {
  id: string;
  year: number;
  quarter: number;
  code: string;
  start_date: string;
  end_date: string;
  status: QuarterStatus;
}

export interface Objective {
  id: string;
  employee_id: string;
  quarter_id: string;
  objective_code: string;
  title: string;
  description: string | null;
  weight: string; // numeric comes back as string from pg
  status: ObjectiveStatus;
}

export interface KeyResult {
  id: string;
  objective_id: string;
  kr_code: string;
  title: string;
  description: string | null;
  weight: string;
  target_description: string | null;
  target_value: string | null;
  target_unit: string | null;
  measurement_method: string | null;
  baseline: string | null;
  deadline: string | null;
  status: KrStatus;
  achievement_value: string | null;
  achievement_percent: string | null;
  closed_at: string | null;
}

export interface WorkItem {
  id: string;
  key_result_id: string | null;
  owner_id: string;
  department_id: string;
  quarter_id: string;
  work_code: string;
  title: string;
  description: string | null;
  work_type: WorkType;
  priority: WorkPriority;
  definition_of_done: string | null;
  acceptance_criteria: string | null;
  start_date: string | null;
  deadline: string | null;
  status: WorkStatus;
  reviewer_id: string | null;
  approver_id: string | null;
  implementation_required: boolean;
  validation_required: boolean;
  created_by: string;
  created_at: string;
  submitted_at: string | null;
  closed_at: string | null;
}

export interface DeliverableRequirement {
  id: string;
  work_item_id: string;
  name: string;
  description: string | null;
  required: boolean;
  sequence: number;
  require_final_version: boolean;
}

export interface Deliverable {
  id: string;
  work_item_id: string;
  requirement_id: string | null;
  name: string;
  drive_file_id: string | null;
  drive_url: string | null;
  drive_name: string | null;
  mime_type: string | null;
  version: string;
  status: DeliverableStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  final_version: boolean;
  drive_modified_time: string | null;
  approved_modified_time: string | null;
}

export interface Evidence {
  id: string;
  work_item_id: string;
  deliverable_id: string | null;
  evidence_type: EvidenceType;
  title: string;
  description: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  external_url: string | null;
  source_system: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  created_by: string;
  created_at: string;
}

export interface Review {
  id: string;
  work_item_id: string;
  reviewer_id: string;
  review_type: ReviewType;
  deliverable_version: string | null;
  decision: ReviewDecision;
  comment: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface Approval {
  id: string;
  work_item_id: string;
  approver_id: string;
  approval_type: ApprovalType;
  deliverable_version: string | null;
  decision: ApprovalDecision;
  comment: string | null;
  requested_at: string;
  approved_at: string | null;
}

export interface ImplementationRecord {
  id: string;
  work_item_id: string;
  implementation_status: ImplementationStatus;
  environment: string | null;
  implemented_at: string | null;
  implemented_by: string | null;
  evidence_id: string | null;
  comment: string | null;
}

export interface MetricValidation {
  id: string;
  key_result_id: string | null;
  work_item_id: string | null;
  metric_name: string;
  target_operator: TargetOperator;
  target_value: string | null;
  actual_value: string | null;
  unit: string | null;
  validation_status: ValidationStatus;
  evidence_id: string | null;
  validated_by: string | null;
  validated_at: string | null;
}

export interface ClosureProfile {
  id: string;
  work_type: WorkType;
  requires_deliverables: boolean;
  requires_self_qc: boolean;
  required_review_types: ReviewType[];
  requires_approval: boolean;
  required_approval_types: ApprovalType[];
  requires_implementation: boolean;
  requires_validation: boolean;
  requires_metric: boolean;
  requires_evidence: boolean;
  min_evidence_count: number;
  simplified_closure: boolean;
  notes: string | null;
}

export interface GateRun {
  id: string;
  scope_type: GateScope;
  scope_id: string;
  gate_type: string;
  result: GateResult;
  total_checks: number;
  passed_checks: number;
  warning_checks: number;
  failed_checks: number;
  run_by: string | null;
  run_source: string;
  started_at: string;
  completed_at: string | null;
}

export interface GateFinding {
  id: string;
  gate_run_id: string;
  rule_id: string | null;
  severity: FindingSeverity;
  result: GateResult;
  title: string;
  description: string | null;
  recommended_action: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  resolved: boolean;
}

export interface ClosureRequest {
  id: string;
  scope_type: GateScope;
  scope_id: string;
  requested_by: string;
  requested_at: string;
  gate_run_id: string | null;
  status: ClosureStatus;
  final_approver_id: string | null;
  final_decision: ApprovalDecision | null;
  final_comment: string | null;
  finalized_at: string | null;
}

export interface NotificationRow {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}
