// Källvakter för "ⓘ-panelen tydlig" (Martin 2026-10-22): direktivet först och helt, instruktion nr 1, panelens bredd, Mer som rad, larmplatsens kontrollstatus bara i planeringsläget.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { INFO_PANEL_MASKIN_BREDD_PX, PANEL_BREDD_PX } from './plusArk';

const rot = join(__dirname, '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');
const sida = las('app/planering/page.tsx');

describe('panelens bredd', () => {
  it('420 px i maskinläget, 380 som förut annars — och telefonen är ett ark i full bredd', () => {
    expect(INFO_PANEL_MASKIN_BREDD_PX).toBe(420);
    expect(PANEL_BREDD_PX).toBe(380);
    expect(sida).toContain('const infoPanelBredd = (maskinlage || !!maskinSomParam) ? INFO_PANEL_MASKIN_BREDD_PX : PANEL_BREDD_PX;');
    expect(sida).toMatch(/objektInfoSenasteRef\.current = \{\s*bredd: infoPanelBredd,/);
  });
  it('kamerans utrymme för framhävt objekt räknar med den bredd panelen faktiskt har', () => {
    expect(sida.match(/const panelPx = lage === 'panel' \? infoPanelBredd \+ AVSTAND\.s \* 2 : 0;/g)).toHaveLength(2);
    expect(sida).not.toContain("const panelPx = lage === 'panel' ? PANEL_BREDD_PX + AVSTAND.s * 2 : 0;");
  });
  it('bara ⓘ-panelen är bredare: objektlistan och plus-arket behåller PANEL_BREDD_PX', () => {
    expect(las('components/planering/ObjektLista.tsx')).toContain('PANEL_BREDD_PX');
    expect(las('components/planering/ObjektLista.tsx')).not.toContain('INFO_PANEL_MASKIN_BREDD_PX');
    expect(las('components/planering/PlusArk.tsx')).not.toContain('INFO_PANEL_MASKIN_BREDD_PX');
  });
});

describe('Vidas direktiv är instruktion nr 1', () => {
  it('sidan matar instruktionshooken med direktivet (objekt.anteckningar) — samma text som "Till föraren"', () => {
    expect(sida).toMatch(/useInstruktioner\(\{[\s\S]*?direktiv: vidaDirektiv,/);
    expect(sida).toContain("const forareTexter = tillForaren({ vida });");
  });
  it('kortet får "✓ Sett" för direktivet bara i maskinläget (instruktioner kommer bara då)', () => {
    expect(sida).toContain('instruktioner: instruktionerAktiv ? { data: inst.paTrakten, onSett: inst.settOmraden } : null,');
    expect(las('components/planering/ObjektInfo.tsx')).toContain('direktivSett={direktiv ? { sedd: direktiv.nya === 0, onSett: () => instruktioner!.onSett([DIREKTIV_NYCKEL]) } : null}');
  });
});

describe('städad panel', () => {
  const kort = las('components/planering/ObjektKort.tsx');
  it('"Mer" är en rad längst ner i uppdraget, inte en knapp i knappraden', () => {
    expect(kort).toContain('testid="kort-mer"');
    expect(las('lib/objektKort.ts')).not.toMatch(/id: 'mer'/);
    expect(las('lib/objektKort.ts')).toContain("export type KortKnappId = 'kor-hit' | 'korvy' | 'skotning' | 'utkort';");
    expect(kort.indexOf('testid="kort-dokument"')).toBeLessThan(kort.indexOf('testid="kort-mer"'));
    expect(kort).not.toContain('kort-knapp-mer');
  });
  it('knapprad bara när det finns knappar', () => {
    expect(kort).toContain('{n > 0 && <div data-testid="kort-knappar"');
  });
  it('"Larmplats inte kontrollerad" bara i planeringsläget: sidan ger visaKontroll = planerare utanför maskinläge och testläge', () => {
    expect(sida).toContain("visaKontroll: kortRoll === 'planerare' && !maskinlage && !maskinSomParam,");
    expect(kort).toContain('{larm.visaKontroll && <span data-testid="kort-larm-status"');
  });
  it('"På trakten · N markeringar" har samma stil som övriga rader (ingen grå text-prefix)', () => {
    expect(kort).toContain('etikett={`På trakten · ${p.paTrakten}`}');
    expect(kort).not.toMatch(/På trakten <\/span>/);
  });
  it('Till föraren ligger efter Faror och före Brandrisk, knapprad och uppdrag', () => {
    const i = (m: string) => kort.indexOf(m);
    expect(i('data-testid="kort-faror"')).toBeLessThan(i('data-testid="kort-till-foraren"'));
    expect(i('data-testid="kort-till-foraren"')).toBeGreaterThan(0);
    expect(i('data-testid="kort-till-foraren"')).toBeLessThan(i('<BrandriskRad '));
    expect(i('data-testid="kort-till-foraren"')).toBeLessThan(i('data-testid="kort-knappar"'));
    expect(i('data-testid="kort-till-foraren"')).toBeLessThan(i('testid="kort-uppdrag"'));
  });
});

describe('Om trakten och genomgången använder samma kommentarkomponent', () => {
  it('sidan bygger kommentarerna ur samma källa som kartkortet (kortKommentarer) och Vidas text bara när den säger något', () => {
    expect(sida).toContain('kommentarer: omKommentarer(markerNyckel(m.id), m.comment)');
    expect(sida).toContain('kommentarer: omKommentarer(y.nyckel, null, y.vidaText)');
    expect(sida).toMatch(/arInstruktionsText\(vidaText\) \? \[\{ id: `vida:\$\{nyckel\}`/);
  });
});
