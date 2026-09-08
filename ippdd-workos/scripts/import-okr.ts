/**
 * OKR workbook import (§35). Reads an .xlsx export of the department OKR
 * workbook (IPPDD_OKR_Q3_* layout) or the extracted JSON, previews, validates
 * weights, rejects duplicates, and inserts objectives + key results.
 *
 * Usage:
 *   npx tsx scripts/import-okr.ts --file <path.xlsx|path.json> \
 *     --email lkhagvadari.a@netgroup.mn --quarter 2026-Q3 [--apply]
 *
 * Without --apply it is a dry run: it prints the preview and validation only.
 * Idempotency: an (employee, quarter, objective_code, kr_code) that already
 * exists blocks the import — nothing is silently overwritten or duplicated.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { validateWeights } from "../lib/okr/calc";

interface ImportKr {
  code: string; title: string; weight: string; deadline: string | null;
  description?: string; measurement?: string;
}
interface ImportObjective { code: string; title: string; weight: string; krs: ImportKr[] }
interface ImportData { objectives: ImportObjective[] }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function parseXlsx(path: string): ImportData {
  // Lazy import so JSON-only usage doesn't need the xlsx package at runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.readFile(path);
  // The department workbook keeps the OKR sheet as the one containing "OKR" in
  // its name, with O#/KR# codes in column A.
  const sheetName =
    wb.SheetNames.find((n: string) => /okr/i.test(n)) ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    header: 1,
  }) as unknown as unknown[][];

  const objectives: ImportObjective[] = [];
  let current: ImportObjective | null = null;
  for (const row of rows) {
    const code = String(row?.[0] ?? "").replace(/\s+/g, "");
    if (/^O\d+$/.test(code)) {
      current = {
        code,
        title: String(row[1] ?? "").trim(),
        weight: String(row[2] ?? row[5] ?? "0").trim(),
        krs: [],
      };
      objectives.push(current);
    } else if (/^KR\d+$/.test(code) && current) {
      const title = String(row[1] ?? "").trim();
      if (!title) continue;
      const m = title.match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
      current.krs.push({
        code,
        title,
        weight: String(row[2] ?? row[5] ?? "0").trim(),
        deadline: m ? `${m[1]}-${m[2]}-${m[3]}` : null,
      });
    }
  }
  return { objectives };
}

async function main() {
  const file = arg("file");
  const email = arg("email");
  const quarterCode = arg("quarter");
  const apply = process.argv.includes("--apply");
  if (!file || !email || !quarterCode) {
    console.error("Usage: tsx scripts/import-okr.ts --file <xlsx|json> --email <employee email> --quarter <YYYY-QN> [--apply]");
    process.exit(2);
  }

  const data: ImportData = file.endsWith(".json")
    ? (JSON.parse(readFileSync(file, "utf8")) as ImportData)
    : parseXlsx(file);

  // ── Preview ────────────────────────────────────────────────────────────────
  console.log(`\n== PREVIEW: ${email} · ${quarterCode} · source ${file}`);
  for (const o of data.objectives) {
    console.log(`  ${o.code} (${o.weight}) ${o.title.slice(0, 90)}`);
    for (const k of o.krs) {
      console.log(`    ${k.code} (${k.weight}) хугацаа=${k.deadline ?? "—"} ${k.title.slice(0, 70)}`);
    }
  }

  // ── Validation (§35: weight totals, malformed records) ────────────────────
  const errors = validateWeights(
    data.objectives.map((o) => ({
      weight: parseFloat(o.weight),
      krs: o.krs.map((k) => ({ weight: parseFloat(k.weight), achievement_percent: null })),
    })),
  );
  for (const o of data.objectives) {
    if (!/^O\d+$/.test(o.code)) errors.push(`Objective code буруу: ${o.code}`);
    const seen = new Set<string>();
    for (const k of o.krs) {
      if (!/^KR\d+$/.test(k.code)) errors.push(`${o.code}: KR code буруу: ${k.code}`);
      if (seen.has(k.code)) errors.push(`${o.code}: давхардсан ${k.code}`);
      seen.add(k.code);
      if (!k.title) errors.push(`${o.code}-${k.code}: нэр хоосон`);
    }
  }
  if (errors.length > 0) {
    console.error("\n== VALIDATION FAILED:");
    errors.forEach((e) => console.error("  ✕ " + e));
    process.exit(1);
  }
  console.log("\n== validation OK (жин 100%, код давхардаагүй)");

  if (!apply) {
    console.log("== dry run — өөрчлөлт хийгдээгүй. Хэрэгжүүлэхийн тулд --apply нэм.");
    return;
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    const emp = await client.query<{ id: string }>(
      "select id from employees where lower(email) = lower($1) and active", [email]);
    if (emp.rows.length === 0) throw new Error(`Ажилтан олдсонгүй: ${email}`);
    const quarter = await client.query<{ id: string }>(
      "select id from quarters where code = $1", [quarterCode]);
    if (quarter.rows.length === 0) throw new Error(`Улирал олдсонгүй: ${quarterCode}`);
    const [employeeId, quarterId] = [emp.rows[0].id, quarter.rows[0].id];

    const existing = await client.query<{ n: string }>(
      "select count(*) as n from objectives where employee_id = $1 and quarter_id = $2",
      [employeeId, quarterId]);
    if (Number(existing.rows[0].n) > 0) {
      throw new Error(
        "Энэ ажилтан/улиралд OKR аль хэдийн бүртгэлтэй — давхар импорт хориглоно. " +
        "Шинэчлэхийн тулд эхлээд админаар одоогийн бүртгэлийг цуцлана.");
    }

    for (const o of data.objectives) {
      const or = await client.query<{ id: string }>(
        `insert into objectives (employee_id, quarter_id, objective_code, title, weight, status)
         values ($1, $2, $3, $4, $5, 'ACTIVE') returning id`,
        [employeeId, quarterId, o.code, o.title, parseFloat(o.weight)]);
      for (const k of o.krs) {
        await client.query(
          `insert into key_results (objective_id, kr_code, title, description, weight,
             measurement_method, deadline, status)
           values ($1, $2, $3, $4, $5, $6, $7, 'NOT_STARTED')`,
          [or.rows[0].id, k.code, k.title, k.description ?? null,
           parseFloat(k.weight), k.measurement ?? null, k.deadline]);
      }
    }
    await client.query(
      `insert into audit_logs (actor_id, entity_type, entity_id, action, new_values)
       values (null, 'quarter', $1, 'OKR_IMPORT', $2)`,
      [quarterId, JSON.stringify({ email, file, objectives: data.objectives.length })]);
    await client.query("commit");
    console.log("== IMPORT OK");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("IMPORT FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
