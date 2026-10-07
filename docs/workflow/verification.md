# Account-screen change report — 2026-10-07

The public home now shows Log in and Create an account buttons. Email/password fields appear on dedicated screens. Signup requires matching Confirm password. Back to public home restores the public list. A guest choosing Create page logs in and then continues to the page-name prompt; signed-in users create directly.

Tested application revision: `e08bcd1732716f7c6bd06034e5e0457910c2c938`. Independent verification revision: `29cd57e` (test/workflow changes only).

Already performed: independent typecheck, 8 unit tests, build and 13 actual Chromium browser tests passed. Desktop account-screen screenshot was visually checked. Tests use mocked backend responses; hosted signup, email delivery, SQL/RLS and Storage remain unperformed. Existing bundle-size/React Flow/image warnings persist without an actionable acceptance failure.

Preview: no active server was found on port 5173. Start `npm run dev` and open the URL Vite prints (normally http://localhost:5173). See README for Supabase setup. No deployment was performed.

## User verification

1. Open public home signed out. Expected: available pages remain readable, Log in/Create an account buttons appear, and no email/password fields appear on home.
2. Open Create an account and enter different Password/Confirm password values. Expected: mismatch error and no signup request. Matching values permit submission; a confirmation-required backend response shows email instructions and returns to login.
3. From a public note, open Log in, then choose Back to public home. Expected: public listing returns. For a guest, choose Create page and successfully log in. Expected: page-name prompt continues; going home before login cancels this continuation.
4. While signed in, choose Create page. Expected: page-name prompt opens directly. With an invalid login or signup rejected by the backend, expected: visible error and no authenticated editing access.

Known limits: real hosted authentication has not been verified. Password-reset UI, private pages, collaboration and offline writing are outside scope. Existing partial-import duplicates and orphan-storage limitations still apply. Deployment needs separate approval of the tested revision and target.

---

## Earlier backend setup report — historical

# Supabase change report — 2026-10-04

The application integration is implemented. The hosted backend is not provisioned yet: there is no connected Supabase project, migration execution or deployment. No active local preview server was found on port 5173. After configuration, `npm run dev` normally serves http://localhost:5173; use the URL Vite prints if that port is occupied.

## Changes

Email/password registration, login and logout replace the local-only editing model. The home screen lists shared pages and notes. Guests and other accounts read; owners create and edit their own pages, notes and images. SQL and Storage policies are supplied to enforce those rules on direct requests. Existing browser notes stay untouched; a signed-in user can explicitly import public copies. Failed saves show errors and retry controls, and deliberate logout saves pending edits first.

## Already performed

Independent tester passed type checking, all 8 unit tests, production build and all 7 Chromium browser tests. Browser tests use mocked Supabase responses. They cover read-only guests/other accounts, owner editing, logout save/failure handling, network offline restrictions and image rendering. Static review found no actionable policy defect, but cannot establish hosted enforcement. Real migration/authentication/email/RLS/Storage/import checks remain BLOCKED pending project access.

Tested snapshot: no Git repository/commit is available. App SHA256 `d7b969611a8b0824c82f8afe9b81bf65b1bcf669f792d0bbfde6cd858d40661a`; migration SHA256 `425667a7365dcc1c96c816f16e0ea1fefdc0b9912fa6db6db4961fa58c2ac898`. Full file fingerprints and tester evidence are in current.md.

## Setup and verification still required

1. Connect the Supabase integration, or create/select a free Supabase project in its dashboard. Expected: project management access is available. The project URL and publishable/legacy anon key configure the browser; they alone do not provide SQL management access. Never provide a service-role/secret key for the browser.
2. Run `supabase/migrations/202610040001_public_notes.sql` once in the new project SQL editor. Expected: tables, access policies and `note-images` bucket are created without errors. This hosted check has not been performed.
3. Copy `.env.example` to `.env.local`, set URL/public key, configure authentication Site URL and allowed redirect URL, and configure SMTP for confirmation emails. Run `npm run dev`. Expected: missing-backend warning disappears and the page list loads. Use the same origin and browser profile as the old app if importing local notes.
4. Register accounts A and B, receive their confirmation emails and log in. Expected: confirmed accounts can create pages; no default admin/password exists.
5. With account A, create a page, add/formatted-edit a note and upload an image. Wait for Saved to server, reload, then open the same page signed out/in a private window. Expected: text and image persist and are publicly readable; creation/editing controls are locked for guests.
6. Log in as B and open A's page. Expected: reading works, editing/deletion is locked, and B can create its own page. Independent real direct REST/Storage requests must also confirm anonymous writes, B's changes to A's content, and ownership/page/path transfers fail or affect zero records. UI checks alone do not prove enforcement.
7. As A, edit and immediately log out. Expected: pending edits save first and editing becomes unavailable. Simulate a failed save. Expected: visible error and retry option; logout remains blocked until the pending save succeeds.
8. In the original browser/profile/origin, log in and explicitly import local notes only after reviewing their public visibility. Expected: copied pages/notes/images appear publicly; original IndexedDB records remain. Confirm originals also survive a failed import. Review partial published copies before retrying.
9. Test individual image deletion and page deletion in the real project. Expected: individual image object deletion succeeds; page metadata cascades. Inspect Storage for orphan files after branch/page deletion.

## Known limitations

All cloud pages are public. Offline writing, collaboration, private pages and password-reset UI are excluded. Partial imports can publish some copies; retry may duplicate them. Page/branch deletion may leave inaccessible image objects using quota. External session expiry/change clears pending drafts; failed unsaved drafts can be lost on reload. Build has a bundle-size advisory. Free-project/email quotas apply. Deployment requires separate explicit approval after hosted verification.
