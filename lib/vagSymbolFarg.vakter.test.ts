// Vakter för förslaget vägsymboler → vägfärg (2026-10-28): det som inte får glida tillbaka — läser sidan, ingen karta.
//   • Bara planeringsvyn (objektListaVal: inte körvy, maskinläge eller testläge), aldrig utan origo.
//   • Godkänn går genom markeringskön (saveMarkerToDb/deleteMarkerFromDb) och tar bort exakt förslagets symboler; ingen direkt skrivning mot planering_markeringar.
//   • "Inte nu" gäller tills trakten byts. Vägsymbolen finns kvar i menyn.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MENY_KATEGORIER } from './symboler';

const rot = process.cwd();
const las = (p: string) => fs.readFileSync(path.join(rot, p), 'utf8');
const sida = las('app/planering/page.tsx');

describe('sidans koppling', () => {
  it('förslaget räknas bara i planeringsvyn och aldrig utan origo', () => {
    expect(sida).toMatch(/const vagForslag = useMemo\(\s*\(\) => \(objektListaVal && valtObjekt && !vagForslagNej && !objektSaknarPosition \? foreslaVagFarg\(/);
  });

  it('frågan står bara när inget annat pågår nertill', () => {
    const m = sida.match(/const vagForslagListSynlig = ([^;]+);/);
    expect(m).not.toBeNull();
    for (const villkor of ['harVagForslag(vagForslag)', '!kartLageIgang', '!menuOpen', '!objektListaOppen', '!traktOversiktOpen', '!framhavListSynlig', '!korLage', '!klarGranskaAvlagg', 'markerMenuOpen == null', '!briefingMode']) {
      expect(m![1], villkor).toContain(villkor);
    }
  });

  it('spöket syns bara medan frågan står: vägarna i föreslagen färg, symbolerna med halv styrka', () => {
    expect(sida).toContain('useEffect(() => { setVagSpokeAktiv(vagForslagListSynlig); }, [vagForslagListSynlig]);');
    expect(sida).toContain('const vagSpoke = vagSpokeAktiv && harVagForslag(vagForslag) ? vagForslag : null;');
    expect(sida).toContain("if (vagSpokeSymboler.has(String(m.id))) opacity = VAGSYMBOL_SPOKE_OPACITET;");
    expect(sida).toContain("...(m.lineType === 'mainRoad' && vagSpokeFarg.has(String(m.id)) ? { farg: vagSpokeFarg.get(String(m.id)) } : {})");
  });

  it('Godkänn: vägarna sparas och exakt förslagets symboler tas bort — via markeringskön', () => {
    const i = sida.indexOf('<VagFargForslag');
    const block = sida.slice(i, sida.indexOf('/>', sida.indexOf('onGodkann', i)) + 2);
    expect(block).toContain('tillampaVagForslag(markersRef.current as any[], vagForslag!)');
    expect(block).toContain('saveMarkerToDb(');
    expect(block).toContain('deleteMarkerFromDb(m.id)');
    expect(block).toContain('bort.has(String(m.id))');
    expect(block).not.toMatch(/planering_markeringar/);
    expect(block).toContain('onInteNu={() => setVagForslagNej(true)}');
  });

  it('"Inte nu" gäller tills trakten byts', () => {
    expect(sida).toContain('useEffect(() => { setVagForslagNej(false); }, [valtObjekt?.id]);');
  });
});

describe('vägsymbolen finns kvar i menyn', () => {
  it("'road' står kvar under Infrastruktur", () => {
    expect(MENY_KATEGORIER.some((k) => k.symboler.includes('road'))).toBe(true);
  });
});
