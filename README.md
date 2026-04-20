# Meridian — Phase 2

Stock movement and tax exposure tracker. Phase 2 adds PDF/image upload with Claude-powered field extraction on top of the Phase 1 foundation (login, shipments dashboard, manual intake, reference-data views).

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS)

---

## Quickstart

### 1. Install

```bash
pnpm install      # or npm install / yarn
```

### 2. Supabase project

1. Create a project at [supabase.com](https://supabase.com). Free tier is fine.
2. Open **SQL Editor** → paste and run `db/schema.sql`.
3. Paste and run `db/seed.sql` (reference data + six sample shipments).
4. Paste and run `db/phase2.sql` (document-extraction table + storage bucket + RLS).
5. Go to **Authentication → Providers**, enable **Google** and **Email** (magic link is on by default).
   - For Google: set up an OAuth client in Google Cloud, paste the client ID/secret into Supabase, and add `https://[your-vercel-domain]/api/auth/callback` and `http://localhost:3000/api/auth/callback` to the authorised redirect URIs.

### 3. Env

```bash
cp .env.local.example .env.local
```

Fill in:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase → **Project Settings → API**
- `SUPABASE_SERVICE_ROLE_KEY` from the same page (server-only, used by `/api/extract` to read uploaded files)
- `ANTHROPIC_API_KEY` from [console.anthropic.com](https://console.anthropic.com/settings/keys)

Leave the Phase 3+ keys blank for now. Remember to add all three to your Vercel project's environment variables as well.

### 4. Run

```bash
pnpm dev
```

Open `http://localhost:3000`. You should be redirected to `/login`. Sign in with Google (or by magic link) — you'll land on the shipments dashboard with the seeded sample data.

### 5. Deploy to Vercel

1. Push to GitHub.
2. Import the repo into Vercel.
3. Add the env vars from `.env.local` to the Vercel project settings.
4. Deploy. Add the production URL to Supabase's **Authentication → URL Configuration → Site URL**.

---

## What's in this phase

- ✅ Google OAuth + email magic-link login
- ✅ Sidebar layout with all nav routes live
- ✅ Shipments dashboard: KPI strip, filterable table, detail panel
- ✅ Manual intake modal — creates real shipments in the database
- ✅ Auto-generated shipment refs (`MRD-0001`, `MRD-0002`, ...)
- ✅ Reference data pages for VAT, Incoterms, Commodity Codes
- ✅ Row-level security — signed-out users are redirected to login
- ✅ Sign out
- ✅ **Phase 2:** PDF/image upload → Claude Opus 4.7 extracts fields → form pre-fills with green confidence highlights → user reviews + saves

## What's coming

- **Phase 3:** `shipments@[your-domain]` email ingest via Postmark; Supabase Realtime for live collaboration.
- **Phase 4:** Tax Exposure dashboard, xlsx export, flags engine, weekly digest email.

See `Meridian_Build_Plan.docx` for the full spec.

---

## Folder structure

```
app/
  (auth)/login/          login page
  (app)/                 authenticated routes (layout enforces auth)
    shipments/           main dashboard
    exposure/            placeholder → Phase 4
    drafts/              placeholder → Phase 2
    inbox/               placeholder → Phase 3
    reference/{vat,incoterms,commodity,hauliers}/
  api/auth/callback/     OAuth callback handler
components/
  layout/sidebar.tsx
  shipments/             table, detail panel, intake modal, KPIs
  ui/coming-soon.tsx
lib/
  supabase/{client,server}.ts
  actions/{auth,shipments}.ts
  types/index.ts
  utils.ts
db/
  schema.sql             full schema + RLS
  seed.sql               reference data + sample shipments
middleware.ts            session refresh + redirects
```

---

## Continuing development

For multi-week work, use **Claude Code** (`claude.ai/code`) in your terminal rather than chat. It reads and writes files directly, runs commands, and iterates on bugs — vastly faster than copy-paste.

Point it at this folder and ask for Phase 2 whenever you're ready.
