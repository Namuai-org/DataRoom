import { FileText, FileSpreadsheet, Presentation, Image, Globe, File, Archive } from 'lucide-react'

/**
 * File-kind icons. Colour is carried by the icon itself rather than a filled
 * tile — the brand board asks for quiet surfaces, and ten bright chips in a
 * list would fight the Sahel accent for attention.
 */

const ICONS = {
  pdf: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  doc: FileText,
  image: Image,
  web: Globe,
  archive: Archive,
  other: File,
} as const

const LABELS: Record<string, string> = {
  pdf: 'PDF',
  sheet: 'Spreadsheet',
  slides: 'Slides',
  doc: 'Document',
  image: 'Image',
  web: 'Web page',
  archive: 'Archive',
  other: 'File',
}

export function DocumentIcon({ kind, size = 17 }: { kind: string; size?: number }) {
  const Icon = ICONS[kind as keyof typeof ICONS] ?? ICONS.other
  return <Icon size={size} strokeWidth={1.6} aria-hidden />
}

export function kindLabel(kind: string): string {
  return LABELS[kind] ?? 'File'
}
