// Källvakter för skotarläget (lassrapportering): kopplingen i planeringsvyn får inte läcka till skördarvyn/planeringen, och de fallgropar som
// kostat oss tidigare (lager-whitelisten, hooks före tidig retur, skrivning i Opti-tabellerna) bevakas här.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const rot = join(__dirname, '..', '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');
const page = las('app/planering/page.tsx');

describe('skotarläget i planeringsvyn', () => {
  it('allt är av utanför skotarkörvyn: aktiv kräver skotarKorvy, vald maskin och inget testläge', () => {
    expect(page).toMatch(/const skotarLassAktiv = skotarKorvy && !!valtObjekt\?\.id && !!skotarMaskinId && !testlage;/);
    expect(page).toMatch(/useSkotarLass\(\{\s*aktiv: skotarLassAktiv,/);
  });
  it('körvyns lager-whitelist släpper igenom avläggsrutorna (annars ligger datan i källan men ritas aldrig)', () => {
    expect(page).toMatch(/KEEP_PREFIX = \[[^\]]*'skotar-avlagg-'/);
  });
  it('hookarna ligger före komponentens enda return (hooks före tidiga returer)', () => {
    const hook = page.indexOf('useSkotarLass({');
    const retur = page.indexOf('\n  return (\n', hook);
    expect(hook).toBeGreaterThan(0);
    expect(retur).toBeGreaterThan(hook);
    expect(page.indexOf('useSkotarVader(')).toBeLessThan(retur);
  });
  it('kvar-delen i pillen, färdigskotad-raden och korten bärs av skotarLassAktiv', () => {
    expect(page).toMatch(/kvar=\{skotarLassAktiv && skotarLass\.avslut/);
    expect(page).toMatch(/if \(skotarLassAktiv\) \{\s*g\.push\(\{ id: 'skotad-trakt'/);
    expect(page).toMatch(/\{skotarLassAktiv && \(\(\) => \{\s*const sl = skotarLass;/);
  });
  it('Vidas avläggskort behåller sitt innehåll: skotat-sektionen läggs OVANPÅ, typKalla och rader finns kvar', () => {
    expect(page).toMatch(/traktInfo\.kategori === 'punkt' && traktInfo\.nr && valtObjekt[\s\S]{0,400}\{typKalla\}<\/div>/);
    expect(page).toContain('{traktInfo.rader.map((r, i) => (');
  });
});

describe('datamodellen', () => {
  const filer = (dir: string): string[] => readdirSync(join(rot, dir)).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)).map((f) => join(dir, f));
  const skotarKod = [...filer('lib/skotarLass'), 'lib/hooks/useSkotarLass.ts', 'lib/hooks/useSkotarVader.ts', ...filer('components/planering/skotar')];

  it('appens lass skrivs aldrig i Opti-tabellerna (fakt_lass*) — bara i skotar_lass*', () => {
    for (const f of skotarKod) expect(las(f), f).not.toMatch(/from\(\s*['"]fakt_lass/);
  });
  it('uppföljningens globala skotat-regel (lib/skotat.ts) rörs inte', () => {
    for (const f of skotarKod) expect(las(f), f).not.toMatch(/from ['"][^'"]*\/skotat['"]/);
  });
  it('migrationen är additiv och rör inte befintliga tabeller utom dim_objekt.skotning_avslutad (bara där den är NULL)', () => {
    const sql = las('supabase/migrations/20261019150000_skotar_lass.sql');
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\balter\s+table\s+(?!if exists skotar_)(?!skotar_)/i);
    const upd = sql.match(/^\s*update\s+\w+/gim) ?? [];
    expect(upd.map((u) => u.trim().toLowerCase().replace(/\s+/g, ' '))).toEqual(['update dim_objekt']);
    expect(sql).toMatch(/skotning_avslutad is null/);
  });
  it('skalat värde lagras aldrig på lassraden: ingen kolumn för det i tabellerna', () => {
    const sql = las('supabase/migrations/20261019150000_skotar_lass.sql');
    const tabeller = sql.slice(0, sql.indexOf('alter table skotar_lass enable'));
    expect(tabeller).not.toMatch(/m3_skalat/);
  });
});
