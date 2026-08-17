'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { upload } from '@vercel/blob/client'
import { useRouter } from 'next/navigation'
import { registerClientUpload } from '@/app/admin/_actions/documents'
import { type ActionState } from '@/app/admin/_lib/action-state'
import {
  ACCEPTED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  isAllowedFile,
  safePathSegment,
} from '@/app/admin/_lib/upload-policy'
import type { FolderOption } from '@/app/admin/_lib/view-types'
import { cn, formatBytes } from '@/lib/utils'
import { ActionMessage } from './ActionMessage'
import { Card, Chip, Field, fieldClass, Note, SectionTitle } from './ui'

/**
 * Drag-and-drop upload, straight from the browser to Blob storage.
 *
 * It does not go through a Server Action, because it cannot: Next caps an
 * action body at 1 MB and Vercel caps any serverless request at 4.5 MB, while
 * the investor deck alone is 13 MB. `upload()` asks our own route for a
 * short-lived, folder-scoped token and then streams the file directly, so the
 * bytes never pass through a function and there is no practical size ceiling.
 *
 * Each file is registered as a document the moment its upload lands, rather
 * than in one batch at the end — a failure on file four leaves the first three
 * filed instead of discarding the lot.
 */

type Progress = {
  file: File
  status: 'waiting' | 'uploading' | 'done' | 'failed'
  percent: number
  message?: string
}

