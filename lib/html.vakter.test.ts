/**
 * Varje fil som bygger HTML av text (innerHTML = `…${x}…`, Popup.setHTML, document.write, dangerouslySetInnerHTML) ska
 * antingen använda escapeHtml (lib/html.ts) eller stå på listan nedan med skälet till att det är säkert. En NY sådan fil
 * larmar här tills någon avgjort vilket. (Audit 2026-10-22, punkt 5: objektnamn i Översiktskartan.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROT = join(__dirname, "..");
const SINK = /\.innerHTML\s*=\s*`[^`]*\$\{|\.setHTML\(|document\.write\(|dangerouslySetInnerHTML/;

/** Filer där sinken är säker utan escapeHtml — med skäl. */
const TILLATNA: Record<string, string> = {
  "components/admin/VilobrottUnderflik.tsx": "skriver html från lib/admin/vilobrottPdf.ts, som har en egen escape() över varje namn och fritext",
  "components/besok/BesokKarta.tsx": "markörens text är ROLL_NAMN (lib/besok/sakerhet.ts), en fast tabell med 'Skördare'/'Skotare' — ingen användartext",
  "components/malbild/Malbild.tsx": "svg byggd ur egna konstanter (ingen användartext)",
  "components/inventarier/EtikettUtskrift.tsx": "QR-svg genererad av QR-biblioteket ur ett id",
};

function filer(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "supabase", "docs", "public"].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) filer(p, ut);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n)) ut.push(p);
  }
  return ut;
}

describe("HTML byggs aldrig av oescapad text", () => {
  const kalla = ["app", "components", "lib"].flatMap(d => filer(join(ROT, d))).map(p => ({ rel: relative(ROT, p).replace(/\\/g, "/"), src: readFileSync(p, "utf8") }));
  const medSink = kalla.filter(f => SINK.test(f.src));

  it("varje fil med en sink använder escapeHtml eller står på listan över säkra", () => {
    const olosta = medSink.filter(f => !/from ['"]@\/lib\/html['"]/.test(f.src) && !(f.rel in TILLATNA)).map(f => f.rel);
    expect(olosta).toEqual([]);
  });

  it("listan över säkra filer är inte föråldrad (varje fil på den har fortfarande en sink)", () => {
    const utanSink = Object.keys(TILLATNA).filter(r => !medSink.some(f => f.rel === r));
    expect(utanSink).toEqual([]);
  });

  it("Översiktskartans etiketter: inget namn går in i en innerHTML-mall utan escapeHtml", () => {
    const src = kalla.find(f => f.rel === "app/oversikt/OversiktKarta.tsx")!.src;
    const mallar = src.split("\n").filter(l => /\.innerHTML\s*=\s*`/.test(l) || /const frisk = /.test(l));
    const farliga = mallar.flatMap(l => Array.from(l.matchAll(/\$\{([^}]+)\}/g)).map(m => m[1].trim()))
      .filter(uttryck => /\b(namn|label|s|volLabel|obj\.namn|info\.label)\b/.test(uttryck) && !/escapeHtml\(/.test(uttryck));
    expect(farliga).toEqual([]);
  });

  // Sinkar vars HTML byggs i en stor komponent som inte går att montera i ett test: ingen rå interpolering av användartext.
  const RAA: Array<[string, RegExp[]]> = [
    ["app/planering/KartaVy.tsx", [/\$\{\s*objekt\.namn\s*\}/, /\$\{\s*objekt\.volym[^}]*\}/]],
    ["app/karta/page.tsx", [/\$\{\s*obj\.namn\s*\}/]],
    ["components/arbetsrapport/Arbetsrapport.tsx", [/\$\{\s*r\.anledning[^}]*\}/, /\$\{\s*b\.beskrivning[^}]*\}/]],
  ];
  it("Arbetsrapportens utskrift: personens namn är escapat (skuggad variabel före mallen)", () => {
    const src = kalla.find(f => f.rel === "components/arbetsrapport/Arbetsrapport.tsx")!.src;
    expect(src).toContain("const medarbetare = { namn: escapeHtml(medarbetareForeUtskrift?.namn) };");
  });
  it("Översiktens maskinmarkör: färskhetstexten är escapad (skuggad variabel före mallen)", () => {
    const src = kalla.find(f => f.rel === "app/oversikt/OversiktKarta.tsx")!.src;
    expect(src).toContain("const farskhet = farskhetRaa ? escapeHtml(farskhetRaa) : null;");
  });
  it.each(RAA)("%s: användartext i HTML-mallar går genom escapeHtml", (rel, monster) => {
    const src = kalla.find(f => f.rel === rel)!.src;
    for (const m of monster) expect(src.match(m), `${rel}: ${m}`).toBeNull();
    expect(src).toMatch(/from ['"]@\/lib\/html['"]/);
    expect(src).toContain("escapeHtml(");
  });
});
