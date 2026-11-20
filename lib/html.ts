// Text som ska in i HTML-strängar (innerHTML, maplibre Popup.setHTML, document.write) går ALLTID genom escapeHtml.
// Objektnamn, maskinnamn och personnamn kan ändras av inloggade användare; ett namn som `<img src=x onerror=…>` får
// aldrig tolkas som HTML. Föredra textContent/React-text där det går — det här är till de ställen som bygger en sträng.
// Vakt: lib/html.vakter.test.ts läser källan och larmar om en känd sink börjar använda ett namn utan escapeHtml.

const TECKEN: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escapeHtml(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"'`]/g, (c) => TECKEN[c]);
}
