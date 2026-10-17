import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Källkodsvakter: planeringssidan (22 000 rader) går inte att montera i vitest. Beteendet är bevisat i objektVal.test.ts, usePlaneringsObjekt.test.tsx och
// ObjektLista.test.tsx; vakterna här larmar om KOPPLINGEN bryts — framför allt att maskinläget, /maskin och körvyn behåller sin gamla väg exakt som före listan.
const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('nya objektlistan med ett objekt bakom gäller bara planeringsvyn — inte maskinläge, /maskin eller körvy', () => {
  it('ETT villkor (anvandObjektLista) styr alla ställen med ett valt objekt: pill, objektinfo-knapp, Kör hit, själva listan', () => {
    expect(page).toContain('const objektListaVal = anvandObjektLista({ maskinlage, maskinSom: !!maskinSomParam, korvyActive });');
    expect((page.match(/objektListaVal/g) || []).length).toBeGreaterThanOrEqual(10);
    expect(page).toContain('knappar: kortKnappar({ roll: kortRoll, harKoordinat: objektListaVal && harKoordinat(valtObjekt),');   // Kör hit (förut Vägbeskrivning): bara planeringsvyn
    expect(page).toContain('{objektListaVal && (\n        <ObjektLista');
  });

  it('startvalet/adressen/minnet är inaktivt i maskinläge, på /maskin och medan maskinfrågan visas', () => {
    expect(page).toContain('const nyttObjektval = !maskinlage && !maskinSomParam;');
    expect(page).toContain('const planeringsObjektAktiv = enhetMaskinLast && nyttObjektval && !maskinFragaSynlig && !medarbetareLaddar;');
    expect(page).toContain('aktiv: planeringsObjektAktiv,');
  });

  it('inget objekt valt: kartan med listan i planeringsvyn OCH i maskinläge (Martin 2026-10-17); maskinens val öppnar körvyn som förut', () => {
    expect(page).toContain('    if (anvandObjektListaUtanObjekt({ maskinlage, maskinSom: !!maskinSomParam, korvyActive })) {\n      const visaListan');
    expect(page).toContain('<ObjektKartaTom onValj={maskinlage ? valjObjektIMaskin : valjObjektUrLista}');
    expect(page).toContain("? { maskinId: enhetMaskinId, klararTyp: dimMaskiner.find((m) => m.maskin_id === enhetMaskinId)?.klarar_typ ?? null }");
    const m = /const valjObjektIMaskin = \(obj: any\) => \{([\s\S]*?)\n  \};/.exec(page);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/if \(!enhetRoll\) \{[\s\S]*?return;\s*\}/);          // okänd roll öppnar ingenting
    expect(m![1]).toContain('oppnaKorvyPa(obj, enhetRoll);');
    expect(m![1]).toContain('if (!testlage) sattSenasteObjekt(enhetMaskinId, obj.id);');
    expect(m![1]).not.toMatch(/setValtObjekt/);                                   // aldrig planeringskartan i maskinläge
  });

  it('körvy utanför maskinläge: den gamla väljaren (ObjektValjare) ligger kvar, med samma props', () => {
    expect(page).toContain("import ObjektValjare from './ObjektValjare'");
    expect(page).toContain('      <ObjektValjare\n        forareFilter={visaForarlista(isForare, maskinlage) ? { medarbetareId: effectiveMedarbetare?.id ?? \'\' } : undefined}\n        enhetMaskinId={enhetMaskinId}');
    expect(page).toContain('onStartObjekt={visaForarlista(isForare, maskinlage) ? handleStartKorningForObjekt : undefined}');
    expect(page).toContain('if (maskinlage) { valjObjektIMaskin(obj); return; }');
    expect(page).toContain("window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');");
    // tillbaka till objektlistan i maskinläge: hem öppnar maskinlådan, vars Byt objekt kör tillObjektlistan
    expect(page).toContain('data-testid="hem-maskinmeny"');
    expect(page).toContain('onBytObjekt={tillObjektlistan}');
    expect(page).toContain('const tillObjektlistan = useCallback(() => {');
  });

  it('körvyns pill och dess objektinfo-ingång är orörda; körvyn får varken byt-pill, info-knapp eller Kör hit', () => {
    expect(page).toContain('{korvyActive && valtObjekt ? (\n            <KorvyObjektPill');
    expect(page).toContain('onNamn={() => setTraktOversiktOpen(o => !o)}');
    expect(page).toContain("!(korvyActive && screenSize.width < 640) && <span style={{ width: '44px', flexShrink: 0 }} aria-hidden=\"true\" />");
    // pillens byt-läge faller tillbaka till gamla vägen utan listvillkoret; Byt objekt finns inte längre som menyval (namnet och ⌂ gör det)
    expect(page).toContain('onClick={() => { if (objektListaVal) setObjektListaOppen(true); else setTraktOversiktOpen(o => !o); }}');
    expect(page).not.toContain("label: 'Byt objekt'");
  });

  it('förarens auto-val av tilldelat objekt väntar in adressen/minnet men finns kvar som reserv', () => {
    expect(page).toContain('if (planeringsObjektAktiv && !planeringsStartKlar) return;');
    expect(page).toContain(".in('status', ['planerad', 'pagaende']);");
  });

  it('km-knappen och Vägbeskrivning använder SAMMA navigering (lib/navigera)', () => {
    expect(page).toContain("import { startaNavigering, harKoordinat } from '../../lib/navigera'");
    expect((page.match(/startaNavigering\(/g) || []).length).toBe(3);   // tidig retur-listan, huvudvyns lista, Kör hit på kortet
  });

  it('avslutar man ett objekt glöms det som planeringens startobjekt', () => {
    expect(page).toContain("rensaSenastePlanering(currentMedarbetare?.id ?? 'okand', valtObjekt.id);");
  });
});
