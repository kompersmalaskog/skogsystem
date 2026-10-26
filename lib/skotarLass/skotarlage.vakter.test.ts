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

describe('föraren registrerar själv — appen frågar aldrig (Martin 2026-10-26, Elefanten i Mölleryd: kortet kom upp 13 gånger, 2 var riktiga lass)', () => {
  const hook = las('lib/hooks/useSkotarLass.ts');
  const zon = las('lib/skotarLass/zon.ts');
  it('upptäckten är borta: ingen detektor, inga lossningshändelser, inget kort som kommer av sig självt', () => {
    expect(() => las('lib/skotarLass/lossning.ts')).toThrow();
    expect(() => las('components/planering/skotar/LossningsKort.tsx')).toThrow();
    expect(() => las('components/planering/skotar/LossaHar.tsx')).toThrow();
    for (const orsak of ['stegaDetektor', 'nyDetektor', 'lossningVidNyttAvlagg', 'hanteraHandelse', 'hanteraSlut', 'nytt_avlagg_fraga', 'vantarPaDig', 'forslagTillVantande']) expect(hook).not.toContain(orsak);
    for (const orsak of ['LossningsKort', 'VantarPaDigArk', 'SkotarNedreRad', 'skotarVantarOppet', 'sl.kort', 'sl.vantarPaDig', 'sl.oppen']) expect(page).not.toContain(orsak);
  });
  it('INGA timers i hooken som bekräftar eller skapar något: de enda är zonens puls (2 s) och serverns omläsning (60 s)', () => {
    expect(hook).not.toContain('AUTO_BEKRAFTA');
    expect(hook.match(/window\.setTimeout\(/g)).toBeNull();
    expect(hook.match(/window\.setInterval\(/g)).toHaveLength(2);
    expect(hook).toMatch(/window\.setInterval\(raknaZon, 2000\)/);
    expect(hook).toMatch(/window\.setInterval\(\(\) => \{ if \(document\.visibilityState === 'visible'\) void ladda\(\); \}, 60_000\)/);
  });
  it('zonen skapar ALDRIG ett lass: den sätter bara iZon (knappens mål); skapaLass anropas bara från startaUtkast, som bara ett tryck når', () => {
    expect(zon).not.toMatch(/skapaLass|sparaLass|setTimeout|setInterval|Date\.now/);
    expect(hook.match(/skapaLass\(/g)).toHaveLength(1);
    const raknaZon = hook.slice(hook.indexOf('const raknaZon = useCallback'), hook.indexOf('useEffect(() => {\n    if (!aktiv || !objektId || !maskinId || !position) return;'));
    expect(raknaZon).not.toMatch(/startaUtkast|skapaLass|spara\(|lossaVidAvlagg|registreraLass/);
    // startaUtkast når man bara via de tre tryck: Lossa-knappen, + › Registrera lass (och Ja på frågan som den ställer) och testlägets Provkör
    expect(hook.match(/startaUtkast\(/g)).toHaveLength(4);   // lossaVidAvlagg, provkorLossning, registreraLass och svaraNyttAvlagg (Ja på frågan registreraLass ställer)
    for (const f of ['lossaVidAvlagg', 'provkorLossning', 'registreraLass', 'svaraNyttAvlagg']) expect(hook).toContain(`const ${f} = useCallback`);
  });
  it('INGEN självbekräftelse (Martin 2026-10-20): bekräftat blir bara det föraren svarat Klar på — som \'forare\', på exakt ett ställe', () => {
    expect(hook).not.toMatch(/bekrafta\([^)]*'auto'/);
    expect(hook).not.toContain('sjalvbekrafta');
    expect(hook.match(/bekrafta\(/g)).toHaveLength(1);
    expect(hook.match(/bekrafta\([^)]*'forare'/g)).toHaveLength(1);
  });
  it('lasset är ett UTKAST i minnet tills Klar: spara() skriver aldrig utkastet, och Avbryt/Ta bort kastar det', () => {
    expect(hook).toMatch(/if \(utkastRef\.current\?\.id === l\.id\) \{ utkastRef\.current = l; setUtkast\(l\); return; \}/);
    expect(hook).toMatch(/const avbrytAndra[\s\S]{0,260}utkastRef\.current\?\.id === andra\.lassId\) \{ utkastRef\.current = null; setUtkast\(null\)/);
    expect(hook).toMatch(/const strykLass[\s\S]{0,160}utkastRef\.current\?\.id === lassId\) \{ utkastRef\.current = null; setUtkast\(null\)/);
    // Klar utan avlägg eller sortiment sparar ingenting och lämnar kortet öppet
    expect(hook).toMatch(/if \(!l \|\| !kanBekrafta\(l\)\) return;/);
  });
  it('gamla obesvarade lass rörs inte: hooken skriver aldrig om ett lass som lästs från kön vid start', () => {
    expect(hook).not.toMatch(/for \(const l of lokalt\)/);
    expect(hook).toContain('Gamla lass rörs inte');
  });
  it('knappen "Lossa · Avlägg X" bor i LossaKnapp, ≥ 56 px, ovanför kortet nertill — och sidan visar den bara i zonen och när inget annat ligger nertill', () => {
    const knapp = las('components/planering/skotar/LossaKnapp.tsx');
    expect(knapp).toContain("querySelector('[data-nertill-kort]')");
    expect(knapp).toContain('lossaText(avlagg)');
    expect(las('components/planering/skotar/stil.ts')).toContain('export const TRYCK_PX = 56;');
    expect(las('components/planering/skotar/stil.ts')).toMatch(/knappPrimar: CSSProperties = \{ \.\.\.KNAPP\.primar, minHeight: TRYCK_PX/);
    expect(page.match(/<LossaKnapp/g)).toHaveLength(1);
    expect(page).toMatch(/\{sl\.lossaKnapp && !sl\.andra && !sl\.nyttAvlagg && !skotarKvarOppet && !skotarFardigOppet && \(\s*<LossaKnapp avlagg=\{sl\.lossaKnapp\} vidTryck=\{sl\.lossaVidAvlagg\} \/>/);
    expect(las('components/planering/skotar/NyttAvlaggKort.tsx')).toContain('data-nertill-kort');
  });
  it('+ › Registrera lass finns i Trakten-gruppen (där inget avlägg finns) och är en vanlig knapp som stänger plusmenyn', () => {
    expect(page).toMatch(/\{ id: 'registrera-lass', namn: 'Registrera lass', [^}]*typ: 'knapp', onTryck: \(\) => \{ stangPlus\(\); skotarLass\.registreraLass\(\); \} \}/);
  });
  it('zonen är DENSAMMA 50 m som upptäckten hade, in vid 50 och ut vid 60; en färsk fix (≤ 10 s) krävs', () => {
    expect(las('lib/skotarLass/avlagg.ts')).toMatch(/RADIE_M: 50,/);
    expect(zon).toMatch(/FERSK_FIX_MS: 10_000,/);
    expect(zon).toMatch(/UT_EXTRA_M: 10,/);
    expect(zon).toContain('traffaAvlagg(pos, avlagg, AVLAGG.RADIE_M + (redanInne ? ZON.UT_EXTRA_M : 0))');
  });
  it('Registrera lass: bara avlägg märkta skapadViaLossaHar flyttas, och bara av hookens effekt (aldrig Vidas, planerarens eller handsatta)', () => {
    expect(page).toMatch(/if \(via === 'lossa_har'\) m\.skapadViaLossaHar = true;/);
    expect(page).toMatch(/m\.isMarker && m\.type === 'landing' && m\.skapadViaLossaHar && String\(m\.id\) === markerId/);
    expect(page.match(/skapadViaLossaHar/g)).toHaveLength(4);   // sätts, läses till egna avlägg, flytt-spärren (en gång i kommentar/filter)
    expect(hook).toMatch(/if \(!aktiv \|\| torr\) return;\s*for \(const a of avlagg\)/);
    expect(hook).toContain('iZonRef.current?.avlagg.id === a.id');
    expect(las('lib/skotarLass/lossaHar.ts')).toMatch(/if \(a\.kalla !== 'egen' \|\| !a\.viaLossaHar\) return null;/);
  });
  it('sortimentet står med namn och mängd skilda åt ("Kubb 305: 17 m³", aldrig "Kubb 305 17")', () => {
    const modell = las('lib/skotarLass/lassModell.ts');
    expect(modell).toContain("`${sortimentDelar(r.namn).sortiment}: ${heltM3(r.m3)} m³`");
    expect(modell).toContain("`${visaNamn(r.namn)}: ${heltM3(r.m3)} m³`");
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
    expect(page).toContain('{objektListaVal || skotarKorvy || instruktionerAktiv ? (');   // + skördarens maskinläge: samma ⓘ, EN knapp
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
    expect(hook).toMatch(/skordat && opti && skotningAvslutad !== true && harSkordat\(skordat\) \? beraknaKvar\(skordat, lass, opti\)/);   // och inget skördat alls ger ingen Kvar (aldrig \"Kvar ~0 m³\")
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
    // Kortet är KartKort (lib/kartKort.vakter.test.ts): typ · källa går som `kalla`, skotat-sektionen är det första i kortets innehåll och Vidas rader ligger kvar under den.
    expect(page).toMatch(/<KartKort\s+key=\{nyckel \|\| traktInfo\.rubrik\}[\s\S]{0,1800}kalla=\{\[typKalla, \.\.\.kontext\]/);
    expect(page).toMatch(/onStang=\{stangTraktKort\}\s*>\s*(?:\{\/\*[^*]*\*\/\}\s*)?\{skotarLassAktiv && traktInfo\.kategori === 'punkt' && traktInfo\.nr && valtObjekt/);
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
    // skotar_lass* får uppdateras (granskningen, 20261025184152, ändrar lassens egen status); allt annat som uppdateras ska vara dim_objekt.
    const upd = (sql.match(/^\s*update\s+\w+/gim) ?? []).filter((u) => !/^\s*update\s+skotar_lass\b/i.test(u));
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
    expect(hook).toMatch(/if \(!objektId \|\| !skordat \|\| !opti \|\| !harSkordat\(skordat\)\) return;/);   // utan läst Opti, eller utan något skördat, skickas inget
  });
  it('skalat värde lagras aldrig på lassraden: ingen kolumn för det i tabellerna', () => {
    const sql = migrationer();
    const tabeller = sql.slice(0, sql.indexOf('alter table skotar_lass enable'));
    expect(tabeller).not.toMatch(/m3_skalat/);
  });
});

describe('gamla självbekräftade lass (bekraftad_av = auto) — granskningen 2026-10-24', () => {
  const granskning = las('supabase/migrations/20261025184152_skotar_lass_granskning.sql');
  it('granskningen rör bara skotar_lass*: aldrig dim_objekt, objekt eller Opti-tabellerna', () => {
    expect(granskning).not.toMatch(/\b(update|insert\s+into|delete\s+from)\s+(dim_objekt|objekt|fakt_lass|fakt_sortiment)\b/i);
    expect(granskning).not.toMatch(/\bdelete\s+from\s+skotar_lass/i);   // inget raderas — struket är en status
    expect(granskning).not.toMatch(/\bdrop\s+table\b/i);
  });
  it('allt som räknar appens lass som skotat lämnar auto utanför (vyn, Färdigskotad, admin-jämförelsen) — och loggen skrivs av funktionen, aldrig av en klient', () => {
    expect(granskning.match(/bekraftad_av is distinct from 'auto'/g)!.length).toBeGreaterThanOrEqual(4);
    expect(granskning).toMatch(/revoke all on skotar_lass_granskning from public, anon, authenticated;\s*grant select on skotar_lass_granskning to authenticated;/);
    expect(granskning).not.toMatch(/create policy skotar_lass_granskning_(ins|upd|del)/);
    expect(granskning).toMatch(/if not ar_admin\(\) then raise exception/);
  });
  it('planerarens granskning är admin-vy: appens förarvyer importerar den inte', () => {
    for (const f of [...readdirSync(join(rot, 'lib/skotarLass')).filter((x) => /\.tsx?$/.test(x) && !/\.test\./.test(x)).map((x) => `lib/skotarLass/${x}`), 'lib/hooks/useSkotarLass.ts', 'app/planering/page.tsx']) {
      if (f.endsWith('granskaKopplad.ts')) continue;
      expect(las(f), f).not.toMatch(/granskaKopplad|ObekraftadeLass/);
    }
  });
});
