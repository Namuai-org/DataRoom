# Ingestion scripts

Two scripts stand the data room up from nothing: `seed` creates the structure,
`ingest` fills it with Namu's real documents. Both are safe to run repeatedly.

| File          | What it does                                                                |
| ------------- | --------------------------------------------------------------------------- |
| `manifest.ts` | The curated list: which source file goes in which folder, under what title.   |
| `seed.ts`     | Creates the ten folders, the owner admin, and the room's default settings.    |
| `ingest.ts`   | Uploads every manifest document to Blob storage and records it in Postgres.   |
| `shared.ts`   | Environment loading, the folder upsert both scripts use, console helpers.     |

## Environment

Put these in `.env.local` at the project root. `vercel env pull .env.local`
fetches all of them at once once the stores exist.

| Variable                | Needed by      | Where it comes from                                          |
| ----------------------- | -------------- | ------------------------------------------------------------ |
| `DATABASE_URL`          | seed, ingest   | Vercel dashboard → Storage → Neon → the `.env.local` tab      |
| `BLOB_READ_WRITE_TOKEN` | ingest         | Vercel dashboard → Storage → Blob → the `.env.local` tab      |
| `OWNER_EMAIL`           | seed, optional | Whoever signs in as owner. Defaults to `mouhamad@namuai.org`. |
| `NAMU_SOURCE_ROOT`      | ingest, optional | Where the source documents live. Defaults to `/Users/mouhamad/Desktop/Namu/namu-design`. |

If a required variable is missing the script says which one and where to find
it, then stops. `--dry-run` needs no environment at all.

## Order to run

```bash
npm run db:push                 # create the tables (drizzle-kit)
npm run seed                    # folders, owner admin, settings, NDA
npm run ingest -- --dry-run     # read the plan; nothing is touched
npm run ingest                  # upload and record
```

`db:push` first, always — the other two write to tables that must already exist.
After that, `seed` and `ingest` can be re-run in any order, as often as you like.

### seed

Creates the ten folders from `FOLDER_BLUEPRINT` in `lib/brand.ts`, seeds the
owner admin row if the `admins` table is empty, and writes the default settings:
room title, welcome message, the mutual NDA (version `2026-08-v1`), and the
watermark and download defaults.

Existing settings are left alone, on the assumption that anything already in the
table was changed deliberately in the admin console. `npm run seed --
--reset-settings` puts every one of them back to the defaults in the script,
including the NDA text.

### ingest

```bash
npm run ingest -- --dry-run              # the plan, no environment needed
npm run ingest                           # the real thing
npm run ingest -- --force                # re-upload everything
npm run ingest -- --folder=market-research
npm run ingest -- --concurrency=2        # gentler on a slow connection
```

Four files upload at a time. Each one logs a line as it lands, and the run ends
with a per-folder count and total size. A source file listed in the manifest but
missing from disk is reported as a warning and skipped — one absent file never
fails the run.

**Idempotency.** A document is identified by the folder it is in and its file
name. On a re-run:

- the file is unchanged → the row's title, description, and position are
  refreshed and Blob storage is not touched;
- the file's size or modification time changed → it is re-uploaded, `version`
  goes up by one, and the superseded blob is deleted;
- the row does not exist → it is created.

Modification times are remembered in `scripts/.ingest-cache/state.json`, which
git ignores. Deleting it is harmless: the next run falls back to comparing file
sizes, which catches almost everything, and `--force` catches the rest.

**Why the blobs are safe.** Uploads use `access: 'public'` because that is the
only mode the store offers, but no visitor ever receives a blob URL. The app
keeps `blobUrl` server-side and streams bytes through an authorised route that
checks the session, the link, and the folder first. `addRandomSuffix: true` adds
an unguessable segment to every pathname as well, so knowing a folder and a file
name is not enough to construct the URL and go around that route.

## Adding a document later

### Through the admin console

Sign in at `/admin`, open the folder, and upload. This is the right route for
anything ad hoc — a signed agreement, an updated statement, something a specific
investor asked for. Nothing needs to be edited here, but note that the manifest
will not know about the document: a later `npm run ingest` leaves it alone
rather than removing it.

### Through the manifest

The right route for anything that belongs in the room permanently.

1. Put the file under the source root, preferring PDF where you have a choice —
   PDFs open in the in-browser viewer, while spreadsheets get an honest
   "download to open" card.
2. Add an entry to `manifest.ts`:

   ```ts
   {
     folderSlug: 'accounting-financials',
     sourcePath: 'momowork/historical-financial-statements/Namu_Q3_Summary.xlsx',
     title: 'Q3 Summary',
     description: 'Income, expenses, and closing cash for the third quarter.',
     sortOrder: 11,
   },
   ```

   Give it a clean human title, not a file name. Write a description that says
   what is inside — grounded, specific, no adjectives doing persuasive work.
   `sortOrder` is per folder and starts at 1; renumber the neighbours if the new
   document belongs partway up the list.

3. `npm run ingest -- --dry-run` to check the file is found and lands where you
   meant, then `npm run ingest`.

The ingest refuses to start if two entries claim the same source file, the same
blob path, or the same position in a folder, so a copy-paste slip is caught
before anything uploads.

**Renaming and replacing.** Changing `title`, `description`, or `sortOrder`
updates the existing row in place. Changing `sourcePath` to a file with a
different name creates a second document rather than replacing the first —
delete the old one in the admin console, or set `fileName` on the entry to keep
the original identity. Replacing the file at the same path is the clean way to
publish a new revision: the version number goes up and the old blob is removed.

**Removing a document.** Delete its manifest entry so it does not come back, then
delete the document in the admin console. The ingest only ever adds and updates;
it will not remove a row you did not ask it to.
