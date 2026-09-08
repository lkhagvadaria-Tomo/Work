# Google integration

## Principles (§11–14, D-008)

- Google Drive **remains the document source of truth**. IPPDD WorkOS stores references
  (`drive_file_id`, URL, name, mime type, modified time) and governance metadata — never
  document bodies.
- Least-privilege OAuth. Sign-in identity scopes and Drive scopes are separate.

## OAuth scopes requested and why

| Scope | Where | Why |
|---|---|---|
| `openid email profile` | Supabase Auth Google provider | identity + employee-email linking; nothing else |
| `https://www.googleapis.com/auth/drive.metadata.readonly` | optional, Drive metadata reads | resolve file name/mimeType/modifiedTime for attached references and detect changed-after-approval drift. Metadata-only — the app never reads file contents |

Not requested: full `drive`, `drive.readonly` (content), Gmail, Calendar. If automated
folder provisioning (§13) is later approved, add `drive.file` (app-created files only) —
prefer it over broader scopes.

## How attaching works

1. User pastes a Drive link (drive.google.com / docs.google.com only — validated
   server-side, `lib/drive.isAllowedDriveUrl`).
2. `parseDriveUrl` extracts the file id; the reference is stored with the deliverable or
   evidence row.
3. When a user OAuth token with the metadata scope is available,
   `fetchDriveMetadata(fileId, token)` fills name/mimeType/modifiedTime. Without a token
   the reference still works — drift detection is simply unavailable (shown honestly,
   never faked).

## Version governance (§14)

- Deliverables carry `vX.Y` (`v0.x` working, `v0.9` review candidate, `v1.0+` approved).
- On APPROVE, the approval row records the exact version, and each final deliverable
  snapshots `approved_modified_time := drive_modified_time`.
- If Drive later reports a newer `modifiedTime`, the UI and the gate raise
  **"БАТЛАГДСАН ХУВИЛБАР ӨӨРЧЛӨГДСӨН БАЙЖ БОЛЗОШГҮЙ"** as a HIGH warning. This is
  metadata drift detection, not cryptographic integrity — content hashing/snapshots can be
  added later without schema changes (the columns already exist).

## Folder convention (§13)

```
IPPDD WorkOS/<year>/Q<n>/<EMPLOYEE_CODE>/<O#>/<KR#>/
  01_WORKING / 02_REVIEW / 03_APPROVED / 04_IMPLEMENTATION / 05_EVIDENCE
```

`lib/drive.driveFolderPath()` renders the expected path per work item (guided
provisioning). Automated creation is deferred until an admin approves the `drive.file`
scope; when implemented it must be idempotent (search-before-create by name+parent).

## Google Workspace administrator actions (production)

1. Create an OAuth Client (Web) in Google Cloud Console; authorized redirect URI:
   `https://<supabase-project>.supabase.co/auth/v1/callback`.
2. In Supabase → Authentication → Providers → Google: paste Client ID/Secret.
3. Restrict to the Workspace: keep `GOOGLE_WORKSPACE_DOMAIN=netgroup.mn` (the app enforces
   the domain server-side at employee-linking as well).
4. Optionally mark the app "internal" in the OAuth consent screen so only Workspace
   accounts can consent.
5. If Drive metadata reads are wanted, add the `drive.metadata.readonly` scope to the
   Supabase Google provider scopes and re-consent.
