// Källvakter för skotarläget (lassrapportering): kopplingen i planeringsvyn får inte läcka till skördarvyn/planeringen, och de fallgropar som
// kostat oss tidigare (lager-whitelisten, hooks före tidig retur, skrivning i Opti-tabellerna) bevakas här.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const rot = join(__dirname, '..', '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');
const page = las('app/planering/page.tsx');
// Migrationen är körd i prod i tio delar (Supabase-MCP:n hänger på stora funktionstexter): alla skotar_lass_*-filer i ordning.
const migrationer = (): string => readdirSync(join(rot, 'supabase/migrations')).filter((f) => /^\d+_skotar_lass_.*\.sql$/.test(f)).sort().map((f) => las(`supabase/migrations/${f}`)).join('\n');

describe('skotarläget i planeringsvyn', () => {
  it('allt är av utanför skotarkörvyn: aktiv kräver skotarKorvy och en vald maskin', () => {
    expect(page).toMatch(/const skotarLassAktiv = skotarKorvy && !!valtObjekt\?\.id && !!skotarMaskinId;/);
    expect(page).toMatch(/useSkotarLass\(\{\s*aktiv: skotarLassAktiv,/);
  });
  it('maskinen är ENHETENS (samma källa som hyttspåret) — föraren väljer aldrig maskin för skotarläget', () => {
    expect(page).toMatch(/const skotarMaskinId = skotarKorvy \? hyttsparMaskinId\(enhetMaskinId, 'skotare', null\) : null;/);
    // rollen kommer ur maskinregistret: valjObjektIMaskin → oppnaKorvyPa(obj, enhetRoll) → korvyForceRoll
    expect(page).toMatch(/const enhetRoll = enhetMaskinId \? rollForMaskin\(dimMaskiner, enhetMaskinId\) : null;/);
    expect(page).toMatch(/oppnaKorvyPa\(obj, enhetRoll\);/);
  });
  it('testläget (/maskin?som=) kör skotarläget som TORRKÖRNING: minneskö, inget skickas, inga riktiga markeringar', () => {
    expect(page).toMatch(/useSkotarLass\(\{\s*aktiv: skotarLassAktiv,\s*torr: !!testlage,/);
    expect(page).toMatch(/skotarSkapaAvlagg = [^\n]*\n\s*if \(testlageAktivRef\.current\) return null;/);
    expect(page).toContain('skotarLass.provkorLossning(skotarValtAvlagg)');
    const ko = las('lib/skotarLass/koKopplad.ts');
    expect(ko).toMatch(/if \(torr\) \{[\s\S]{0,260}skickaLass: async \(\) => true, skickaAvslut: async \(\) => true/);
    expect(ko).toMatch(/if \(!torr\) void korLassKo\(\);/);
  });
  it('skotarens pill har inga skördarräknare (Högstubbar/Evighetsträd hör till skördaren)', () => {
    expect(page).toMatch(/<KorvyObjektPill[\s\S]{0,900}visaRaknare=\{!skotarKorvy\}/);
  });
  it('testbannern skär inte av rutan: bannern har fast höjd och headern flyttas ner lika mycket i testläget', () => {
    expect(page).toContain('const TESTBANNER_HOJD_PX = 36;');
    expect(page).toMatch(/height: `calc\(env\(safe-area-inset-top, 0px\) \+ \$\{TESTBANNER_HOJD_PX\}px\)`/);
    expect(page).toMatch(/padding: `calc\(env\(safe-area-inset-top, 0px\) \+ 12px\$\{testlage \? ` \+ \$\{TESTBANNER_HOJD_PX\}px` : ''\}\) 16px 12px`/);
  });
  it('objektbyte i skotarläget: namnet byter objekt (⌄), objektinfon har egen ⓘ-knapp', () => {
    expect(page).toContain('const skotarBytObjekt = () => {');
    expect(page).toMatch(/if \(maskinlage\) \{ tillObjektlistan\(\); return; \}/);
    expect(page).toContain('bytObjekt={skotarKorvy}');
    expect(page).toContain('{objektListaVal || skotarKorvy ? (');
  });
  it('kvar kräver Opti-lassen (skotat före appens start) och räknar aldrig en trakt med avslutad skotning', () => {
    const hook = las('lib/hooks/useSkotarLass.ts');
    expect(hook).toMatch(/skordat && opti && skotningAvslutad !== true \? beraknaKvar\(skordat, lass, opti\)/);
    expect(hook).toContain('lasOptiLass(vo, ids)');
    const ko = las('lib/skotarLass/koKopplad.ts');
    expect(ko).toContain(".from('fakt_lass').select(");
    expect(ko).toContain(".from('fakt_lass_sortiment').select(");
    expect(ko).not.toMatch(/\.select\([^)]*lass_id/);   // raderna kopplas på (maskin, datum, lass_nummer) — aldrig lass_id
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
    expect(page).toMatch(/kvar=\{skotarLassAktiv && \(skotarLass\.avslut/);
    expect(page).toMatch(/if \(skotarLassAktiv\) \{\s*g\.push\(\{ id: 'skotad-trakt'/);
    expect(page).toMatch(/\{skotarLassAktiv && \(\(\) => \{\s*const sl = skotarLass;/);
  });
  it('Vidas avläggskort behåller sitt innehåll: skotat-sektionen läggs OVANPÅ, typKalla och rader finns kvar', () => {
    expect(page).toMatch(/traktInfo\.kategori === 'punkt' && traktInfo\.nr && valtObjekt[\s\S]{0,900}\{typKalla\}<\/div>/);
    expect(page).toContain('{traktInfo.rader.map((r, i) => (');
  });
});

describe('datamodellen', () => {
  const filer = (dir: string): string[] => readdirSync(join(rot, dir)).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)).map((f) => join(dir, f));
  const skotarKod = [...filer('lib/skotarLass'), 'lib/hooks/useSkotarLass.ts', 'lib/hooks/useSkotarVader.ts', ...filer('components/planering/skotar')];

  it('appens lass skrivs aldrig i Opti-tabellerna (fakt_lass*) — bara i skotar_lass*', () => {
    // Läsa fakt_lass* är rätt (Opti-lassen före appens start räknas i kvar) — att skriva dit är förbjudet.
    for (const f of skotarKod) expect(las(f), f).not.toMatch(/from\(\s*['"]fakt_lass[^)]*\)\s*\.(insert|upsert|update|delete)/);
  });
  it('uppföljningens globala skotat-regel (lib/skotat.ts) rörs inte', () => {
    for (const f of skotarKod) expect(las(f), f).not.toMatch(/from ['"][^'"]*\/skotat['"]/);
  });
  it('migrationen är additiv och rör inte befintliga tabeller utom dim_objekt.skotning_avslutad (bara där den är NULL)', () => {
    const sql = migrationer();
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\balter\s+table\s+(?!if exists skotar_)(?!skotar_)/i);
    const upd = sql.match(/^\s*update\s+\w+/gim) ?? [];
    expect(upd.map((u) => u.trim().toLowerCase().replace(/\s+/g, ' '))).toEqual(['update dim_objekt']);
    expect(sql).toMatch(/skotning_avslutad is null/);
  });
  it('skalat värde lagras aldrig på lassraden: ingen kolumn för det i tabellerna', () => {
    const sql = migrationer();
    const tabeller = sql.slice(0, sql.indexOf('alter table skotar_lass enable'));
    expect(tabeller).not.toMatch(/m3_skalat/);
  });
});
