/**
 * Inserts one `<style>` block into the document head, once — inline
 * `style.cssText` (used everywhere else in `ui/`) has no way to express a
 * `@media` query, and re-inserting the same rule on every overlay open would
 * just pile up duplicate `<style>` tags for no effect.
 */
export function ensureStyleOnce(id: string, css: string): void {
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = css
  document.head.appendChild(style)
}
