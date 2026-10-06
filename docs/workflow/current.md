# Current workflow

Stage: guide report ready for user verification; local integration independently tested, hosted backend verification BLOCKED pending project connection. No deployment authorized.

User approved Supabase proposal with “ok. set this up for backend for me” on 2026-10-04. Scope: email/password signup/login/logout, public pages/notes/images, signed-in creation, owner-only editing/deletion with database/storage enforcement, explicit import of retained local IndexedDB records. Exclusions: offline writing, collaboration, private cloud pages, deployment and external project provisioning without project access.

Acceptance criteria: guests read only; authenticated owners create/edit; other accounts cannot mutate; logout clears editor access; image operations respect ownership; local originals survive successful/failed imports; failed requests are visible; no privileged browser keys; missing backend config explained.

Builder evidence: `npm run typecheck` passed; `npm test` passed 8 tests (6 original IndexedDB/queue tests + 2 explicit import tests); `npm run build` passed with existing large-bundle advisory; `npm run test:e2e` passed 3 mocked-transport Chromium tests (guest/other user restrictions, owner save/logout, visible failed save). Development browser emitted React Flow ResizeObserver notifications; assertions passed. Browser evidence predates only deletion response handling simplification (cascade delete may return fewer rows), followed by passing unit/typecheck/build.

Tested snapshot (no git repository in this checkout, so commit/revision unavailable):
- App SHA256 d7b969611a8b0824c82f8afe9b81bf65b1bcf669f792d0bbfde6cd858d40661a
- NoteEditor SHA256 ddf294a893b8d23ee3a30998fb141b0f2828bcca81bb9a24eb53130093daedea
- cloud SHA256 cefa779f279fba27d66268b665e62d18ef5b6cb54768e87886b6e0553f46608c
- migration SHA256 425667a7365dcc1c96c816f16e0ea1fefdc0b9912fa6db6db4961fa58c2ac898

Unperformed checks: hosted migration execution, real two-account/anonymous direct API RLS and Storage checks, actual SMTP confirmations, real image upload/read/delete, hosted import. Project credentials/connected Supabase access are absent; neither PostgreSQL nor Docker is installed locally. These are pending, not passing. README supplies setup and verification steps. No Supabase project or deployment was created.

Remaining limitations: partial import can leave published copies and retry can duplicate; explicit warning before import; original local data unchanged. Branch/page deletion cascades attachment metadata but may retain inaccessible orphan files consuming storage; cleanup deferred/documented. Expired/externally changed account sessions clear unsaved queues; deliberate logout first flushes saves. Reset-password UI not included.

Next: coordinator delegates guide report and user verification; connect a Supabase project to execute migration and real authorization/email/storage checks. Deployment requires explicit tested revision and target approval. Commit workflow with project once a git repository exists.

## Independent tester evidence — 2026-10-04

Result: PASS for local implementation checks, BLOCKED for real hosted backend verification. No application files changed by tester. Independently ran `npm run typecheck` (passed), `npm test` (8/8 passed), `npm run build` (passed; bundle-size advisory), and `npm run test:e2e` (7/7 Chromium tests passed in 6.9 seconds). Actual browser runs performed through Playwright, using mocked HTTP Supabase responses, not a hosted backend.

Added browser checks: immediate logout flushes unsaved title before signout; failed pending save blocks logout and keeps the draft/session; browser offline transition disables owner title/rich-text editing and creation while retaining loaded reading, with editing restored online; anonymous downloaded PNG bytes render correctly and image caption/removal remain locked. Existing tests cover guest/other-account restrictions, owner content round-trip, visible save failures. Fixed an existing flaky import test that incorrectly assumed UUID sorting placed the root before its child; assertions now find copied nodes by title. Original graph/blob import and failed-import preservation pass.

Static review: RLS checks map ownership for node/image writes; attachment paths match current user/map/image; composite foreign keys enforce note/image page relationships; triggers forbid identity/ownership/page transfers; page creation function is invoker/atomic; bucket is private and anonymous download requires published metadata. No actionable authorization defect identified by review. Static review does not prove SQL execution or real policy enforcement.

Blocked evidence: only `.env.example` exists; no connected project credentials; `psql` and `docker` absent. Real migration, two-account/anonymous direct REST and Storage tests, signup/SMTP confirmation, hosted image upload/delete and import remain unperformed. Cannot label the backend fully verified or provisioned. External session expiry/change clears unsaved queues; deliberate logout retention verified. Partial imports/retry duplication and orphan storage quota remain documented limitations. Browser attachment rendering emitted a transient empty-src React warning; rendering itself passed. One earlier browser run emitted React Flow ResizeObserver warning. No deployment.

Tester fingerprint (application/migration unchanged from builder snapshot): test cloud SHA256 `d93afd59dd66db780a73f6350f8299d43d1acae7dce77e144dde04e42ce10227`; e2e SHA256 `a7019108317414721439f7cb056006ac048326c54db6139050a754d08cdfdbef`. App/editor/cloud/migration hashes above remain current. No git repository exists, so commit unavailable; coordinator must commit workflow once repository is initialized/available.

## Guide handoff — 2026-10-04

Report and numbered setup/manual checks recorded in docs/workflow/verification.md. No application edits or deployment. No active server found on localhost:5173; preview requires starting Vite after configuration. User verification and project connection are pending.
