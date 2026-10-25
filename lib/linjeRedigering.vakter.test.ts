// Källvakter för Redigera linjer (2026-10-25): sådant som inte får glida utan att ett test larmar.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const las = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
const page = las('app/planering/page.tsx');
const hook = las('lib/hooks/useLinjeRedigering.ts');
const dolt = las('lib/vidaDolt.ts');
const utanKommentar = (t: string) => t.split('\n').filter((r) => !/^\s*(\/\/|--)/.test(r)).map((r) => r.replace(/\s(\/\/|--)\s.*$/, '')).join('\n');
const migr = las('supabase/migrations/20261025164917_objekt_linje_dolt.sql');

describe('Redigera linjer — vakter', () => {
  it('ritläget: medan redigeringen är på är all annan tryckning avstängd (spärren, kartläget och långtrycket)', () => {
    expect(page).toContain('|| larmPlacering || risaMarkMode || !!selectedSymbol || !!figur || linjeRed.aktiv;');
    expect(page).toContain('|| larmPlacering || risaMarkMode || !!selectedSymbol || !!figur || plusRadOppen || linjeRed.aktiv;');
    expect(page).toContain('&& !risaMarkMode && !linjeRed.aktiv && !objektListaOppen;');
    expect(page).toContain('if (linjeRed.aktiv) linjeRed.stang();');   // ett annat verktyg avslutar redigeringen
  });
  it('Vidas data skrivs ALDRIG: ingen skrivning mot objekt_geometri, bara tabellen objekt_linje_dolt', () => {
    for (const k of [hook, dolt]) expect(utanKommentar(k)).not.toContain('objekt_geometri');
    expect(dolt).toContain("from('objekt_linje_dolt')");
    expect(utanKommentar(migr)).not.toMatch(/objekt_geometri/);
  });
  it('larmen läser den OUPPKLIPPTA geometrin: sidan klipper aldrig traktGeo — bara kartans källa ritas klippt', () => {
    expect(page).not.toContain('klippVidaGeometri');
    expect(hook).toContain("map.getSource('trakt-geo-source')");
    expect(hook).toContain('klippVidaGeometri(inp.traktGeo, dolt)');
    expect(page).toContain('traktGeo, objektId: valtObjekt?.id');   // hooken får den ouppklippta
  });
  it('traktgränsen och Vidas kraftledning går inte att sudda', () => {
    expect(las('lib/linjeRedigering.ts')).toContain("EJ_REDIGERBARA_LINJER: readonly string[] = ['boundary']");
    expect(dolt).toContain("slag === 'kraftledning'");
    expect(dolt).toContain('l.skyddad');
  });
  it('nya delar får aldrig en "slå ihop basvägarna?"-fråga: id:n registreras som redan prövade', () => {
    expect(hook).toContain('inpRef.current.mergeChecked.current.add(String(m.id))');
  });
  it('Ångra tar bort det som lades till och sparar tillbaka det som togs bort (både markeringar och dolt)', () => {
    expect(hook).toContain('inpRef.current.deleteMarker(m.id)');
    expect(hook).toContain('skrivDolt(inpRef.current.db, inpRef.current.objektId, fore, s.dolt)');
  });
  it('entrén finns bara i planeringen (inte körvyn) och listan har ingen annan knapp än de sex', () => {
    expect(page).toContain("...(korvyActive ? [] : [{ id: 'redigera', titel: 'Redigera linjer'");
    const lista = las('components/planering/LinjeRedList.tsx');
    expect(lista.split('<button').length - 1).toBe(3);   // läges-knapparna (map), Ångra, Klar
  });
  it('migrationen: RLS på, alla läser, bara admin skriver (insert, update, delete), tid och författare sätts av servern', () => {
    expect(migr).toContain('enable row level security');
    expect(migr).toContain('for select to authenticated using (true)');
    for (const op of ['insert', 'update', 'delete']) {
      const rad = migr.split('\n').join(' ').match(new RegExp(`create policy objekt_linje_dolt_${op}[^;]*;`))?.[0] ?? '';
      expect(rad).toContain('public.ar_admin()');
      expect(rad).not.toContain('korvy_min_medarbetare() is not null');
    }
    expect(migr).toContain('new.andrad_at := now();');
  });
});
