/**
 * The dotted leader that runs from a title to its extent, as in the contents
 * page of a book. It fills whatever horizontal space is left, so the numerals
 * align in a column no matter how long the titles are.
 *
 * Hidden below 640px, where there is no room left to lead across.
 */
export function Leader() {
  return <span aria-hidden className="leader mx-3 hidden flex-1 sm:block" />
}
