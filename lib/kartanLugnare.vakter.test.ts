// KARTAN LUGNARE — vakter för det som inte får glida tillbaka (2026-10-24).
//   • BARA ETT SLAGS FAST TEXT på kartan: namnet inne i ytor ("HÄNSYN 3") och avläggets nummer. Meterlängder på vägbitar visas först vid tryck.
//   • Vägarna behåller sin snitselfärg med mörk kant.
//   • Fara (Röd) är alltid i full styrka: det som tonas ner (bakgrund) och det som blir grått (klart) rör aldrig faran.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KLART_LINJELAGER } from './kartKlart';
import { VAG_KANT_FARG, arStickvag } from './kartstil';
import { SYMBOL_LAGER, SYMBOL_UNDANTAG } from './symbolZoom';

const sida = fs.readFileSync(path.join(process.cwd(), 'app/planering/page.tsx'), 'utf8');

/** Id:t på lagret som äger varje 'text-field' i page.tsx (närmaste id: före). */
function textLager(): string[] {
  const ut: string[] = [];
  for (const m of sida.matchAll(/'text-field'/g)) {
    const fore = sida.slice(Math.max(0, (m.index ?? 0) - 900), m.index);
    const ids = [...fore.matchAll(/id:\s*['`]([^'`]+)['`]/g)];
    ut.push(ids.length ? ids[ids.length - 1][1] : '?');
  }
  return ut;
}

describe('fast text på kartan', () => {
  it('de enda lager med text är: ytornas namn, avläggets nummer, traktdelens nummer, faran (namnet under symbolen) och redigeringsverktyget', () => {
    const TILLATNA = [
      'zone-label', 'trakt-hansyn-label', 'trakt-ovrigt-label', 'trakt-nb-label', 'trakt-raa-label',   // namnet inne i ytor
      'trakt-punkt-label',                                                                              // avläggets nummer (Vidas)
      'yta-nr-label',                                                                                   // traktdelens nummer inne i ytan
      'markers-korvy-label',                                                                            // faran (Röd): namnet under symbolen — oförändrad
      'hornedit-nr',                                                                                    // hörnnummer medan man redigerar en gräns (verktyg, inte kartinnehåll)
    ];
    expect(textLager().sort()).toEqual([...TILLATNA].sort());
  });
  it('vägetiketten och m³-etiketterna är borta: nummer, längd och volym visas vid tryck', () => {
    for (const id of ['line-mainroad-label', 'hogar-cluster-label', 'grot-label']) {
      expect(sida, id).not.toContain(`'${id}'`);
      expect([...SYMBOL_LAGER, ...SYMBOL_UNDANTAG], id).not.toContain(id);
    }
  });
  it('vägens markeringskort säger fortfarande nummer, färg och längd (det är där meterlängden finns nu)', () => {
    expect(sida).toMatch(/Basväg \$\{marker\.nummer\}[^]{0,400}formatLength\(pathMeters\(coords\)\)/);
  });
  it('avläggets text är numret (EXTRA_LABE, annars LOPNR) — inte Vidas fria beskrivning (FLBESKR)', () => {
    const lager = sida.slice(sida.indexOf("id: 'trakt-punkt-label'"));
    const text = lager.slice(0, lager.indexOf("'text-size'"));
    expect(text).toContain("['get', 'EXTRA_LABE']");
    expect(text).toContain("['get', 'LOPNR']");
    expect(text).not.toContain('FLBESKR');
  });
  it('varje symbollager med text står i symbolZoom-listorna (klipps på zoom eller undantaget med skäl)', () => {
    for (const id of textLager()) expect([...SYMBOL_LAGER, ...SYMBOL_UNDANTAG], id).toContain(id);
  });
});

describe('vägarna: snitselfärg med mörk kant', () => {
  it('basväg, stickväg, traktgräns och stig har den mörka kanten (VAG_KANT_FARG); övriga linjer den svagare', () => {
    expect(sida).toMatch(/const casingColor = \(isBoundary \|\| isMainRoad \|\| isTrail \|\| arStickvag\(lt\.id\)\) \? VAG_KANT_FARG : 'rgba\(0,0,0,0\.5\)';/);
    expect(VAG_KANT_FARG).toBe('rgba(0,0,0,0.9)');
    for (const t of ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue']) expect(arStickvag(t)).toBe(true);
    for (const t of ['mainRoad', 'boundary', 'ditch', 'nature', 'trail', 'stonewall', 'powerline']) expect(arStickvag(t)).toBe(false);
  });
  it('vägens färg (röd/gul/blå, blå med gula streck) ändras inte av något i den här ändringen', () => {
    expect(sida).toContain("'line-color': isMainRoad ? (BASVAG_FARG_UTTRYCK as any) : lt.color");
  });
});

describe('fara rörs aldrig av nedtoning eller grått', () => {
  it('grått gäller bara väglagren och maskinspåren — inget fara-, larm-, fällnings- eller pillager', () => {
    for (const id of KLART_LINJELAGER) expect(id).not.toMatch(/powerline|kraftledning|larm|fall|markers|arrows|boundary/i);
  });
  it('bakgrunden tonas bara i rasterlagren (baskartan); inget markerings-, larm- eller fara-lager får raster-egenskaper från lib/kartBas', () => {
    const rader = sida.split('\n').filter((r) => r.includes('kartBasPaint('));
    expect(rader.length).toBe(4);   // de fyra baslagren
    for (const r of rader) expect(r).toMatch(/type: 'raster'/);
  });
});
