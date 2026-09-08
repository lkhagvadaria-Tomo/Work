"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";

/**
 * Admin configuration actions. RLS restricts every write to system_role=ADMIN;
 * these wrappers add validation + audit. All admin actions remain audited (§9).
 */

function fail(msg: string): never {
  redirect(`/error?m=${encodeURIComponent(msg)}`);
}

const employeeSchema = z.object({
  employee_code: z.string().min(2).max(40),
  email: z.string().email(),
  full_name: z.string().min(2).max(200),
  department_id: z.string().uuid(),
  position_title: z.string().max(200).optional().or(z.literal("")),
  manager_id: z.string().uuid().optional().or(z.literal("")),
  system_role: z.enum(["EMPLOYEE", "REVIEWER", "APPROVER", "MANAGER", "DIRECTOR", "ADMIN"]),
});

export async function upsertEmployee(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = employeeSchema.safeParse({
    employee_code: formData.get("employee_code"),
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    department_id: formData.get("department_id"),
    position_title: formData.get("position_title") || "",
    manager_id: formData.get("manager_id") || "",
    system_role: formData.get("system_role"),
  });
  if (!parsed.success) fail("Ажилтны талбар буруу: " + parsed.error.issues[0]?.message);
  const d = parsed.data;
  try {
    await withUser(session.authUid, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into employees (employee_code, email, full_name, department_id,
           position_title, manager_id, system_role)
         values ($1, $2, $3, $4, nullif($5,''), nullif($6,'')::uuid, $7::system_role)
         on conflict (email) do update set
           employee_code = excluded.employee_code,
           full_name = excluded.full_name,
           department_id = excluded.department_id,
           position_title = excluded.position_title,
           manager_id = excluded.manager_id,
           system_role = excluded.system_role
         returning id`,
        [d.employee_code, d.email, d.full_name, d.department_id,
         d.position_title ?? "", d.manager_id ?? "", d.system_role],
      );
      await tx.query("select app.audit('employee', $1, 'ADMIN_UPSERT', null, $2)", [
        rows[0].id, JSON.stringify({ email: d.email, role: d.system_role }),
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Хадгалж чадсангүй (админ эрх шаардлагатай)");
  }
  revalidatePath("/admin");
}

export async function setEmployeeActive(employeeId: string, active: boolean): Promise<void> {
  const session = await requireSession();
  try {
    await withUser(session.authUid, async (tx) => {
      const { rowCount } = await tx.query(
        "update employees set active = $1 where id = $2", [active, employeeId],
      );
      if (!rowCount) throw new Error("Админ эрх шаардлагатай");
      await tx.query("select app.audit('employee', $1, $2)", [
        employeeId, active ? "ACTIVATE" : "DEACTIVATE",
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Өөрчилж чадсангүй");
  }
  revalidatePath("/admin");
}

export async function updateClosureProfile(formData: FormData): Promise<void> {
  const session = await requireSession();
  const workType = formData.get("work_type") as string;
  if (!workType) fail("work_type дутуу");
  const flags = [
    "requires_deliverables", "requires_self_qc", "requires_approval",
    "requires_implementation", "requires_validation", "requires_metric",
    "requires_evidence", "simplified_closure",
  ] as const;
  const values = Object.fromEntries(flags.map((f) => [f, formData.get(f) === "on"]));
  const minEvidence = Math.max(0, Math.min(10, Number(formData.get("min_evidence_count") ?? 1) || 0));
  try {
    await withUser(session.authUid, async (tx) => {
      const { rowCount } = await tx.query(
        `update closure_profiles set
           requires_deliverables=$2, requires_self_qc=$3, requires_approval=$4,
           requires_implementation=$5, requires_validation=$6, requires_metric=$7,
           requires_evidence=$8, simplified_closure=$9, min_evidence_count=$10
         where work_type = $1::work_type`,
        [workType, values.requires_deliverables, values.requires_self_qc,
         values.requires_approval, values.requires_implementation,
         values.requires_validation, values.requires_metric,
         values.requires_evidence, values.simplified_closure, minEvidence],
      );
      if (!rowCount) throw new Error("Profile олдсонгүй эсвэл админ эрхгүй");
      await tx.query("select app.audit('closure_profile', null, 'ADMIN_UPDATE', null, $1)", [
        JSON.stringify({ work_type: workType, ...values, min_evidence_count: minEvidence }),
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Profile хадгалж чадсангүй");
  }
  revalidatePath("/admin");
}

export async function setQuarterStatus(quarterId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const status = formData.get("status") as string;
  if (!["PLANNING", "ACTIVE", "CLOSING", "CLOSED", "ARCHIVED"].includes(status)) fail("Төлөв буруу");
  try {
    await withUser(session.authUid, async (tx) => {
      const { rowCount } = await tx.query(
        "update quarters set status = $1::quarter_status where id = $2", [status, quarterId],
      );
      if (!rowCount) throw new Error("Админ эрх шаардлагатай");
      await tx.query("select app.audit('quarter', $1, 'STATUS_SET', null, $2)", [
        quarterId, JSON.stringify({ status }),
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Өөрчилж чадсангүй");
  }
  revalidatePath("/admin");
}
