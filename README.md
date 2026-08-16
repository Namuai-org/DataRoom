# Namu — Data Room

A secure, access-controlled investor data room for Namu Inc., built to be deployed on Vercel.

Visitors enter through a personal invite link, accept a confidentiality agreement, and read
documents in a watermarked in-browser viewer. Everything they do is recorded, so you can see who
read what, for how long, and how far they got.

---

## What it does

**For visitors**

- Personal invite link — no password, no account to create
- Confidentiality agreement recorded with name, timestamp, and IP before anything opens
- Ten-folder structure, searchable, with a "what changed since your last visit" view
- Documents open in-browser with a watermark carrying the reader's own address
- Downloads are off by default and enabled per person or per document
- A question-and-request thread attached to the room, so diligence questions stay in one place

**For you**

- Invite, revoke, and expire access per person, instantly
- Staged disclosure: release material as **teaser**, **diligence**, or **confirmatory**, so early
  conversations see the deck without seeing the cap table
- An email the moment someone opens the room — the most useful signal during a raise
- Per-visitor analytics: sessions, real reading time, documents opened, time per document, how far
  through each one, downloads, device, browser, city and country
- Per-page dwell time, so you can see which page of the deck held attention and which lost it
- A diligence completeness check that flags what investors will ask for and you have not filed yet
- A full audit trail of every event

---

## Setup

### 1. Provision storage on Vercel

From your Vercel project dashboard:

- **Storage → Create Database → Neon** (Postgres) — holds visitors, permissions, and analytics
- **Storage → Create Store → Blob** — holds the document files

Both write their environment variables into the project automatically.

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill it in. To pull the Vercel-managed values locally:

```bash
npx vercel env pull .env.local
```

Then set the three you own by hand:

```bash
openssl rand -base64 32
```

Put that in `SESSION_SECRET`. Set `OWNER_EMAIL` to `mouhamad@namuai.org` and `NEXT_PUBLIC_APP_URL`
to the room's public URL.

At any point, check what is still missing:

```bash
npm run check
```

It reads your environment, connects to the database, and tells you exactly what to fix and how.
Nothing is written.

### 3. Create the database tables

```bash
npm run db:push
```

### 4. Seed the room

```bash
npm run seed
```

This creates the ten folders, makes `OWNER_EMAIL` the owner admin, and writes the default NDA text
and room settings.

### 5. Load the documents

```bash
npm run ingest
```

This uploads Namu's existing documents from `../namu-design` into Blob storage and files them into
the ten folders. Run `npm run ingest -- --dry-run` first to see what it will do without touching
anything.

### 6. Run it

```bash
npm run dev
```

Open `http://localhost:3000/admin` and sign in with `OWNER_EMAIL`.

---

## Email (optional)

The room is fully usable without email configured:

- Invite links can be copied by hand from the admin console
- Admin sign-in codes are printed to the server logs

To turn on real email, get a key from [resend.com](https://resend.com), verify your sending domain,
and set `RESEND_API_KEY` and `EMAIL_FROM`. Then the room will send invites, sign-in codes, activity
alerts, and answer notifications.

---

## Deploying

```bash
npx vercel --prod
```

Make sure every variable from `.env.example` is set in **Project → Settings → Environment
Variables** for the Production environment, and that `NEXT_PUBLIC_APP_URL` matches the real domain —
invite links are built from it.

---

## How access works

Access is enforced at the data boundary, not in middleware. Every page and every API route calls
`requireVisitor()` or `requireAdmin()`, which re-reads the access link from the database on each
request. Revoking a link takes effect on the holder's very next navigation rather than whenever
their cookie happens to lapse.

Invite tokens are 32 bytes of entropy and are stored only as SHA-256 hashes — a database
compromise does not hand anyone a working link.

Document bytes are never served from a public URL. Every read is streamed through
`/api/documents/[id]/content`, which checks the caller's permissions first.

**On magic links.** A link with no second factor is frictionless, which is why it was chosen, but a
forwarded link would otherwise be logged as the original invitee. Each link is therefore bound to
the first device and network that opens it; later opens from elsewhere still work but are flagged
in the analytics as *"Opened from a new device"*. Treat that flag as a prompt to check, not proof
of anything.

### Staged disclosure

Material is released in three waves, which is how diligence normally runs:

| Stage | When you share it | Folders |
|---|---|---|
| **Teaser** | First conversations | 01 Company Overview · 05 Market Research · 09 Marketing · 10 FAQ |
| **Diligence** | Once there is real interest | + 03 Risk · 04 Financials · 06 Team · 07 Sales · 08 Product |
| **Confirmatory** | After a term sheet | + 02 Corporate & Legal |

Every invite defaults to **confirmatory**, meaning full access. Staging is something you opt a
particular investor into — never a trap that silently hides your financials from someone you meant
to show them to. Narrow a link to *teaser* for a first meeting, then raise it as the conversation
progresses.

A folder's stage is seeded once, when the room is first created, and never overwritten by re-running
the seed script. Change it per folder on the documents page, or per document where one file is more
sensitive than its neighbours.

**On watermarks.** The viewer stamps each page with the reader's address and blocks the obvious
copy paths — right-click, save, print. This deters casual sharing and makes a leaked screenshot
traceable. It cannot stop a determined person with a camera, and nothing else can either.

---

## Project layout

```
app/
  access/[token]/   Invite link entry — validates, opens a session, redirects
  nda/              Confidentiality gate
  room/             The visitor experience
  admin/            The console: analytics, invites, documents, settings
  api/
    documents/      Authorised document streaming and downloads
    track/          Analytics ingestion
components/
  brand/            The Namu mark
  room/             Room UI
  viewer/           The watermarked document viewer
  tracking/         Attention measurement
lib/
  db/schema.ts      Database schema — the contract everything builds on
  auth.ts           Sessions, tokens, and the permission checks
  analytics.ts      Recording and the aggregate queries behind the console
  room.ts           Permission-aware reads for visitors
  diligence.ts      The completeness check against the standard VC checklist
  notify.ts         Email
scripts/
  seed.ts           Folders, owner admin, default settings
  ingest.ts         Loads documents from ../namu-design into the room
  manifest.ts       Which source file goes in which folder
```

---

## Adding documents later

Either upload through **Admin → Documents**, or add an entry to `scripts/manifest.ts` and re-run
`npm run ingest` — it is idempotent, so re-running only picks up what changed.

---

## A note on the numbers

The most common reason diligence stalls is not a missing document — it is numbers that disagree.
Before you send a link, check that the figures in the deck, the financial model, and the traction
overview tell the same story. **Admin → Overview** runs a completeness check against what investors
expect to find; it cannot check consistency for you.
