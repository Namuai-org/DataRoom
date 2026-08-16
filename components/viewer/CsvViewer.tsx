'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Watermark } from './Watermark'
import { useDocumentTracking } from './useDocumentTracking'
import { useViewerProtection } from './useViewerProtection'
import { parseCsv, isNumericColumn, type CsvTable } from './csv'
import { documentContentUrl, type RendererProps } from './types'

type Status = 'loading' | 'ready' | 'error'

/**
 * CSV is the one spreadsheet format that can be rendered honestly in a browser
 * without pretending to be Excel, so it gets a real table rather than a
 * "download to view" card.
 */
export function CsvViewer({ doc, watermark }: RendererProps) {
  const { reportProgress, trackEvent } = useDocumentTracking(doc.id, doc.pageCount ?? undefined)
  const protection = useViewerProtection({
    onPrintAttempt: useCallback(() => {
      trackEvent('print_attempt', doc.title, { kind: 'csv' })
    }, [trackEvent, doc.title]),
  })

  const [status, setStatus] = useState<Status>('loading')
  const [table, setTable] = useState<CsvTable | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch(documentContentUrl(doc.id), {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? 'This document is not part of your access.'
              : `The file could not be loaded (${response.status}).`,
          )
        }
        const text = await response.text()
        if (controller.signal.aborted) return
        setTable(parseCsv(text))
        setStatus('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        console.error('[viewer] csv load failed', error)
        setErrorMessage(error instanceof Error ? error.message : 'The file could not be loaded.')
        setStatus('error')
      }
    })()

    return () => controller.abort()
  }, [doc.id])

  useEffect(() => {
    reportProgress(1, 1)
  }, [reportProgress])

  const numericColumns = useMemo(() => {
    if (!table) return new Set<number>()
    const set = new Set<number>()
    for (let index = 0; index < table.header.length; index++) {
      if (isNumericColumn(table.rows, index)) set.add(index)
    }
    return set
  }, [table])

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface-sunken)]">
        <LoaderCircle
          className="h-5 w-5 animate-spin text-[var(--text-muted)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
    )
  }

  if (status === 'error' || !table) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface-sunken)] p-8">
        <div className="namu-card max-w-sm p-7 text-center">
          <TriangleAlert
            className="mx-auto h-5 w-5 text-[var(--text-muted)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h2 className="font-display mt-4 text-[18px] text-[var(--text-primary)]">
            This table didn&rsquo;t load
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {errorMessage}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full" {...protection.containerProps}>
      <div className="no-select h-full w-full overflow-auto overscroll-contain bg-[var(--surface-sunken)] p-4 sm:p-6">
        <div className="relative mx-auto max-w-full">
          <div className="namu-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <caption className="sr-only">{doc.title}</caption>
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                    {table.header.map((cell, index) => (
                      <th
                        key={index}
                        scope="col"
                        className={cn(
                          'label whitespace-nowrap px-3.5 py-2.5 text-[var(--text-secondary)]',
                          numericColumns.has(index) ? 'text-right' : 'text-left',
                        )}
                      >
                        {cell || `Column ${index + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className="border-b border-[var(--border-subtle)] last:border-b-0"
                    >
                      {table.header.map((_, columnIndex) => (
                        <td
                          key={columnIndex}
                          className={cn(
                            'max-w-[26rem] truncate px-3.5 py-2 text-[var(--text-primary)]',
                            numericColumns.has(columnIndex) && 'tnum text-right',
                          )}
                          title={row[columnIndex] ?? ''}
                        >
                          {row[columnIndex] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {table.truncatedRows > 0 && (
            <p className="mt-3 text-center text-[12px] text-[var(--text-muted)] tnum">
              Showing the first {table.rows.length.toLocaleString()} rows ·{' '}
              {table.truncatedRows.toLocaleString()} more in the file
            </p>
          )}

          <Watermark text={watermark} />
        </div>
      </div>
    </div>
  )
}

export default CsvViewer
