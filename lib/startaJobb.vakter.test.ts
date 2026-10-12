import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Källkodsvakter för kopplingen i planeringssidan (23 000 rader — går inte att montera i vitest). Beteendet är bevisat i lib/*.test.ts och i testselens riktiga
// rendering; de här vakterna larmar om KOPPLINGEN bryts: skyddsnätet (hyttspår utan objekt), 300 m-träffen, GROT-kontexten, etiketterna.
const les = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = les('../app/planering/page.tsx');
const valjare = les('../app/planering/ObjektValjare.tsx');
const starta = les('../app/starta-jobb/page.tsx');
const importTrakt = les('../app/api/import-trakt/route.ts');
const n = (s: string, re: RegExp) => (s.match(re) || []).length;

describe('hyttspår utan objekt (skyddsnätet) — alla DB-vägar går genom lib/hyttsparNyckel', () => {
  it('ingen läsning av dagens hyttspår-rad filtrerar direkt på ctx.objektId/objektId — filtreringen är filtreraHyttsparRad (objekt ELLER maskin)', () => {
    expect(n(page, /filtreraHyttsparRad\(supabase\.from\('hyttspar'\)\.select\('id, points'\) as any, ctx,/g)).toBe(3);   // livscykel, dagsbyte, första punkten
    expect(page).not.toMatch(/from\('hyttspar'\)\s*\n?\s*\.select\('id, points'\)\.eq\('objekt_id'/);
  });
  it('nya rader skapas med hyttsparInsertRad (objekt_id null + maskin_id när objekt saknas) på båda ställena', () => {
    expect(n(page, /\.insert\(hyttsparInsertRad\(ctx, /g)).toBe(2);
    expect(page).not.toMatch(/\.insert\(\{ objekt_id: ctx\.objektId/);
  });
  it('loggningen kan startas utan objekt: effekten tar utanObjektLogg, och kräver maskin (kanLoggaHyttspar)', () => {
    expect(page).toMatch(/const utanObjekt = !medObjekt && !!utanObjektLogg;/);
    expect(page).toMatch(/if \(!kanLoggaHyttspar\(ctx\)\) return;/);
    expect(page).toMatch(/\}, \[korvyActive, valtObjekt\?\.id, hyttRoll, utanObjektLogg\?\.roll\]\);/);
  });
  it('kortet frågar bara på en RIKTIG fix, med kandidaterna laddade OK, aldrig i testfliken — och skyddsnätet startar samtidigt', () => {
    expect(page).toMatch(/if \(testlageAktivRef\.current \|\| !maskinlage \|\| !enhetMaskinId \|\| !maskindatorGeoKlar \|\| !gpsFixFarsk\) return;/);
    expect(page).toMatch(/setIngetObjektKort\(\{ lat: pos\.lat, lng: pos\.lon, roll \}\);\n\s*setUtanObjektLogg\(\{ roll \}\);/);
  });
  it('Starta från kortet: försegla spåret (await) → koppla (await) → först sedan öppna körvyn', () => {
    const s = page.indexOf('const startaJobbFranKort');
    const kropp = page.slice(s, s + 3200);
    const a = kropp.indexOf('await sparaHyttspar(true)'), b = kropp.indexOf("await fetch('/api/hyttspar/koppla'"), c = kropp.indexOf('oppnaKorvyPa(r.rad, kort.roll)');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe('objekt utan traktgräns: 300 m-regeln gäller överallt där "står maskinen här" avgörs', () => {
  it('200 m-regeln i kortet använder objektTraffPunkt (inte bara polygonen)', () => {
    expect(page).toMatch(/if \(o && objektTraffPunkt\(o, pos\.lat, pos\.lon\)\) \{/);
    expect(page).not.toMatch(/objektInnehallerPunkt\(/);
  });
});

describe('GROT-jobb som hör till ett virkesobjekt visar dess traktgräns, ytor/anteckningar och skördarspår', () => {
  it('traktgränsen hämtas för hor_till_objekt_id när det finns', () => {
    expect(page).toMatch(/const geoObjektId: string = \(valtObjekt as any\)\.hor_till_objekt_id \|\| valtObjekt\.id;/);
    expect(page).toMatch(/\.from\('objekt_geometri'\)\.select\('geometri'\)\.eq\('objekt_id', geoObjektId\)/);
  });
  it('ytanteckningar och ytmedia hämtas för [jobbet, virkesobjektet] — jobbets egna vinner vid samma yta', () => {
    expect(n(page, /\.in\('objekt_id', ytaKontextIds\(valtObjekt\)\)/g)).toBe(2);
    expect(page).toMatch(/\.filter\(\(x\) => x\.objekt_id !== egenId\), \.\.\.\(data as any\[\]\)\.filter\(\(x\) => x\.objekt_id === egenId\)/);
  });
  it('skördarens spår på virkesobjektet läggs till som "den andres" spår (skotare) respektive tidigare dagar (skördare)', () => {
    expect(page).toMatch(/if \(horTillId && roll === 'skordare'\) \{/);
    expect(page).toMatch(/horTillId && roll === 'skordare' \? \[objektId, horTillId\] : \[objektId\]/);
  });
  it('avverkad areal räknas fortfarande bara på objektets EGNA skördarspår (jobbet äger inget virkesobjekts areal)', () => {
    expect(page).toMatch(/from\('hyttspar'\)\.select\('points'\)\.eq\('objekt_id', objektId\)\.eq\('roll', 'skordare'\)/);
  });
});

describe('listor och etiketter', () => {
  it('Avslutade: GROT och energiklippning i samma kolumn "GROT och energi"', () => {
    expect(valjare).toMatch(/\['grot', 'GROT och energi'\]/);
    expect(valjare).toMatch(/typ === 'grot' \? \(h === 'grot' \|\| h === 'energiklippning'\) : h === typ/);
  });
  it('listraden/detaljen säger inte "Gallring" om ett GROT-/energijobb', () => {
    expect(valjare).not.toMatch(/obj\.typ === 'slutavverkning' \? 'Slutavverkning' : 'Gallring'/);
    expect(valjare).not.toMatch(/selectedObj\.typ === 'slutavverkning' \? 'Slutavverkning' : 'Gallring'/);
  });
});

describe('Starta jobb och import', () => {
  it('Starta jobb skriver inte längre dim_objekt direkt (förares UPDATE träffar 0 rader) — VO sätts via den smala RPC:n', () => {
    expect(starta).not.toMatch(/from\('dim_objekt'\)\s*\n?\s*\.update/);
    expect(starta).toMatch(/rpc\('tilldela_vo_maskinobjekt'/);
  });
  it('Starta jobb hämtar VO och skapar jobbet via lib/startaJobb.skapaJobb (EN väg för kortet och sidan)', () => {
    expect(starta).toMatch(/skapaJobb\(supabase as any, indata\)/);
    expect(page).toMatch(/skapaJobb\(supabase as any, \{/);
  });
  it('import-trakt kopplar hyttspår utan objekt efter att geometrin skrivits, och låter aldrig ett fel där fälla importen', () => {
    const geo = importTrakt.lastIndexOf("insert({\n          objekt_id: saved.id");
    const koppla = importTrakt.indexOf('kopplaHyttsparTillObjekt(service');
    expect(koppla).toBeGreaterThan(geo);
    expect(importTrakt).toMatch(/await loggaImportFel\(service, sokvag, 'HYTTSPAR_KOPPLING'/);
  });
});
