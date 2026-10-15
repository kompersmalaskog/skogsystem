// Källvakter: kopplingen i sidan (page.tsx kan inte monteras i test) och att ingen skrivning går förbi det lokala lagret.
// Beteendet är provat i lib/markeringSynk.test.ts (logiken), lib/hooks/useMarkeringarSynk.test.tsx (hooken i React) och i en riktig Chromium
// (riktig IndexedDB, riktig supabase-js, flygplansläge — se PR).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const las = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const page = las('../app/planering/page.tsx');
const hook = las('./hooks/useMarkeringarSynk.ts');
const ko = las('./markeringSynkKo.ts');

describe('inget skriver markeringar direkt mot nätet — allt går via det lokala lagret', () => {
  it('sidan upsertar aldrig planering_markeringar själv (den läser, och UPDATE-only för numrering/merge)', () => {
    // varje anrop mot planering_markeringar i sidan är ett select eller en UPDATE — aldrig en upsert/delete
    for (const m of Array.from(page.matchAll(/\.from\('planering_markeringar'\)([\s\S]{0,120})/g))) expect(m[1], m[0].slice(0, 80)).not.toMatch(/^\s*\.(upsert|delete|insert)\(/);
  });
  it('sidan använder hookens spara/radera/hämta om under de gamla namnen', () => {
    expect(page).toContain('saveMarker: saveMarkerToDb, deleteMarker: deleteMarkerFromDb, refetch: refetchMarkers');
    expect(page).toContain('useMarkeringarSynk<Marker>');
  });
  it('en markering räknas som "känd" FÖRST när den ligger i det lokala lagret (aldrig före — det var felet)', () => {
    const lagra = hook.slice(hook.indexOf('const lagraLokalt = useCallback'), hook.indexOf('/** Skriver ALLA ändrade'));
    const skriv = lagra.indexOf('await laggMarkeringUpsert(');
    const kand = lagra.indexOf('refs.persistedSnapshot.current.set(id, json)');
    expect(skriv).toBeGreaterThan(0);
    expect(kand).toBeGreaterThan(skriv);
    expect(lagra).toContain('setTimeout(() => { void lagraNuRef.current(); }, 3000)');   // misslyckad lokal skrivning: nytt försök
  });
  it('laddning och hämta om går via sammanfogningen (skickar det som väntar först, lägger lokala ändringar ovanpå) — aldrig ett tomt minne vid läsfel', () => {
    expect(hook.match(/hamtaMarkeringarSammanfogade\(/g)!.length).toBe(2);
    expect(hook).not.toMatch(/setMarkers\(\[\]\)/);
    expect(hook).toContain('lasLokaltForst(objektId)');                         // det lokala visas först, innan nätet svarat
    // allt som ändrats i minnet skrivs lokalt FÖRE sammanfogningen läser de väntande (även ändringar under hämtningen)
    expect(hook.match(/await lagraNuRef\.current\(\)\.catch\(\(\) => \{\}\)/g)!.length).toBe(2);
  });
  it('hämtningen väntar bara på ritning/merge — inte på osparade ändringar (de ligger lokalt och sammanfogas)', () => {
    expect(hook).toContain('if (refs.sparPagar.current || refs.upptagen.current)');
    expect(hook).not.toContain('syncTimeout.current != null');
  });
  it('bakgrundning/stängning skriver lokalt direkt och ger kön ett varv', () => {
    expect(hook).toContain("window.addEventListener('pagehide', flush)");
    expect(hook).toContain('void lagraNuRef.current().then(() => korMarkeringSynk(true))');
  });
  it('raderingen lägger en grav lokalt och glömmer "känd"-status (Ångra/undo sparar igen)', () => {
    const del = hook.slice(hook.indexOf('const deleteMarker = useCallback'), hook.indexOf('// ── Ladda när objektet byts'));
    expect(del).toContain('await laggMarkeringDelete(oid, mid)');
    expect(del.indexOf('refs.persistedIds.current.delete(mid)')).toBeLessThan(del.indexOf('await laggMarkeringDelete'));
  });
});

describe('kön körs oberoende av planeringsvyn och synliggörs diskret', () => {
  it('global startare i layouten: nät tillbaka, appen synlig, jämna mellanrum — och ett varv per hämtning', () => {
    expect(las('../app/layout.tsx')).toContain('<MarkeringSynkStartare />');
    expect(ko).toContain("window.addEventListener('online', online)");
    expect(ko).toContain("document.addEventListener('visibilitychange', synlig)");
    expect(ko).toContain('window.setInterval(tick, 20_000)');
    expect(ko).toContain("nav.locks.request('markering-synk-ko'");
    expect(ko).toContain('await skickaVantandeForst();');                        // FÖRE hämtning från servern
  });
  it('markeringar som synkats väcker fotokön (foton kopplas så fort markeringen kommit fram)', () => {
    expect(ko).toContain('paSynkad: () => { void korFotoKo(true); }');
  });
  it('indikatorn "N väntar": inget popup — en liten text i färskhetsstämpeln och i körvyns kartdatarad', () => {
    expect(page).toContain('data-testid="synk-vantar"');
    expect(page).toContain('{synkVantar} väntar');
    expect(page).toContain('` · ${synkVantar} väntar`');
  });
  it('krockar mellan enheter loggas (konsol + localStorage)', () => {
    expect(ko).toContain("console.warn('[Markeringssynk] krock', k)");
    expect(ko).toContain("localStorage.setItem(LOGG_NYCKEL");
  });
});
