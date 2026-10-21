import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// VAKTER: noteringarna har EN vag in och ut ur databasen, och en notering blir aldrig en observation eller en planmarkering.
//
//  - Bara lib/egenkontroll.ts rör tabellen egenkontroll_notering (läser, skapar, ändrar, tar bort). Sidor och komponenter går via
//    funktionerna, så låset, "tom text = DELETE" och klämningen av etikettens förskjutning inte kan gå förbi.
//  - Etikettens förskjutning (etikett_dx/-dy) skrivs bara efter klamEtikett (det sparade är det som visas).
//  - En rättelse ritad i egenkontrollen får aldrig hamna i planeringens markeringar (planering_markeringar): då skulle förarens
//    körvy visa en basväg som aldrig planerats.

const ROT = join(__dirname, '..');
const las = (rel: string) => readFileSync(join(ROT, rel), 'utf-8');

function alla(dir: string, ut: string[] = []): string[] {
  for (const namn of readdirSync(join(ROT, dir))) {
    if (namn === 'node_modules' || namn === '.next' || namn.startsWith('.')) continue;
    const rel = join(dir, namn);
    const st = statSync(join(ROT, rel));
    if (st.isDirectory()) alla(rel, ut);
    else if (/\.(ts|tsx)$/.test(namn) && !/\.test\.(ts|tsx)$/.test(namn)) ut.push(rel);
  }
  return ut;
}

const KALLFILER = [...alla('app'), ...alla('components'), ...alla('lib')];

