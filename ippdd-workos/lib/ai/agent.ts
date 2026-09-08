import "server-only";
import { withUser } from "@/lib/db";
import type { Session } from "@/lib/auth/session";

/**
 * Grounded context builder for the IPPDD Closure & Governance Agent (§19).
 * Pulls ONLY authoritative structured rows the user is allowed to see (RLS
 * applies inside withUser). The agent receives this text and must not go
 * beyond it — missing data stays missing.
 */
export async function buildAgentContext(session: Session): Promise<string> {
  return withUser(session.authUid, async (tx) => {
    const [krs, work, reviews, approvals, closures, findings, notifications] =
      await Promise.all([
        tx.query<Record<string, unknown>>(
          `select o.objective_code || '-' || k.kr_code as kr, k.title, k.weight, k.deadline,
                  k.status, k.achievement_percent,
                  (select count(*) from work_items w where w.key_result_id = k.id
                     and w.status not in ('CLOSED','CANCELLED')) as open_work
             from key_results k join objectives o on o.id = k.objective_id
            where o.employee_id = $1 order by kr`,
          [session.employee.id],
        ),
        tx.query<Record<string, unknown>>(
          `select w.work_code, w.title, w.status, w.deadline, w.work_type,
                  (select count(*) from evidence e where e.work_item_id = w.id) as evidence_count,
                  (select count(*) from deliverables d where d.work_item_id = w.id and d.final_version) as final_deliverables,
                  (select o.objective_code || '-' || k.kr_code
                     from key_results k join objectives o on o.id = k.objective_id
                    where k.id = w.key_result_id) as kr
             from work_items w where w.owner_id = $1 order by w.work_code`,
          [session.employee.id],
        ),
        tx.query<Record<string, unknown>>(
          `select w.work_code, r.review_type, r.decision, e.full_name as reviewer
             from reviews r join work_items w on w.id = r.work_item_id
             join employees e on e.id = r.reviewer_id
            where w.owner_id = $1 or r.reviewer_id = $1
            order by r.created_at desc limit 30`,
          [session.employee.id],
        ),
        tx.query<Record<string, unknown>>(
          `select w.work_code, a.approval_type, a.decision, a.deliverable_version,
                  e.full_name as approver
             from approvals a join work_items w on w.id = a.work_item_id
             join employees e on e.id = a.approver_id
            where w.owner_id = $1 or a.approver_id = $1
            order by a.created_at desc limit 30`,
          [session.employee.id],
        ),
        tx.query<Record<string, unknown>>(
          `select cr.scope_type, cr.status,
                  (select g.result from gate_runs g where g.id = cr.gate_run_id) as gate_result,
                  case cr.scope_type
                    when 'WORK_ITEM' then (select work_code from work_items where id = cr.scope_id)
                    when 'KEY_RESULT' then (select o.objective_code || '-' || k.kr_code
                                              from key_results k join objectives o on o.id = k.objective_id
                                             where k.id = cr.scope_id)
                    else 'QUARTER' end as scope_label
             from closure_requests cr
            where cr.requested_by = $1 order by cr.created_at desc limit 10`,
          [session.employee.id],
        ),
        tx.query<Record<string, unknown>>(
          `select f.severity, f.result, f.title, f.recommended_action
             from gate_findings f join gate_runs g on g.id = f.gate_run_id
            where g.run_by = $1 and not f.resolved and f.result in ('FAIL','WARNING')
            order by f.created_at desc limit 20`,
          [session.employee.id],
        ),
        tx.query<Record<string, unknown>>(
          `select type, title, message, created_at from notifications
            where read_at is null order by created_at desc limit 10`,
        ),
      ]);

    const today = new Date().toISOString().slice(0, 10);
    const block = (name: string, rows: Record<string, unknown>[]) =>
      `## ${name}\n${rows.length === 0 ? "(бүртгэл алга)" : JSON.stringify(rows, null, 0)}`;

    return [
      `Огноо: ${today}`,
      `Хэрэглэгч: ${session.employee.full_name} (${session.employee.system_role})`,
      block("Миний KR-үүд", krs.rows),
      block("Миний ажлууд", work.rows),
      block("Review-үүд", reviews.rows),
      block("Батлалууд", approvals.rows),
      block("Хаалтын хүсэлтүүд", closures.rows),
      block("Нээлттэй gate finding-үүд", findings.rows),
      block("Уншаагүй мэдэгдлүүд", notifications.rows),
    ].join("\n\n");
  });
}
