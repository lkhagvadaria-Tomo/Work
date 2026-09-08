"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { isAllowedDriveUrl, parseDriveUrl } from "@/lib/drive";

function fail(msg: string): never {
  redirect(`/error?m=${encodeURIComponent(msg)}`);
}

const evidenceSchema = z.object({
  work_item_id: z.string().uuid(),
  evidence_type: z.string().min(2),
  title: z.string().min(2).max(300),
  description: z.string().max(4000).optional().or(z.literal("")),
  drive_url: z.string().max(1000).optional().or(z.literal("")),
  external_url: z.string().max(1000).optional().or(z.literal("")),
  deliverable_id: z.string().uuid().optional().or(z.literal("")),
});

export async function addEvidence(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = evidenceSchema.safeParse({
    work_item_id: formData.get("work_item_id"),
    evidence_type: formData.get("evidence_type"),
    title: formData.get("title"),
    description: formData.get("description") || "",
    drive_url: formData.get("drive_url") || "",
    external_url: formData.get("external_url") || "",
    deliverable_id: formData.get("deliverable_id") || "",
  });
  if (!parsed.success) fail("Нотолгооны талбар буруу");
  const d = parsed.data;

  let driveFileId: string | null = null;
  if (d.drive_url) {
    if (!isAllowedDriveUrl(d.drive_url)) fail("Зөвхөн drive.google.com / docs.google.com линк зөвшөөрнө");
    driveFileId = parseDriveUrl(d.drive_url);
  }
  if (d.external_url && !/^https:\/\//.test(d.external_url)) fail("Гадаад линк https байх ёстой");
  if (!d.drive_url && !d.external_url && !d.description) {
    fail("Нотолгоо нь Drive линк, гадаад линк эсвэл тайлбарын аль нэгийг агуулна");
  }

  try {
    await withUser(session.authUid, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into evidence (work_item_id, deliverable_id, evidence_type, title, description,
           drive_file_id, drive_url, external_url, created_by)
         values ($1, nullif($2,'')::uuid, $3::evidence_type, $4, nullif($5,''),
                 $6, nullif($7,''), nullif($8,''), $9)
         returning id`,
        [
          d.work_item_id, d.deliverable_id ?? "", d.evidence_type, d.title,
          d.description ?? "", driveFileId, d.drive_url ?? "", d.external_url ?? "",
          session.employee.id,
        ],
      );
      await tx.query("select app.audit('evidence', $1, 'ATTACH', null, $2)", [
        rows[0].id, JSON.stringify({ work_item_id: d.work_item_id, title: d.title }),
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Нотолгоо хавсаргаж чадсангүй");
  }
  revalidatePath(`/work/${d.work_item_id}`);
  revalidatePath("/evidence");
}

export async function removeEvidence(evidenceId: string, workItemId: string): Promise<void> {
  const session = await requireSession();
  try {
    await withUser(session.authUid, async (tx) => {
      const { rowCount } = await tx.query(
        "delete from evidence where id = $1", [evidenceId],
      );
      if (!rowCount) throw new Error("Устгах боломжгүй (баталгаажсан эсвэл эрхгүй)");
      await tx.query("select app.audit('evidence', $1, 'REMOVE')", [evidenceId]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Нотолгоо устгаж чадсангүй");
  }
  revalidatePath(`/work/${workItemId}`);
  revalidatePath("/evidence");
}

export async function verifyEvidence(evidenceId: string, workItemId: string): Promise<void> {
  const session = await requireSession();
  try {
    await withUser(session.authUid, async (tx) => {
      await tx.query("select app.verify_evidence($1)", [evidenceId]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Баталгаажуулж чадсангүй");
  }
  revalidatePath(`/work/${workItemId}`);
  revalidatePath("/evidence");
}

const deliverableSchema = z.object({
  work_item_id: z.string().uuid(),
  requirement_id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(2).max(300),
  drive_url: z.string().max(1000).optional().or(z.literal("")),
  version: z.string().regex(/^v\d+\.\d+$/, "Хувилбар vX.Y хэлбэртэй байна"),
  final_version: z.coerce.boolean().default(false),
});

export async function addDeliverable(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = deliverableSchema.safeParse({
    work_item_id: formData.get("work_item_id"),
    requirement_id: formData.get("requirement_id") || "",
    name: formData.get("name"),
    drive_url: formData.get("drive_url") || "",
    version: formData.get("version") || "v0.1",
    final_version: formData.get("final_version") === "on",
  });
  if (!parsed.success) fail("Deliverable талбар буруу: " + parsed.error.issues[0]?.message);
  const d = parsed.data;
  if (d.drive_url && !isAllowedDriveUrl(d.drive_url)) fail("Зөвхөн Google Drive линк");
  const driveFileId = d.drive_url ? parseDriveUrl(d.drive_url) : null;
  // version governance (§14): v1.0+ counts as approved-track final versions
  const major = Number(d.version.slice(1).split(".")[0]);
  const status = d.final_version || major >= 1 ? "REVIEW_CANDIDATE" : "WORKING";

  try {
    await withUser(session.authUid, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into deliverables (work_item_id, requirement_id, name, drive_file_id, drive_url,
           version, status, submitted_by, submitted_at, final_version)
         values ($1, nullif($2,'')::uuid, $3, $4, nullif($5,''),
                 $6, $7::deliverable_status, $8, now(), $9)
         returning id`,
        [
          d.work_item_id, d.requirement_id ?? "", d.name, driveFileId,
          d.drive_url ?? "", d.version, status, session.employee.id, d.final_version,
        ],
      );
      await tx.query("select app.audit('deliverable', $1, 'ATTACH', null, $2)", [
        rows[0].id, JSON.stringify({ name: d.name, version: d.version }),
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Deliverable нэмж чадсангүй");
  }
  revalidatePath(`/work/${d.work_item_id}`);
}

export async function markDeliverableFinal(deliverableId: string, workItemId: string): Promise<void> {
  const session = await requireSession();
  try {
    await withUser(session.authUid, async (tx) => {
      const { rowCount } = await tx.query(
        "update deliverables set final_version = true where id = $1",
        [deliverableId],
      );
      if (!rowCount) throw new Error("Deliverable олдсонгүй");
      await tx.query("select app.audit('deliverable', $1, 'MARK_FINAL')", [deliverableId]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Тэмдэглэж чадсангүй");
  }
  revalidatePath(`/work/${workItemId}`);
}

export async function addRequirement(formData: FormData): Promise<void> {
  const session = await requireSession();
  const workItemId = formData.get("work_item_id") as string;
  const name = ((formData.get("name") as string) || "").trim();
  if (!workItemId || name.length < 2) fail("Нэр дутуу");
  try {
    await withUser(session.authUid, async (tx) => {
      await tx.query(
        `insert into deliverable_requirements (work_item_id, name, sequence)
         values ($1, $2, coalesce((select max(sequence) from deliverable_requirements
                                    where work_item_id = $1), 0) + 1)`,
        [workItemId, name],
      );
      await tx.query("select app.audit('work_item', $1, 'REQUIREMENT_ADD', null, $2)", [
        workItemId, JSON.stringify({ name }),
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Шаардлага нэмж чадсангүй");
  }
  revalidatePath(`/work/${workItemId}`);
}