describe('noteringar: en vag in och ut ur databasen', () => {
  it("'egenkontroll_notering' är bara en tabell lib/egenkontroll.ts rör", () => {
    const traffar = KALLFILER
      .filter((f) => f !== join('lib', 'egenkontroll.ts'))
      .filter((f) => /from\(\s*['"]egenkontroll_notering['"]\s*\)/.test(las(f)));
    expect(traffar).toEqual([]);
  });

  it('tabellen läses och skrivs på de fem ställen som förväntas (annars bevisar vakten ingenting)', () => {
    const kalla = las('lib/egenkontroll.ts');
    const antal = (kalla.match(/\.from\(\s*'egenkontroll_notering'\s*\)/g) ?? []).length;
    expect(antal).toBeGreaterThanOrEqual(6); // hamta, kravOppen, insert, 23505-återläsning, update, delete
  });

  it('en tom etikett går aldrig till en UPDATE: andraNotering gör DELETE före den skriver', () => {
    const kalla = las('lib/egenkontroll.ts');
    const start = kalla.indexOf('export async function andraNotering');
    const slut = kalla.indexOf('export async function taBortNotering');
    const kropp = kalla.slice(start, slut);
    const tom = kropp.indexOf("etikett === ''");
    const del = kropp.indexOf('taBortNotering(');
    const upd = kropp.indexOf('.update(');
    expect(tom).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(tom);
    expect(upd).toBeGreaterThan(del);
    // ... och det finns ingen väg till en UPDATE med tom text: den som uppdaterar har redan passerat return null
    expect(kropp.slice(tom, upd)).toMatch(/return null/);
  });

  it('etikett_dx/etikett_dy skrivs bara efter klamEtikett', () => {
    const skrivare = KALLFILER.filter((f) => /etikett_dx\s*[:=]|skriv\.etikett_dx/.test(las(f)) && f !== join('lib', 'egenkontrollNotering.ts'));
    expect(skrivare).toEqual([join('lib', 'egenkontroll.ts')]);
    const kalla = las('lib/egenkontroll.ts');
    const i = kalla.indexOf('skriv.etikett_dx');
    expect(kalla.slice(Math.max(0, i - 400), i)).toContain('klamEtikett(');
  });
});

describe('en notering är ingen planmarkering och ingen observation', () => {
  it('noteringskoden skriver aldrig planering_markeringar eller egenkontroll_punkt', () => {
    for (const f of ['lib/egenkontrollNotering.ts', 'lib/egenkontrollNoteringKarta.ts', 'app/egenkontroll/NoteringSheet.tsx', 'app/egenkontroll/RitaRad.tsx']) {
      let text = '';
      try { text = las(f); } catch { continue; }
      expect(text).not.toMatch(/planering_markeringar/);
      expect(text).not.toMatch(/egenkontroll_punkt/);
    }
    const kalla = las('lib/egenkontroll.ts');
    const start = kalla.indexOf('// Noteringar - ord pa en karta');
    const slut = kalla.indexOf('// Stubbehandling');
    const avsnitt = kalla.slice(start, slut);
    // avsnittet nämner tabellerna bara i kommentarer; inget .from(...) mot dem
    expect(avsnitt).not.toMatch(/\.from\(\s*'(planering_markeringar|egenkontroll_punkt)'/);
  });
});

describe('kartan: ritlaget går före markeringen, och lagerordningen är den utlovade', () => {
  const karta = las('app/egenkontroll/RundKarta.tsx');

  it('ett tryck medan man ritar blir ett ritartryck och når ALDRIG urvalet av punkter (ritaAktivRef kontrolleras först i klickhanteraren)', () => {
    const i = karta.indexOf("map.on('click'");
    const rita = karta.indexOf('ritaAktivRef.current', i);
    const urval = karta.indexOf('onValjPunktRef.current', i);
    expect(i).toBeGreaterThan(-1);
    expect(rita).toBeGreaterThan(i);
    expect(rita).toBeLessThan(urval);
    // och det RETURNERAR efter ritartrycket
    expect(karta.slice(rita, urval)).toMatch(/onRitaTryckRef\.current\?\.\([\s\S]*?return;/);
  });

  it('noteringarnas lager hör bara till träfflistan när sidan gett en onValjNotering (en klar runda: inte tryckbara)', () => {
    expect(karta).toMatch(/onValjNoteringRef\.current !== undefined && noteringIdn\.includes\(id\)/);
  });

  it("linjer, punkter och pilspetsar läggs FÖRE 'ek-p-nummer' (över planens vägar och hyttspåret, under kontrollpunkterna); etiketterna efter observationerna", () => {
    expect(karta).toMatch(/for \(const spec of noteringLinjeLager\(\)\) laggTillLager\(map, spec, 'ek-p-nummer'\)/);
    const obs = karta.indexOf('for (const spec of observationLager())');
    const etikett = karta.indexOf('for (const spec of noteringEtikettLager())');
    const jag = karta.indexOf("map.addSource('ek-jag'");
    expect(obs).toBeGreaterThan(-1);
    expect(etikett).toBeGreaterThan(obs);
    expect(jag).toBeGreaterThan(etikett);
  });

  it('noteringarnas synlighet följer lagret Noteringar (ekNoteringar, tänt som standard)', () => {
    expect(karta).toMatch(/egnaVarden\.ekNoteringar !== false/);
    expect(karta).toMatch(/for \(const id of noteringLagerIdn\(\)\) satt\(id, noteringarPa\)/);
  });
});

describe('rapporten till Vida tar bara "blev" (Martin 2026-10-21)', () => {
  const RAPPORTFILER = ['lib/egenkontrollRapport.ts', 'lib/egenkontrollRapportIndata.ts', 'lib/egenkontrollRapportPdf.ts', 'lib/egenkontrollRapportKartaPdf.ts'];

  it("ingen rapportfil nämner 'skulle' som värde: rapporten ritar, räknar eller förklarar aldrig en skulle-notering", () => {
    for (const f of RAPPORTFILER) expect(las(f), f).not.toMatch(/['"]skulle['"]/);
  });

  it('modellen och ritaren går båda via arMedIRapport (dubbelt skydd: ett byggfel i det ena släpper inte igenom en skulle-linje)', () => {
    expect(las('lib/egenkontrollRapport.ts')).toMatch(/arMedIRapport\(n\)/);
    expect(las('lib/egenkontrollRapportKartaPdf.ts')).toMatch(/filter\(arMedIRapport\)/);
  });
});
