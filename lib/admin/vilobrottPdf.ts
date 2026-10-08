// Utskriften "för Arbetsmiljöverket": ett fristående HTML-dokument (ljust, för papper) som öppnas i ett eget
// fönster och skrivs ut. Hör inte till admins mörka gränssnitt, därför ligger det här och inte i vyn.
import type { VilobrottRad } from "@/lib/admin/vilobrottLista";

export function byggPdfHtml(brott: VilobrottRad[]): string {
  const idag = new Date().toLocaleDateString("sv-SE");
  const grupperat = new Map<string, VilobrottRad[]>();
  for (const b of brott) {
    if (!grupperat.has(b.namn)) grupperat.set(b.namn, []);
    grupperat.get(b.namn)!.push(b);
  }
  const sektioner = Array.from(grupperat.entries()).map(([namn, lista]: [string, VilobrottRad[]]) => `
    <h3>${escape(namn)} (${lista.length} brott)</h3>
    <table>
      <thead><tr><th>Datum</th><th>Vecka</th><th>Typ</th><th>Vila</th><th>Krav</th><th>Beskrivning</th><th>Förarens svar</th></tr></thead>
      <tbody>
        ${lista.map(b => `
          <tr>
            <td>${b.datum}</td>
            <td>v.${b.vecka} ${b.år}</td>
            <td>${b.typ === "dygnsvila" ? "Dygnsvila" : "Veckovila"}</td>
            <td>${b.vila_h} h</td>
            <td>${b.krav_h} h</td>
            <td>${escape(b.beskrivning)}</td>
            <td>${b.svar ? escape(b.svar) : "Obesvarat"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `).join("");

  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>Vilobrottsrapport ${idag}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 32px; color: #111; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  h3 { font-size: 15px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ccc; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 6px 8px; background: #f4f4f4; border-bottom: 1px solid #ddd; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .summary { background: #fff5f5; border: 1px solid #fcc; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <h1>Vilobrottsrapport — Kompersmåla Skog</h1>
  <div class="meta">Genererad ${idag} · Period: senaste 3 månaderna</div>
  <div class="summary">
    <strong>Sammanfattning:</strong> Totalt ${brott.length} vilobrott upptäckta hos ${grupperat.size} medarbetare.
    Dygnsvila bruten ${brott.filter(b => b.typ === "dygnsvila").length} gånger.
    Veckovila bruten ${brott.filter(b => b.typ === "veckovila").length} gånger.
    Obesvarade av föraren: ${brott.filter(b => !b.svar).length}.
  </div>
  ${sektioner}
</body>
</html>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  } as Record<string, string>)[c]);
}
