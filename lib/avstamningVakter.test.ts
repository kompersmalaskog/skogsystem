import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Källkodsvakter för kopplingen mellan planeringssidan och den löpande avstämningen (page.tsx är 23 000 rader och går inte att montera i vitest).
// Beteendet är bevisat i objektAvstamning.test.ts / objektKandidater.test.ts och i testselens scen-a4 — de här vakterna larmar om kopplingen bryts.
const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = readFileSync(new URL('./maskindatorStart.ts', import.meta.url), 'utf8');

describe('avstämningen är LÖPANDE — inte en engångsutvärdering', () => {
  it('engångs-maskineriet (A4-ref, bytes-ref, startobjekt-ref, starttyp-ref, avstamningsAtgard) finns inte kvar', () => {
    for (const namn of ['maskindatorA4Ref', 'maskindatorBytteRef', 'maskindatorStartObjektIdRef', 'maskindatorStartTypRef']) expect(page).not.toContain(namn);
    expect(page).not.toContain('avstamningsAtgard');
    expect(start).not.toMatch(/export function avstamningsAtgard/);
  });
  it('effekten anropar stegaAvstamning på varje fix med det ÖPPNA objektet och kandidaterna', () => {
    expect(page).toContain("import { stegaAvstamning, NYTT_AVSTAMNINGSMINNE, type AvstamningsMinne } from '../../lib/objektAvstamning'");
    expect(page).toMatch(/const r = stegaAvstamning\(\{\s*minne: avstamningsMinneRef\.current, nu: Date\.now\(\), pos: \{ lat: pos\.lat, lng: pos\.lon \},\s*oppetObjektId: valtObjekt\.id, maskinId: enhetMaskinId, kandidater: maskindatorObjektRef\.current,/);
  });
  it('körs inte i testfliken, utan öppet objekt, innan kandidaterna laddats OK, eller medan ett byte hämtas — och aldrig utan roll ur maskinregistret', () => {
    expect(page).toContain('if (testlageAktivRef.current || !valtObjekt?.id || !maskindatorGeoKlar || avstamningPagarRef.current) return;');
    expect(page).toMatch(/const roll = enhetRollRef\.current;\s*if \(!roll\) return;/);
  });
  it('ej tilldelat → bekräftelsekortet, tilldelat → byte med notis; avstämningsbyte minns objektet (utom i testfliken)', () => {
    expect(page).toMatch(/if \(atg === 'fraga'\) \{[\s\S]{0,300}visaMaskindatorKort\(rad, roll\);\s*\} else \{[\s\S]{0,200}Bytte till \$\{traff\.namn/);
    expect(page).toContain('if (!testlageAktivRef.current) sattSenasteObjekt(enhetMaskinId, traff.id);');
  });
  it('flaggan avstamningPagarRef släpps ALLTID (finally) — ett kastat anrop får inte låsa avstämningen för resten av dagen', () => {
    expect(page).toMatch(/avstamningPagarRef\.current = true;[\s\S]{0,2000}\} finally \{ avstamningPagarRef\.current = false; \}/);
  });
});

describe('kandidaterna: ett fel, ett tomt svar eller ett hängande anrop räknas aldrig som "laddat"', () => {
  it('laddas via startaKandidatLaddning (tidsgräns + omförsök), inte via en engångs-async med .catch(() => [])', () => {
    expect(page).toContain("import { hamtaKandidatSvar, startaKandidatLaddning } from '../../lib/objektKandidater'");
    expect(page).toContain('hamta: () => hamtaKandidatSvar(supabase),');
    expect(page).not.toMatch(/kandidaterP[\s\S]{0,900}\.catch\(\(\) => \[\]\)/);
  });
  it('"klar"-flaggan (maskindatorGeoKlar) sätts BARA vid ett lyckat försök', () => {
    expect(page).toContain('if (r.ok) { maskindatorObjektRef.current = r.kandidater; setMaskindatorGeoKlar(true); }');
    expect((page.match(/setMaskindatorGeoKlar\(true\)/g) || []).length).toBe(1);
  });
  it('starten väntar bara på FÖRSTA försöket; en gammal laddare stoppas innan en ny startas; laddaren stoppas vid avmontering', () => {
    expect(page).toContain('if (forsta) { forsta = false; klart(r.ok ? r.kandidater : []); }');
    expect(page).toContain('if (kandidatStoppRef.current) kandidatStoppRef.current();');
    expect(page).toMatch(/useEffect\(\(\) => \(\) => \{ if \(kandidatStoppRef\.current\) \{ kandidatStoppRef\.current\(\); kandidatStoppRef\.current = null; \} \}, \[\]\);/);
  });
  it('"visa som maskin" nollställer avstämningsminnet', () => {
    expect(page).toMatch(/maskindatorFragatRef\.current = new Set\(\);\s*avstamningsMinneRef\.current = NYTT_AVSTAMNINGSMINNE;/);
  });
});
