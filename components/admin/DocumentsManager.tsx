'use client'

import { useActionState, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FolderPlus,
  Save,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import {
  createFolder,
  deleteDocument,
  deleteFolder,
  moveDocument,
  moveFolder,
  seedFolderBlueprint,
  updateDocument,
  updateFolder,
} from '@/app/admin/_actions/documents'
import { IDLE, type ActionState } from '@/app/admin/_lib/action-state'
import { formatCount, formatPercent } from '@/app/admin/_lib/format'
import { kindLabel } from '@/app/admin/_lib/phrasing'
import { cn, formatBytes, formatDuration } from '@/lib/utils'
import { folderIndex } from '@/lib/brand'
import { TIERS, TIER_LABELS, TIER_DESCRIPTIONS } from '@/lib/db/schema'
import { ActionMessage } from './ActionMessage'
import { RelativeTime } from './RelativeTime'
import { ConfirmSubmit, IconSubmit, SubmitButton } from './SubmitButton'
import { buttonClass, Card, Chip, Field, fieldClass, Note, SectionTitle, Td, Th } from './ui'

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export type DocumentStatsView = {
  uniqueViewers: number
  opens: number
  totalActiveMs: number
  avgActiveMs: number
  avgCompletion: number
  downloads: number
  lastOpenedAt: string | null
}

export type DocumentView = {
  id: string
  title: string
  description: string | null
  fileName: string
  kind: string
  sizeBytes: number
  pageCount: number | null
  isHidden: boolean
  downloadPolicy: string
  uploadedBy: string | null
  createdAt: string
  stats: DocumentStatsView
}

export type FolderView = {
  id: string
  name: string
  slug: string
  description: string | null
  isHidden: boolean
  /** teaser | diligence | confirmatory */
  tier: string
  documents: DocumentView[]
}

const DOWNLOAD_POLICIES = [
  { value: 'inherit', label: 'Inherit — follow the visitor’s permission' },
  { value: 'never', label: 'Never — this file can never be downloaded' },
  { value: 'allow', label: 'Allow — anyone who can see it can download it' },
] as const

const POLICY_CHIP: Record<string, { label: string; tone: 'muted' | 'neutral' | 'attention' }> = {
  inherit: { label: 'Inherits', tone: 'muted' },
  never: { label: 'No download', tone: 'attention' },
  allow: { label: 'Downloadable', tone: 'neutral' },
}

/* -------------------------------------------------------------------------- */
/*  Reorder                                                                    */
/* -------------------------------------------------------------------------- */

function ReorderControls({
  kind,
  id,
  canUp,
  canDown,
  label,
}: {
  kind: 'folder' | 'document'
  id: string
  canUp: boolean
  canDown: boolean
  label: string
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    kind === 'folder' ? moveFolder : moveDocument,
    IDLE,
  )

  return (
    <form action={action} className="flex items-center gap-0.5">
      <input type="hidden" name={kind === 'folder' ? 'folderId' : 'documentId'} value={id} />
      <IconSubmit name="direction" value="up" label={`Move ${label} up`} disabled={!canUp}>
        <ArrowUp size={13} aria-hidden />
      </IconSubmit>
      <IconSubmit name="direction" value="down" label={`Move ${label} down`} disabled={!canDown}>
        <ArrowDown size={13} aria-hidden />
      </IconSubmit>
      <ActionMessage state={state} className="sr-only" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  One document                                                               */
/* -------------------------------------------------------------------------- */

function DocumentSettings({ doc, onDone }: { doc: DocumentView; onDone: () => void }) {
  const [saveState, saveAction] = useActionState<ActionState, FormData>(updateDocument, IDLE)
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteDocument, IDLE)

  return (
    <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-5">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="documentId" value={doc.id} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Title" htmlFor={`title-${doc.id}`} hint={`File: ${doc.fileName}`}>
            <input
              id={`title-${doc.id}`}
              name="title"
              defaultValue={doc.title}
              required
              maxLength={200}
              className={fieldClass()}
            />
          </Field>

          <Field
            label="Download policy"
            htmlFor={`policy-${doc.id}`}
            hint="A document policy overrides the visitor’s own permission in both directions."
          >
            <select
              id={`policy-${doc.id}`}
              name="downloadPolicy"
              defaultValue={doc.downloadPolicy}
              className={fieldClass()}
            >
              {DOWNLOAD_POLICIES.map((policy) => (
                <option key={policy.value} value={policy.value}>
                  {policy.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Description"
          htmlFor={`desc-${doc.id}`}
          hint="Shown under the title in the room. One line is usually enough."
        >
          <textarea
            id={`desc-${doc.id}`}
            name="description"
            rows={2}
            defaultValue={doc.description ?? ''}
            className={fieldClass('resize-y')}
          />
        </Field>

        <label className="flex items-center gap-2.5 text-[0.85rem] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            name="isHidden"
            defaultChecked={doc.isHidden}
            className="h-4 w-4 accent-[var(--color-sahel)]"
          />
          Hide from visitors — the file stays here and stops appearing in the room
        </label>

        <ActionMessage state={saveState} />

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
            <Save size={13} aria-hidden />
            Save
          </SubmitButton>
          <button type="button" onClick={onDone} className={buttonClass('ghost', 'sm')}>
            Close
          </button>
        </div>
      </form>

      <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
        <form action={deleteAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="documentId" value={doc.id} />
          <ConfirmSubmit
            confirmMessage={`Delete “${doc.title}”? The file and every view recorded against it go with it.`}
          >
            <Trash2 size={13} aria-hidden />
            Delete this document
          </ConfirmSubmit>
          <Note>
            Removes the row and the stored file. The reading history recorded against it goes too.
          </Note>
        </form>
        <ActionMessage state={deleteState} className="mt-3" />
      </div>
    </div>
  )
}

function DocumentRow({
  doc,
  index,
  total,
  open,
  onToggle,
}: {
  doc: DocumentView
  index: number
  total: number
  open: boolean
  onToggle: () => void
}) {
  const policy = POLICY_CHIP[doc.downloadPolicy] ?? POLICY_CHIP.inherit!

  return (
    <>
      <tr
        className={cn(
          'border-b border-[var(--border-subtle)] transition-colors',
          open ? 'bg-[var(--surface-sunken)]' : 'hover:bg-[var(--surface-sunken)]',
        )}
      >
        <Td className="max-w-[300px]">
          <span className="flex items-start gap-2.5">
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[var(--text-primary)]">{doc.title}</span>
                {doc.isHidden ? (
                  <Chip tone="muted" title="Hidden from visitors.">
                    <EyeOff size={10} aria-hidden />
                    Hidden
                  </Chip>
                ) : null}
                <Chip tone={policy.tone}>{policy.label}</Chip>
              </span>
              <span className="block truncate text-[0.75rem] text-[var(--text-muted)]">
                {kindLabel(doc.kind)} · {formatBytes(doc.sizeBytes)}
                {doc.pageCount ? ` · ${doc.pageCount} pages` : ''}
              </span>
            </span>
          </span>
        </Td>

        <Td align="right" className="tnum hidden sm:table-cell">
          {formatCount(doc.stats.uniqueViewers)}
        </Td>
        <Td align="right" className="tnum hidden md:table-cell whitespace-nowrap">
          {doc.stats.opens > 0 ? formatDuration(doc.stats.avgActiveMs) : '—'}
        </Td>
        <Td align="right" className="tnum hidden lg:table-cell">
          {doc.stats.opens > 0 ? formatPercent(doc.stats.avgCompletion) : '—'}
        </Td>
        <Td align="right" className="tnum hidden xl:table-cell">
          {formatCount(doc.stats.downloads)}
        </Td>
        <Td className="hidden whitespace-nowrap lg:table-cell">
          {doc.stats.lastOpenedAt ? (
            <RelativeTime value={doc.stats.lastOpenedAt} />
          ) : (
            <span className="text-[var(--text-muted)]">Never opened</span>
          )}
        </Td>

        <Td align="right">
          <span className="flex items-center justify-end gap-1">
            <ReorderControls
              kind="document"
              id={doc.id}
              canUp={index > 0}
              canDown={index < total - 1}
              label={doc.title}
            />
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-label={`${open ? 'Close' : 'Open'} settings for ${doc.title}`}
              className={buttonClass('ghost', 'sm', 'h-8 w-8 !px-0')}
            >
              <SlidersHorizontal size={13} aria-hidden />
            </button>
          </span>
        </Td>
      </tr>

      {open ? (
        <tr>
          <td colSpan={7} className="p-0">
            <DocumentSettings doc={doc} onDone={onToggle} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  One folder                                                                 */
/* -------------------------------------------------------------------------- */

function FolderSettings({ folder, onDone }: { folder: FolderView; onDone: () => void }) {
  const [saveState, saveAction] = useActionState<ActionState, FormData>(updateFolder, IDLE)
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteFolder, IDLE)

  return (
    <div className="mt-4 rounded-[10px] bg-[var(--surface-sunken)] p-4">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="folderId" value={folder.id} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Field
            label="Name"
            htmlFor={`folder-name-${folder.id}`}
            hint={`Slug: ${folder.slug} — fixed, so renaming never breaks a link or its history.`}
          >
            <input
              id={`folder-name-${folder.id}`}
              name="name"
              defaultValue={folder.name}
              required
              className={fieldClass()}
            />
          </Field>

          <Field label="Description" htmlFor={`folder-desc-${folder.id}`}>
            <input
              id={`folder-desc-${folder.id}`}
              name="description"
              defaultValue={folder.description ?? ''}
              className={fieldClass()}
            />
          </Field>

          <Field
            label="Disclosure stage"
            htmlFor={`folder-tier-${folder.id}`}
            hint="Only affects links you have deliberately narrowed. Invites default to seeing everything."
          >
            <select
              id={`folder-tier-${folder.id}`}
              name="tier"
              defaultValue={folder.tier ?? 'diligence'}
              className={fieldClass()}
            >
              {TIERS.map((value) => (
                <option key={value} value={value}>
                  {TIER_LABELS[value]} — {TIER_DESCRIPTIONS[value]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex items-center gap-2.5 text-[0.85rem] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            name="isHidden"
            defaultChecked={folder.isHidden}
            className="h-4 w-4 accent-[var(--color-sahel)]"
          />
          Hide this folder and everything in it from visitors
        </label>

        <ActionMessage state={saveState} />

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
            <Save size={13} aria-hidden />
            Save folder
          </SubmitButton>
          <button type="button" onClick={onDone} className={buttonClass('ghost', 'sm')}>
            Close
          </button>
        </div>
      </form>

      <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
        <form action={deleteAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="folderId" value={folder.id} />
          <ConfirmSubmit confirmMessage={`Delete the folder “${folder.name}”?`}>
            <Trash2 size={13} aria-hidden />
            Delete folder
          </ConfirmSubmit>
          <Note>Only an empty folder can be deleted, so nothing is ever removed by surprise.</Note>
        </form>
        <ActionMessage state={deleteState} className="mt-3" />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  New folder                                                                 */
/* -------------------------------------------------------------------------- */

export function NewFolderForm({ showSeed }: { showSeed: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(createFolder, IDLE)
  const [seedState, seedAction] = useActionState<ActionState, FormData>(seedFolderBlueprint, IDLE)

  return (
    <Card>
      <SectionTitle>New folder</SectionTitle>

      <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Field label="Name" htmlFor="new-folder-name" className="flex-1">
          <input
            id="new-folder-name"
            name="name"
            required
            maxLength={120}
            placeholder="11-Board Materials"
            className={fieldClass()}
          />
        </Field>
        <Field label="Description" htmlFor="new-folder-desc" className="flex-1">
          <input
            id="new-folder-desc"
            name="description"
            maxLength={500}
            placeholder="What a reader will find inside"
            className={fieldClass()}
          />
        </Field>
        <SubmitButton variant="secondary" pendingLabel="Creating…" className="shrink-0">
          <FolderPlus size={14} aria-hidden />
          Create
        </SubmitButton>
      </form>

      <ActionMessage state={state} className="mt-3" />

      {showSeed ? (
        <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
          <form action={seedAction} className="flex flex-wrap items-center gap-3">
            <SubmitButton variant="ghost" size="sm" pendingLabel="Creating…">
              Use the ten-folder Namu structure
            </SubmitButton>
            <Note>
              Company Overview, Corporate &amp; Legal, Risk, Financials, Market, Team, Sales,
              Product, Marketing, FAQ — in that order.
            </Note>
          </form>
          <ActionMessage state={seedState} className="mt-3" />
        </div>
      ) : null}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  The manager                                                                */
/* -------------------------------------------------------------------------- */

export function DocumentsManager({ folders }: { folders: FolderView[] }) {
  const [openDoc, setOpenDoc] = useState<string | null>(null)
  const [openFolder, setOpenFolder] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-5">
      {folders.map((folder, folderPosition) => {
        const index = folderIndex(folder.name)
        const settingsOpen = openFolder === folder.id

        return (
          <section key={folder.id} className="namu-card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5 sm:px-6">
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2.5 font-display text-[1.25rem] leading-tight text-[var(--text-primary)]">
                  {index ? (
                    <span className="tnum rounded-[5px] bg-[var(--surface-sunken)] px-1.5 py-0.5 font-sans text-[0.7rem] text-[var(--text-muted)]">
                      {index}
                    </span>
                  ) : null}
                  {folder.name.replace(/^\d+\s*-\s*/, '')}
                  {folder.isHidden ? (
                    <Chip tone="muted" title="This folder and its contents are hidden from visitors.">
                      <EyeOff size={10} aria-hidden />
                      Hidden
                    </Chip>
                  ) : null}
                </h2>
                {folder.description ? (
                  <p className="text-pretty mt-1.5 max-w-xl text-[0.85rem] leading-relaxed text-[var(--text-secondary)]">
                    {folder.description}
                  </p>
                ) : null}
                <p className="tnum mt-1.5 text-[0.75rem] text-[var(--text-muted)]">
                  {formatCount(folder.documents.length)} document
                  {folder.documents.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <ReorderControls
                  kind="folder"
                  id={folder.id}
                  canUp={folderPosition > 0}
                  canDown={folderPosition < folders.length - 1}
                  label={folder.name}
                />
                <button
                  type="button"
                  onClick={() => setOpenFolder(settingsOpen ? null : folder.id)}
                  aria-expanded={settingsOpen}
                  aria-label={`${settingsOpen ? 'Close' : 'Open'} settings for ${folder.name}`}
                  className={buttonClass('ghost', 'sm', 'h-8 w-8 !px-0')}
                >
                  <SlidersHorizontal size={13} aria-hidden />
                </button>
              </div>
            </div>

            <div className="px-5 sm:px-6">
              {settingsOpen ? (
                <FolderSettings folder={folder} onDone={() => setOpenFolder(null)} />
              ) : null}
            </div>

            {folder.documents.length === 0 ? (
              <div className="px-5 pb-6 pt-5 sm:px-6">
                <Note>
                  Nothing in this folder yet. A folder with no documents is invisible to visitors,
                  so an empty one is harmless.
                </Note>
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="border-y border-[var(--border-subtle)]">
                      <Th>Document</Th>
                      <Th align="right" className="hidden sm:table-cell">
                        Readers
                      </Th>
                      <Th align="right" className="hidden md:table-cell">
                        Avg time
                      </Th>
                      <Th align="right" className="hidden lg:table-cell">
                        Avg read
                      </Th>
                      <Th align="right" className="hidden xl:table-cell">
                        Downloads
                      </Th>
                      <Th className="hidden lg:table-cell">Last opened</Th>
                      <Th align="right">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {folder.documents.map((doc, position) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        index={position}
                        total={folder.documents.length}
                        open={openDoc === doc.id}
                        onToggle={() => setOpenDoc(openDoc === doc.id ? null : doc.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Legend for the stats columns, rendered under the manager. */
export function DocumentsLegend() {
  return (
    <Note className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="flex items-center gap-1.5">
        <Eye size={12} aria-hidden />
        Readers counts distinct people, not opens.
      </span>
      <span>Avg read is the share of pages actually dwelt on, averaged across readers.</span>
      <span>Order here is the order visitors see.</span>
    </Note>
  )
}
