import 'server-only'

/**
 * Best-effort page count for an uploaded PDF.
 *
 * This counts `/Type /Page` object declarations in the raw bytes. It is a
 * heuristic, not a parser: linearised, object-stream-compressed, or encrypted
 * PDFs will not match and the count comes back null. Null is an honest answer —
 * completion percentages simply stay unavailable for that document rather than
 * being computed from a wrong denominator.
 *
 * pdfjs-dist is in the dependency list and would be exact, but it is a heavy
 * import to pull into an upload path that has a request-time budget. If exact
 * counts matter later, do it in a background job, not here.
 */
export function bestEffortPdfPageCount(bytes: ArrayBuffer | Uint8Array): number | null {
  try {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    // latin1 keeps every byte at one character, so offsets in the regex match
    // offsets in the file and no multi-byte sequence can fabricate a match.
    const text = Buffer.from(view).toString('latin1')

    // A page object looks like "/Type /Page" but must not match "/Pages",
    // which is the tree node above it.
    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g)
    const fromObjects = pageMatches?.length ?? 0

    // The page tree usually states its own size; when it does it is the more
    // trustworthy of the two.
    const countMatches = [...text.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/g)]
    const fromTree = countMatches.reduce((best, match) => {
      const n = Number(match[1])
      return Number.isFinite(n) && n > best ? n : best
    }, 0)

    const best = Math.max(fromObjects, fromTree)
    if (!best || best > 20_000) return null
    return best
  } catch {
    return null
  }
}