export function DocumentUploader({ folders }: { folders: FolderOption[] }) {
  const router = useRouter()
  const [dragging, setDragging] = useState(false)
  const [chosen, setChosen] = useState<File[]>([])
  const [progress, setProgress] = useState<Progress[]>([])
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<ActionState>({ status: 'idle', message: '' })
  const [folderId, setFolderId] = useState<string>(folders[0]?.id ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  function adopt(files: FileList | null) {
    if (!files || files.length === 0) return
    setChosen(Array.from(files))
    setState({ status: 'idle', message: '' })
    setProgress([])
  }

  async function startUpload() {
    if (!folderId || chosen.length === 0 || busy) return

    setBusy(true)
    setState({ status: 'idle', message: '' })
    setProgress(chosen.map((file) => ({ file, status: 'waiting', percent: 0 })))

    let succeeded = 0
    const failures: string[] = []

    for (const [index, file] of chosen.entries()) {
      if (!isAllowedFile(file.name) || file.size > MAX_UPLOAD_BYTES) {
        failures.push(file.name)
        setProgress((rows) =>
          rows.map((row, i) =>
            i === index ? { ...row, status: 'failed', message: 'Not accepted' } : row,
          ),
        )
        continue
      }

      setProgress((rows) =>
        rows.map((row, i) => (i === index ? { ...row, status: 'uploading' } : row)),
      )

      try {
        const folderSlug = folders.find((f) => f.id === folderId)?.name ?? 'documents'
        const blob = await upload(
          `documents/${safePathSegment(folderSlug)}/${safePathSegment(file.name)}`,
          file,
          {
            access: 'private',
            handleUploadUrl: '/api/blob/upload',
            clientPayload: JSON.stringify({ folderId, uploadedBy: 'admin' }),
            onUploadProgress: ({ percentage }) => {
              setProgress((rows) =>
                rows.map((row, i) => (i === index ? { ...row, percent: percentage } : row)),
              )
            },
          },
        )

        // Production also registers this through Blob's completion webhook; both
        // paths are idempotent, so whichever arrives second is a no-op.
        const result = await registerClientUpload({
          folderId,
          blobUrl: blob.url,
          pathname: blob.pathname,
          fileName: file.name,
          contentType: file.type || undefined,
          sizeBytes: file.size,
        })

        if (result.status === 'error') {
          failures.push(file.name)
          setProgress((rows) =>
            rows.map((row, i) =>
              i === index ? { ...row, status: 'failed', message: result.message } : row,
            ),
          )
          continue
        }

        succeeded += 1
        setProgress((rows) =>
          rows.map((row, i) => (i === index ? { ...row, status: 'done', percent: 100 } : row)),
        )
      } catch (error) {
        failures.push(file.name)
        setProgress((rows) =>
          rows.map((row, i) =>
            i === index
              ? {
                  ...row,
                  status: 'failed',
                  message: error instanceof Error ? error.message : 'Upload failed',
                }
              : row,
          ),
        )
      }
    }

    setBusy(false)

    if (succeeded > 0 && failures.length === 0) {
      setState({
        status: 'success',
        message: `${succeeded} file${succeeded === 1 ? '' : 's'} added.`,
      })
      setChosen([])
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } else if (succeeded > 0) {
      setState({
        status: 'error',
        message: `${succeeded} added, ${failures.length} failed: ${failures.join(', ')}`,
      })
      router.refresh()
    } else {
      setState({ status: 'error', message: `Nothing was uploaded. ${failures.join(', ')}` })
    }
  }

  const rejected = chosen.filter((file) => !isAllowedFile(file.name))

  if (folders.length === 0) {
    return (
      <Card>
        <SectionTitle>Upload</SectionTitle>
        <Note>
          There is nowhere to put a file yet. Create a folder first — the room is organised by
          folder, and every document belongs to exactly one.
        </Note>
      </Card>
    )
  }

  return (
    <Card>
      <SectionTitle>Upload</SectionTitle>

      <div className="flex flex-col gap-4">
        <Field label="Into which folder" htmlFor="upload-folder">
          <select
            id="upload-folder"
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            className={fieldClass()}
            required
          >
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </Field>

        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            adopt(event.dataTransfer.files)
          }}
          className={cn(
            'rounded-[12px] border border-dashed px-5 py-8 text-center transition-colors duration-200',
            dragging
              ? 'border-[var(--color-sahel)] bg-[color-mix(in_oklab,var(--color-sahel)_8%,transparent)]'
              : 'border-[var(--border-strong)] bg-[var(--surface)]',
          )}
        >
          <Upload size={18} aria-hidden className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-[0.9rem] text-[var(--text-primary)]">
            Drop files here, or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="underline decoration-[var(--border-strong)] underline-offset-[3px] hover:decoration-[var(--color-sahel)]"
            >
              choose them
            </button>
          </p>
          <Note className="mt-2">
            PDF, spreadsheets, documents, slides, images and archives. Titles are taken from the
            file name and can be edited afterwards.
          </Note>

          <input
            ref={inputRef}
            id="upload-files"
            type="file"
            multiple
            accept={ACCEPTED_UPLOAD_TYPES}
            onChange={(event) => adopt(event.target.files)}
            className="sr-only"
            aria-label="Files to upload"
          />
        </div>

        {progress.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {progress.map((row) => (
              <li
                key={`${row.file.name}-${row.file.size}`}
                className="rounded-[8px] bg-[var(--surface-sunken)] px-3 py-2 text-[0.8rem]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[var(--text-primary)]">
                    {row.file.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {row.status === 'failed' ? (
                      <Chip tone="attention">{row.message ?? 'Failed'}</Chip>
                    ) : row.status === 'done' ? (
                      <Chip tone="muted">Added</Chip>
                    ) : null}
                    <span className="tnum text-[var(--text-muted)]">
                      {formatBytes(row.file.size)}
                    </span>
                  </span>
                </div>
                {row.status === 'uploading' ? (
                  <div
                    className="mt-2 h-[3px] overflow-hidden rounded-full bg-[var(--border-subtle)]"
                    role="progressbar"
                    aria-valuenow={Math.round(row.percent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${row.file.name}`}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-200"
                      style={{
                        width: `${row.percent}%`,
                        background: 'var(--color-sahel)',
                      }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : chosen.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {chosen.map((file) => (
              <li
                key={`${file.name}-${file.size}`}
                className="flex items-center justify-between gap-3 rounded-[8px] bg-[var(--surface-sunken)] px-3 py-2 text-[0.8rem]"
              >
                <span className="min-w-0 truncate text-[var(--text-primary)]">{file.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {!isAllowedFile(file.name) ? <Chip tone="attention">Not accepted</Chip> : null}
                  <span className="tnum text-[var(--text-muted)]">{formatBytes(file.size)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <ActionMessage state={state} />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={startUpload}
            disabled={chosen.length === 0 || busy}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.85rem] font-medium',
              'transition-transform duration-200 hover:-translate-y-[1px]',
              'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0',
            )}
            style={{ background: 'var(--text-primary)', color: 'var(--surface)' }}
          >
            <Upload size={14} aria-hidden />
            {busy
              ? 'Uploading…'
              : `Upload${chosen.length > 0 ? ` ${chosen.length} file${chosen.length === 1 ? '' : 's'}` : ''}`}
          </button>
        </div>
      </div>

      {rejected.length > 0 ? (
        <Note className="mt-4">
          {rejected.length} file{rejected.length === 1 ? '' : 's'} will be refused: only the listed
          types are accepted.
        </Note>
      ) : null}

      <Note className="mt-4">
        Files stream straight from this browser to storage, so there is no request-size ceiling —
        the limit is {formatBytes(MAX_UPLOAD_BYTES)} per file. Each one is filed as soon as it
        lands, so a failure part-way through keeps whatever already succeeded.
      </Note>
    </Card>
  )
}
