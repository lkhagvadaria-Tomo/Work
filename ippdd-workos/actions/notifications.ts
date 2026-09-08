"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";

export async function markNotificationRead(id: string): Promise<void> {
  const session = await requireSession();
  await withUser(session.authUid, async (tx) => {
    await tx.query("update notifications set read_at = now() where id = $1 and read_at is null", [id]);
  });
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const session = await requireSession();
  await withUser(session.authUid, async (tx) => {
    await tx.query("update notifications set read_at = now() where read_at is null");
  });
  revalidatePath("/", "layout");
}
