'use client'

import { useEffect } from 'react'
import {
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  Image as ImageIcon,
  Presentation,
  type LucideIcon,
} from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { brand } from '@/lib/brand'
import { useDocumentTracking } from './useDocumentTracking'
import { documentDownloadUrl, kindLabel, type RendererProps } from './types'

const ICONS: Record<string, LucideIcon> = {
  sheet: FileSpreadsheet,
  doc: FileText,
  slides: Presentation,
  image: ImageIcon,
  web: Globe,
}

const EXPLANATIONS: Record<string, string> = {
  sheet:
    'Excel workbooks keep their formulas, named ranges and formatting in a way no browser preview reproduces faithfully. Rendering a lossy approximation of a financial model would be worse than not rendering it at all.',
  doc: 'Word documents depend on fonts, styles and tracked changes that a browser preview would quietly drop.',
  slides:
    'PowerPoint and Keynote decks rely on embedded fonts, transitions and layouts that do not survive conversion.',
  archive: 'Archives have to be unpacked before anything inside them can be read.',
}

const DEFAULT_EXPLANATION =
  'There is no faithful way to render this file type in a browser, so it is offered as a download rather than as an approximation.'

/**
 * The honest fallback.
 *
 * No fake preview, no blurred placeholder, no "loading…" that never finishes.
 * It says what the file is, how big it is, and what the reader can do next.
 */
export function UnsupportedPreview({ doc, canDownload }: RendererProps) {
  // Opening a file the room cannot render still counts as a document view: it
  // tells you which documents an investor went looking for.
  const { reportProgress } = useDocumentTracking(doc.id, doc.pageCount ?? undefined)

  useEffect(() => {
    reportProgress(1, 1)
  }, [reportProgress])

  const Icon = ICONS[doc.kind] ?? FileText
  const explanation = EXPLANATIONS[doc.kind] ?? DEFAULT_EXPLANATION

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-[var(--surface-sunken)] p-6">
      <div className="namu-card w-full max-w-md p-8 text-center animate-fade-up">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-sunken)]">
          <Icon className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.4} aria-hidden="true" />
        </div>

        <h2 className="font-display mt-5 text-[20px] leading-snug text-[var(--text-primary)]">
          Preview not available in-browser
        </h2>

        <p className="mt-2 text-[13px] text-[var(--text-muted)] tnum">
          {kindLabel(doc)}
          {doc.sizeBytes ? ` · ${formatBytes(doc.sizeBytes)}` : ''}
        </p>

        <p className="mt-4 text-[13.5px] leading-relaxed text-[var(--text-secondary)] text-pretty">
          {explanation}
        </p>

        <div className="mt-7">
          {canDownload ? (
            <a
              href={documentDownloadUrl(doc.id)}
              download={doc.fileName}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] px-5 py-2.5 text-[13px] font-medium text-[var(--surface-raised)] transition-opacity duration-300 hover:opacity-90"
              style={{ transitionTimingFunction: 'var(--ease-namu)' }}
            >
              <Download className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
              Download {doc.fileName.split('.').pop()?.toUpperCase()}
            </a>
          ) : (
            <div className="rounded-[10px] border border-dashed border-[var(--border-subtle)] px-4 py-3.5">
              <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                Downloads are off for your access. Ask{' '}
                <a
                  href={`mailto:${brand.contact}?subject=${encodeURIComponent(`Data room — ${doc.title}`)}`}
                  className="text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-2"
                >
                  {brand.contact}
                </a>{' '}
                for a copy and it will be sent to you directly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UnsupportedPreview
