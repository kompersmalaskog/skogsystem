// Vakter för Fokus på trakten: varje ritat Vida-lager i planeringsvyn ska läsa `_fokus`, larmen och egna markeringar ska inte göra det.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const kalla = readFileSync(join(__dirname, '../app/planering/page.tsx'), 'utf8');
const rader = kalla.split('\n');
const lagerRader = rader.filter((r) => r.includes('map.addLayer({') && r.includes("source: 'trakt-geo-source'"));
const idAv = (r: string) => /id: '([^']+)'/.exec(r)?.[1] ?? '';

/** Osynliga träffytor (tryck på ytan/linjen): ritas inte, så de ska inte vara svaga — och trycket ska träffa även en svag yta. */
const TRAFFYTOR = ['trakt-ovrigt-fill', 'trakt-linje-hit'];
/** Lager vars rader lämnats orörda (de bär färgvärden som design-lint annars räknar som nya); styrkan sätts med setPaintProperty efter lagren. */
const EFTERAT = ['trakt-basvag-line', 'trakt-raa-point'];

describe('varje ritat Vida-lager läser fokus', () => {
  it('lagerraderna hittas (vakten tittar på något)', () => {
    expect(lagerRader.length).toBeGreaterThanOrEqual(18);
  });
  it('alla utom träffytorna har fokusuttryck i paint eller filter (basvägen och fornlämningspunkten sätts efteråt, se nästa test)', () => {
    const utan = lagerRader.filter((r) => !TRAFFYTOR.includes(idAv(r)) && !EFTERAT.includes(idAv(r)) && !/fokus|FOKUS/.test(r)).map(idAv);
    expect(utan).toEqual([]);
  });
  it('basvägen och fornlämningspunkten får sin styrka i en egen setPaintProperty direkt efter lagren', () => {
    expect(kalla).toContain("map.setPaintProperty('trakt-basvag-line', 'line-opacity', fokusOpacitet(1) as any);");
    expect(kalla).toContain("map.setPaintProperty('trakt-raa-point', 'circle-opacity', fokusOpacitet(1) as any);");
    expect(kalla).toContain("map.setPaintProperty('trakt-raa-point', 'circle-stroke-opacity', fokusOpacitet(1) as any);");
  });
  it('träffytorna är orörda (ett tryck på en svag yta öppnar kortet som vanligt)', () => {
    for (const id of TRAFFYTOR) {
      const r = lagerRader.find((x) => idAv(x) === id)!;
      expect(r, id).toBeDefined();
      expect(/fokus|FOKUS/.test(r), id).toBe(false);
    }
  });
  it('etikettlagren filtrerar bort det som ligger utanför trakten', () => {
    const etiketter = lagerRader.filter((r) => /type: 'symbol'/.test(r) && /'text-field'/.test(r));
    expect(etiketter.map(idAv).sort()).toEqual(['trakt-hansyn-label', 'trakt-nb-label', 'trakt-ovrigt-label', 'trakt-punkt-label', 'trakt-raa-label']);
    for (const r of etiketter) expect(r, idAv(r)).toMatch(/filter: fokusEtikettFilter\(/);
  });
  it('snedstreckningen (hatch) släcks utanför trakten', () => {
    const hatch = lagerRader.filter((r) => idAv(r).endsWith('-hatch'));
    expect(hatch.length).toBe(3);
    for (const r of hatch) expect(r, idAv(r)).toContain('FOKUS_HATCH_OPACITET');
  });
  it('kraftledningens lager (egen lagerfabrik) får samma styrka', () => {
    expect(kalla).toMatch(/kraftledningLager\('trakt-geo-source'[^\n]*map\.addLayer\(medFokusStyrka\(l\)\)/);
  });
  it('hänsynsytans fyllning sätts om vid körvy/planering MED fokus (annars försvinner den svaga fyllningen)', () => {
    expect(kalla).toMatch(/setPaintProperty\('trakt-hansyn-fill', 'fill-opacity', fokusOpacitet\(/);
  });
});

describe('fokus räknas ut en gång, när geometrin läses in', () => {
  it('medFokus körs på geometrin precis före setData', () => {
    expect(kalla).toMatch(/fc = medVidaNycklar\(fc\);[\s\S]{0,400}?fc = medFokus\(fc\);\s*\n\s*src\.setData\(fc\);/);
  });
  it('ingen annan källa får fokus: egna markeringar, linjer, zoner, hyttspår och skördarspår rörs inte', () => {
    const egna = rader.filter((r) => /source: '(markers-source|lines-source|zones-source|hyttspar[^']*|drawing-source|planspar[^']*)'/.test(r));
    expect(egna.length).toBeGreaterThan(10);
    expect(egna.filter((r) => /fokus|FOKUS/.test(r))).toEqual([]);
  });
});

describe('larm och fällningscirkel läser aldrig utseendet', () => {
  it('ingen fil under lib/larm nämner fokus', () => {
    const dir = join(__dirname, 'larm');
    const filer = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(filer.length).toBeGreaterThan(5);
    for (const f of filer) expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/fokusTrakt|_fokus|FOKUS_/);
  });
  it('larmets pulslager och larm-pin har ingen fokus', () => {
    for (const r of rader.filter((x) => /id: 'larm-/.test(x))) expect(r).not.toMatch(/fokus|FOKUS/);
  });
});
