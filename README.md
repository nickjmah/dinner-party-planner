# Service — Dinner Party Planner

A source-grounded dinner-party planning app with a static React frontend on GitHub Pages and a private Supabase backend.

## What is included

- Owner email/password login with Supabase Auth and Row Level Security
- Dinner-scoped, read-only guest links protected by an eight-character code
- URL, public PDF, Google Drive PDF, private PDF upload, and manual recipe intake
- Deterministic JSON-LD, microdata, WP Recipe Maker, reader-text, and PDF parsing
- Automatic one-to-one English translation through MyMemory's no-key free API; changed quantities, units, and times are rejected
- Source snapshots, hashes, and line-level provenance; unverifiable imports are rejected
- Per-recipe serving scales and automatic shopping-list recalculation
- Compatible-unit consolidation plus independent mixed-unit progress
- Purchased-item hiding and ingredient-used/on-hand deductions
- Persistent drag ordering, calendar-day controls, make-ahead/freezer suggestions, and kitchen-capacity-aware scheduling
- Persistent notes on each shopping item and prep task, manual recipe editing/deletion, guest views, recipe printouts, and a complete dinner packet
- Responsive desktop rail, phone bottom navigation, and ink-saving print layouts

## Security model

The public repository contains only static code and the Supabase publishable key. The database, imported recipes, PDFs, passwords, guest code hashes, rate-limit history, migration exports, and API secrets remain private.

Owner table access is restricted by `owner_id = auth.uid()` policies. Guests never receive Supabase table credentials: Edge Functions verify the dinner code and return a 30-day HMAC-signed, dinner-scoped token. Regenerating a share code changes the share version and invalidates old tokens. The guest response uses an explicit allowlist and omits owner IDs, row IDs, integration metadata, credentials, private chef notes, and share settings.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Add the project URL and publishable key from Supabase.
3. Install dependencies with `pnpm install`.
4. Run `pnpm dev`.

Hash routes are used so GitHub Pages can reliably open project subroutes:

- `/#/login`
- `/#/app/dinners/:dinnerId`
- `/#/d/:shareId`

## Supabase setup

1. Create a free Supabase project.
2. Apply `supabase/migrations/202608240001_initial.sql`.
3. Create the owner in Authentication, then keep public signup disabled.
4. Configure Edge Function secrets:

   - `JINA_API_KEY` (optional but recommended for publisher access blocks)
   - `GUEST_TOKEN_SECRET` (at least 32 random characters)
   - `GUEST_RATE_LIMIT_SALT` (at least 32 random characters)
   - `FRONTEND_ORIGIN` (the final GitHub Pages origin)

5. Deploy `guest-unlock`, `guest-dinner`, `import-recipe`, `process-manual-recipe`, `plan-timeline`, and `test-integrations`.

Privileged keys are never exposed through Vite environment variables. Only variables beginning with `VITE_` are bundled into the public frontend.

Recipe translation does not require an API key. Non-English source lines are sent individually to MyMemory and retained alongside the untouched publisher wording. Anonymous MyMemory usage is currently limited to 5,000 characters per day, so the app reports a recoverable error when that external limit is reached.

## Private data migration

The ignored `private-migration/` directory contains the current Drive export and all provenance snapshots. It must never be added to Git.

Validate without writing:

```text
node scripts/migrate.mjs
```

Apply the validated bundle as one PostgreSQL transaction:

```text
MIGRATION_OWNER_ID=<owner-uuid>
SUPABASE_DB_URL=<direct-or-session-pooler-connection-string>
node scripts/migrate.mjs --apply
```

Use `--replace` only for an intentional rehearsal reset. The script checks IDs, foreign keys, JSON fields, timestamps, per-dinner aggregates, source counts, unique Drive provenance IDs, and post-transaction database counts. It does not migrate API keys or old guest tokens.

## Validation

```text
pnpm run lint
pnpm test
pnpm run build
pnpm run test:e2e
```

The deterministic suite contains 83 tests covering parsing, canonical ingredients, scaling, mixed units, provenance, translations, shopping progress, make-ahead reasoning, kitchen capacity, and timeline preservation. The Playwright suite is configured for desktop and mobile.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` validates each push to `main`, builds with repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, and deploys `dist/` to Pages. Configure the repository’s Pages source as **GitHub Actions**.

The original Apps Script app and Drive data are intentionally untouched. Keep them as a read-only backup for 30 days after the new app is verified; do not synchronize edits after cutover.
