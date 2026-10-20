// Källvakter för skotarläget (lassrapportering): kopplingen i planeringsvyn får inte läcka till skördarvyn/planeringen, och de fallgropar som
// kostat oss tidigare (lager-whitelisten, hooks före tidig retur, skrivning i Opti-tabellerna) bevakas här.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const rot = join(__dirname, '..', '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');
const page = las('app/planering/page.tsx');
// Migrationen är körd i prod i tio delar (+ sex delar 6a–6f för Färdigskotad med Opti) (Supabase-MCP:n hänger på stora funktionstexter): alla skotar_lass_*-filer i ordning.
const migrationer = (): string => readdirSync(join(rot, 'supabase/migrations')).filter((f) => /^\d+_skotar_lass_.*\.sql$/.test(f)).sort().map((f) => las(`supabase/migrations/${f}`)).join('\n');

describe('avläggsupptäckten (Daniel, Mölleryd 2026-10-20)', () => {
  const hook = las('lib/hooks/useSkotarLass.ts');
  const detektor = las('lib/skotarLass/lossning.ts');
  it('lasset bekräftar sig aldrig av en timer: ingen AUTO_BEKRAFTA_MS, och den enda timern i hooken är kvittot som försvinner', () => {
    expect(hook).not.toContain('AUTO_BEKRAFTA');
    expect(las('lib/skotarLass/lassModell.ts')).not.toContain('AUTO_BEKRAFTA');
    expect(hook.match(/window\.setTimeout\(/g)).toHaveLength(1);
    expect(hook).toMatch(/fas !== 'klar'\) return;\s*const t = window\.setTimeout/);
  });
  it('självbekräftelsen sker på ETT ställe — när lossningen tog slut — och kräver sjalvbekraftaEfterSlut (stilla ≥ 5 min eller Lossa här)', () => {
    expect(hook).toMatch(/l\.status === 'foreslaget' && kanBekrafta\(l\) && del\?\.avlaggId && sjalvbekraftaEfterSlut\(h\)/);
    expect(detektor).toMatch(/h\.manuell \|\| h\.stillaS >= LOSSNING\.SJALVBEKRAFTA_STILLA_S/);
  });
  it('en omladdning mitt i en lossning bekräftar inget (förslaget väntar på föraren)', () => {
    expect(hook).toContain('forslagTillVantande(l, nu)');
    expect(hook).not.toContain('bekraftaForslagVidStart');
  });
  it('Lossa här och "väntar på dig" finns bara i skotarläget och ligger ovanför kortet nertill', () => {
    const bit = page.slice(page.indexOf('SKOTARLÄGE: lassrapportering. Allt nedan finns bara'));
    expect(bit).toMatch(/<SkotarNedreRad antalVantar=\{sl\.vantarPaDig\.length\} lossar=\{!!sl\.oppen\} onLossaHar=\{sl\.lossaHar\}/);
    expect(bit).toContain('<VantarPaDigArk');
    expect(page.match(/<SkotarNedreRad/g)).toHaveLength(1);
    expect(las('components/planering/skotar/LossaHar.tsx')).toContain("querySelector('[data-nertill-kort]')");
    for (const f of ['LossningsKort', 'LossaHar']) expect(las(`components/planering/skotar/${f}.tsx`)).toContain('data-nertill-kort');
  });
  it('värdena Martin beslutade 2026-10-20: 3 min stilla, zon 50 m, 25 m ruta, självbekräfta efter 5 min, spärr efter förra lossningen', () => {
    expect(detektor).toMatch(/STILLA_S: 180,/);
    expect(detektor).toMatch(/STILLA_UTBREDNING_M: 25,/);
    expect(detektor).toMatch(/SJALVBEKRAFTA_STILLA_S: 300,/);
    expect(detektor).toMatch(/CYKEL_S: 600,/);
    expect(las('lib/skotarLass/avlagg.ts')).toMatch(/RADIE_M: 50,/);
  });
  it('detektorn rör aldrig fakt_lass och har inga timers (ren funktion)', () => {
    expect(detektor).not.toMatch(/setTimeout|setInterval|Date\.now|fakt_lass|supabase/);
  });
});

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
  it('objektnamnet i pillen byter ALDRIG objekt (objekt byts med hemknappen) — namnet öppnar objektinfon som före #831; ⓘ-knappen uppe till höger finns i skotarkörvyn (EN, på platshållarens plats)', () => {
    expect(page).not.toContain('skotarBytObjekt');
    expect(page).not.toContain('bytObjekt');
    expect(page).toContain('onNamn={() => setTraktOversiktOpen(o => !o)}');
    // ⓘ uppe till höger (rund mörk knapp 44 px, öppnar objektinfon/väder) måste finnas i skotarkörvyn — och bara EN: på platshållarens plats, aldrig en andra bredvid pillen.
    expect(page).toContain('{objektListaVal || skotarKorvy ? (');
    expect(page.match(/data-testid="objektinfo-knapp"/g)).toHaveLength(1);
    const knapp = page.slice(page.indexOf('data-testid="objektinfo-knapp"'), page.indexOf('data-testid="objektinfo-knapp"') + 1400);
    expect(knapp).toContain('aria-label="Objektinfo"');
    expect(knapp).toContain("width: '44px', height: '44px', borderRadius: '22px'");
    expect(knapp).toContain('setTraktOversiktOpen(o => !o)');
    const pill = las('components/planering/KorvyObjektPill.tsx');
    expect(pill).not.toContain('korvy-pill-byt');   // ingen pil ⌄ i körvyns pill
  });
  it('väder i objektinfon: för TRAKTENS position, också i testläget; morgonkortet provkörs med knappen i den gula bannern; Skotning-verktyget saknas i skotarläget', () => {
    expect(page).toContain("const skotarVader = useSkotarVader(skotarKorvy, skotarVaderPos, !!testlage);");
    expect(page).toMatch(/const skotarVaderPos = useMemo\(\(\) => \{\s*const la = Number\(valtObjekt\?\.lat\), lo = Number\(valtObjekt\?\.lng\);/);
    expect(page).toContain('vader: skotarKorvy ? <VaderLista dagar={skotarVader.dagar} laddar={skotarVader.laddar} idag={lokaltDatumStockholm(serverNu())} /> : undefined,');
    expect(page).not.toMatch(/skotarKorvy && !testlage/);   // väder och morgonkort göms inte längre i testläget
    expect(page).toContain('{skotarKorvy && skotarVader.kort && <MorgonKortVy kort={skotarVader.kort} onOk={skotarVader.stangKort} />}');
    expect(page).toMatch(/data-testid="skotar-provkor-morgonkort" onClick=\{skotarVader\.provkorKort\}/);
    const hook = las('lib/hooks/useSkotarVader.ts');
    expect(hook).toContain('if (test) return;');   // testläget: inget automatiskt kort, inget förbrukat
    expect(hook).toContain('if (test) setKort(morgonkortProv(regn24h, brandklass));');
    // Skotning-verktyget (Skotningsuttag) visas varken som knapp på kortet eller i Mer när lassrapporteringen är aktiv; planeringsvyns eget flöde är orört.
    expect(page).toContain('maskinSlag, utanSkotning: skotarLassAktiv }),');
    // Själva Skotningsuttag-panelen (resultatrutan i Markera utkört) ritas inte alls när lassrapporteringen är aktiv.
    expect(page).toMatch(/\{\/\* === Skotning panel \(slide-in från höger\) === \*\/\}\s*\{!skotarLassAktiv && \(\s*<div style=\{\{\s*position: 'fixed', top: '56px', right: 0, bottom: 0,/);
    expect(page).toContain("utanSkotning: skotarLassAktiv, status: valtObjekt.status ?? null");
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
    // Två gånger: den ursprungliga skotar_farduskotat(uuid) (3b) och ersättaren skotar_farduskotat(uuid, jsonb) (6d) — samma urval, båda bara där fältet är NULL.
    expect(upd.map((u) => u.trim().toLowerCase().replace(/\s+/g, ' '))).toEqual(['update dim_objekt', 'update dim_objekt']);
    expect(sql.match(/skotning_avslutad is null/g)).toHaveLength(2);
  });
  it('Färdigskotad räknar med Opti: servern drar Opti före appens start av skördat innan appens lass skalas, klienten skickar den med', () => {
    const dir = join(rot, 'supabase/migrations');
    const filer = readdirSync(dir).filter((f) => /^\d+_skotar_lass_6[a-f]_.*\.sql$/.test(f)).sort();
    expect(filer.map((f) => f.replace(/^\d+_/, ''))).toEqual([
      'skotar_lass_6a_avslut_opti_kolumn.sql', 'skotar_lass_6b_avslut_berakna.sql', 'skotar_lass_6c_avslut_berakna_omslag.sql',
      'skotar_lass_6d_farduskotat.sql', 'skotar_lass_6e_farduskotat_omslag_grants.sql', 'skotar_lass_6f_farduskotat_enarg_revoke.sql',
    ]);
    const sql = filer.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    expect(sql).toMatch(/add column if not exists opti jsonb/);
    expect(sql).toMatch(/o := least\(greatest\(coalesce\(\(coalesce\(p_opti, '\{\}'::jsonb\) ->> k\)::numeric, 0\), 0\), s\);/);   // Opti kläms till 0..skördat
    expect(sql).toMatch(/t := s - o;/);
    expect(sql).toMatch(/v_fakt := v_fakt \|\| jsonb_build_object\(k, t \/ r\)/);   // faktor = mål / appens rapporterade, aldrig skördat / rapporterat
    expect(sql).not.toMatch(/jsonb_build_object\(k, s \/ r\)/);
    expect(sql).toMatch(/skotar_farduskotat\(p_objekt uuid, p_opti jsonb\)/);
    const ko = las('lib/skotarLass/koKopplad.ts');
    expect(ko).toContain("rpc('skotar_farduskotat', { p_objekt: objektId, p_opti: opti })");
    const hook = las('lib/hooks/useSkotarLass.ts');
    expect(hook).toContain('optiForAvslut(skordat, opti, lassRef.current)');
    expect(hook).toMatch(/if \(!objektId \|\| !skordat \|\| !opti\) return;/);   // utan läst Opti skickas inget
  });
  it('skalat värde lagras aldrig på lassraden: ingen kolumn för det i tabellerna', () => {
    const sql = migrationer();
    const tabeller = sql.slice(0, sql.indexOf('alter table skotar_lass enable'));
    expect(tabeller).not.toMatch(/m3_skalat/);
  });
});
