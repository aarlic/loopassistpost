# Branch — public notes and account-owned pages

React Flow mind maps, Tiptap notes and images backed by Supabase. Visitors read published pages; email/password accounts create pages and edit their own content. All cloud pages are public. The previous browser database is retained untouched and is only published when an account explicitly imports it.

## Connect your free Supabase project

1. Create a free project at https://supabase.com/dashboard. No project is provisioned by this checkout.
2. In its SQL editor, run `supabase/migrations/202610040001_public_notes.sql` once. It creates tables, atomic page creation, Row Level Security, immutable ownership rules and the private `note-images` bucket with public reads limited to registered attachments.
3. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the project's Connect/API settings. A legacy anon key can also be used in that variable. Never use service_role or secret keys in Vite: every VITE variable is public browser code.
4. In Authentication → URL Configuration set Site URL to your app URL (local development default: `http://localhost:5173`) and allow that exact URL as a redirect. Before hosting, add the intended HTTPS site URL. Keep email confirmation enabled.
5. In Authentication → Email configure a custom SMTP sender for public signups. Supabase's default sender is restricted; receiving confirmation email must be tested with your actual sender. Configure your desired password policy and signup controls there. Password recovery UI is outside this initial release.
6. Run `npm ci`, then `npm run dev` with Node 22.12+ or a supported newer LTS. Restart Vite after changing environment variables. The app explicitly shows when the backend is unconfigured.
7. Register, confirm email, then log in. There is no built-in admin account or default password.

No hosted project credentials have been supplied, no migration has been executed remotely, and no deployment has been performed. The integration requires completing the project setup above (or connecting project access for the coordinator).

## Use

The home screen and sidebar list available pages. Anyone can read notes and attachments. Log in to create a mind map, add notes, format text or upload images. Owners alone can rename/delete pages, edit notes, move nodes or change images. Other account holders read those pages. Signed-out and offline visitors cannot write. Database/storage policies enforce permissions for direct API requests as well as the UI.

Changes are debounced; wait for **Saved to server**. A failed save retains its draft in memory and offers **Retry save**; closing/reloading can lose that unsaved draft. Logout flushes pending writes before signing out. If a session expires or is changed outside the app, editor access and in-memory queues are cleared to prevent a different account from inheriting pending writes.

### Preserve old local notes

The IndexedDB `branch-local-v1` schema and records are not migrated or deleted. Use the same browser profile **and origin/port** as the previous app. After login choose **Import local notes** and confirm that copies will become public. Page/note/image IDs are regenerated, originals stay local, and attached blobs are uploaded. Do not import private content you do not want everyone to read. Import currently covers every local page. Partial failure is reported, but already uploaded pages stay published; retry can create duplicates. Review/delete partial pages before retrying. The import requires an internet connection.

### Images

JPEG, PNG, WebP, GIF up to 5 MB. Upload objects are readable publicly only after image metadata is saved. Deleting an individual attachment removes its object first. Page/branch deletion cascades metadata; associated object files can remain inaccessible in the bucket and consume quota. Owners/project administrators should remove those orphan files in Storage; automated garbage collection is deferred.

## Verify

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Eight unit tests verify retained local records, blobs, retry behavior and explicit import copies/failure preservation. Browser tests use a mocked Supabase transport to verify guest/other-user restrictions, owner editing, logout and visible failed saves. Those tests do **not** prove real authentication delivery or SQL/storage enforcement. The browser test server uses mock-only environment values and does not connect to a hosted project.

After applying the migration, independently check with a guest and two confirmed accounts: public reading/images, account A's creation/edit/upload, account B's attempted direct REST insert/update/delete against A's records, attempted owner_id/mapId/path changes, anonymous writes, failed network saves, logout and explicit import of a retained local page/image. Unauthorized changes must fail or affect zero records. Confirm local IndexedDB originals remain after import. Real hosted checks are pending until project credentials/setup are available.

## Limits

Free Supabase projects may pause after inactivity; free quota and email-sender limits apply. No offline writing, collaboration, private cloud pages, automatic backups or admin role. Concurrent editors use last-write-wins. Native confirmation/prompt dialogs are used. The bundle emits a size advisory. A PWA shell is cached, but API requests are not cached and opening notes offline is not supported. Local originals are not backups: retain/export them before clearing browser data. Signup abuse/rate settings are managed in Supabase.
# loopassistpost
