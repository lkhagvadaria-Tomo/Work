import "server-only";

/**
 * Google Drive reference handling (§12, D-008). Drive is the document source
 * of truth; we store references + metadata, never document bodies.
 *
 * Metadata retrieval uses the signed-in user's OAuth access token when the
 * Drive scope was granted (least privilege: drive.metadata.readonly, see
 * docs/GOOGLE_DRIVE.md). Without a token we degrade to URL parsing — clearly
 * marked so version-drift detection is simply unavailable, never faked.
 */

export interface DriveMeta {
  fileId: string;
  name: string | null;
  mimeType: string | null;
  modifiedTime: string | null;
  webViewLink: string | null;
}

const ID_PATTERNS = [
  /https:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation|forms)\/d\/([\w-]{20,})/,
  /https:\/\/drive\.google\.com\/file\/d\/([\w-]{20,})/,
  /https:\/\/drive\.google\.com\/(?:open|uc)\?id=([\w-]{20,})/,
  /https:\/\/drive\.google\.com\/drive\/folders\/([\w-]{20,})/,
];

export function parseDriveUrl(url: string): string | null {
  for (const p of ID_PATTERNS) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function isAllowedDriveUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "drive.google.com" || u.hostname === "docs.google.com")
    );
  } catch {
    return false;
  }
}

/** Fetch file metadata with a user OAuth token. Returns null when unavailable. */
export async function fetchDriveMetadata(
  fileId: string,
  accessToken: string | null,
): Promise<DriveMeta | null> {
  if (!accessToken || !/^[\w-]{20,}$/.test(fileId)) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
        "?fields=id,name,mimeType,modifiedTime,webViewLink&supportsAllDrives=true",
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as Record<string, string | undefined>;
    return {
      fileId,
      name: d.name ?? null,
      mimeType: d.mimeType ?? null,
      modifiedTime: d.modifiedTime ?? null,
      webViewLink: d.webViewLink ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Recommended Drive folder path for a work item's documents (§13). Folder
 * provisioning is guided (the app shows the expected path); automated
 * provisioning requires a Drive write scope an admin must approve first.
 */
export function driveFolderPath(args: {
  year: number;
  quarter: number;
  employeeCode: string;
  objectiveCode: string;
  krCode: string;
}): string[] {
  return [
    "IPPDD WorkOS",
    String(args.year),
    `Q${args.quarter}`,
    args.employeeCode,
    args.objectiveCode,
    args.krCode,
    "01_WORKING / 02_REVIEW / 03_APPROVED / 04_IMPLEMENTATION / 05_EVIDENCE",
  ];
}
