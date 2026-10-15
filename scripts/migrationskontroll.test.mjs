import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  KontrollFel, MAX_PER_ANROP, TEXT_KAN_INTE_KONTROLLERA, TEXT_KOR_INTE_RELEASE,
  arServicenyckel, delaFilnamn, formatera, jamforMotProd, kontrolleraMigrationer, lasMiljo, utgangskod,
} from './migrationskontroll.mjs';

const URL_ = 'https://abc.supabase.co';
const ANON = 'sb_publishable_exempelnyckel';
const MILJO = { NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON };
const INGEN_FIL = () => null;
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signatur`;

const svar = (kropp, { status = 200, text } = {}) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => kropp, text: async () => text ?? JSON.stringify(kropp),
});
const tomt = { saknas: [], versionsglapp: [], versionskrock: [], ok: 0 };
const fejk = (hanterare) => { const anrop = []; const f = async (url, opt) => { anrop.push({ url, opt }); return hanterare(url, opt, anrop.length); }; f.anrop = anrop; return f; };
const fangst = () => { const ut = []; const fel = []; return { ut: (s) => ut.push(s), fel: (s) => fel.push(s), utText: () => ut.join('\n'), felText: () => fel.join('\n') }; };

describe('delaFilnamn', () => {
  it('version före första _, namn efter, utan .sql och utan mapp', () => {
    expect(delaFilnamn('supabase/migrations/20261014125025_starta_jobb_ursprung_hor_till.sql')).toEqual({ version: '20261014125025', namn: 'starta_jobb_ursprung_hor_till' });
    expect(delaFilnamn('20261015074529_jamfor_migrationer.sql')).toEqual({ version: '20261015074529', namn: 'jamfor_migrationer' });
  });
  it('äldre filer med datum som version tolkas lika (de får glapp mot prod, inte krasch)', () => {
    expect(delaFilnamn('supabase/migrations/20260507_detalj_stock_dedupe_keys.sql')).toEqual({ version: '20260507', namn: 'detalj_stock_dedupe_keys' });
  });
  it('allt som inte är en migrationsfil → null', () => {
    expect(delaFilnamn('supabase/migrations/README.md')).toBeNull();
    expect(delaFilnamn('supabase/migrations/utan_version.sql')).toBeNull();
  });
});

describe('lasMiljo: bara anon, aldrig servicenyckeln', () => {
  it('miljön först, sedan .env.local; citat och export hanteras', () => {
    expect(lasMiljo(MILJO, INGEN_FIL)).toEqual({ url: URL_, key: ANON });
    const lokal = () => 'export NEXT_PUBLIC_SUPABASE_URL="https://lokal.supabase.co"\r\nNEXT_PUBLIC_SUPABASE_ANON_KEY=\'sb_publishable_lokal\'\r\n# kommentar\r\n';
    expect(lasMiljo({}, lokal)).toEqual({ url: 'https://lokal.supabase.co', key: 'sb_publishable_lokal' });
    expect(lasMiljo({ NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON }, lokal)).toEqual({ url: URL_, key: ANON });
  });
  it('saknad url eller nyckel → KontrollFel', () => {
    expect(() => lasMiljo({}, INGEN_FIL)).toThrow(KontrollFel);
    expect(() => lasMiljo({ NEXT_PUBLIC_SUPABASE_URL: URL_ }, INGEN_FIL)).toThrow(/saknas/);
  });
  it('läser ALDRIG servicenyckeln: den används inte som reserv när anon saknas', () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role' }), SUPABASE_KEY: 'x', SUPABASE_SERVICE_KEY: 'y' };
    expect(() => lasMiljo(env, INGEN_FIL)).toThrow(/saknas/);
    const lokal = () => 'SUPABASE_SERVICE_ROLE_KEY=hemlig\nNEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\n';
    expect(() => lasMiljo({}, lokal)).toThrow(/saknas/);
  });
  it('vägrar en nyckel som ser ut som en servicenyckel (JWT role=service_role eller sb_secret_)', () => {
    expect(arServicenyckel(jwt({ role: 'service_role' }))).toBe(true);
    expect(arServicenyckel(jwt({ role: 'anon' }))).toBe(false);
    expect(arServicenyckel('sb_secret_abc')).toBe(true);
    expect(arServicenyckel('sb_publishable_abc')).toBe(false);
    expect(arServicenyckel('inte.en.jwt')).toBe(false);
    expect(() => lasMiljo({ NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) }, INGEN_FIL)).toThrow(/servicenyckel/);
    expect(lasMiljo({ NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: 'anon' }) }, INGEN_FIL).key).toBe(jwt({ role: 'anon' }));
  });
});

describe('jamforMotProd: kontakten med prod', () => {
  const filer = [{ version: '1', namn: 'a' }, { version: '2', namn: 'b' }];
  it('POST till rpc/jamfor_migrationer med anon-nyckeln som apikey och Bearer, och filerna som p_filer', async () => {
    const f = fejk(() => svar({ ...tomt, ok: 2 }));
    const res = await jamforMotProd(filer, { url: `${URL_}/`, key: ANON, fetchFn: f });
    expect(res.ok).toBe(2);
    expect(f.anrop).toHaveLength(1);
    expect(f.anrop[0].url).toBe(`${URL_}/rest/v1/rpc/jamfor_migrationer`);
    expect(f.anrop[0].opt.method).toBe('POST');
    expect(f.anrop[0].opt.headers.apikey).toBe(ANON);
    expect(f.anrop[0].opt.headers.Authorization).toBe(`Bearer ${ANON}`);
    expect(JSON.parse(f.anrop[0].opt.body)).toEqual({ p_filer: filer });
  });
  it('inga filer → inget anrop alls', async () => {
    const f = fejk(() => { throw new Error('ska inte anropas'); });
    expect(await jamforMotProd([], { url: URL_, key: ANON, fetchFn: f })).toEqual(tomt);
    expect(f.anrop).toHaveLength(0);
  });
  it('fler än 500 delas i omgångar och resultaten läggs ihop', async () => {
    const manga = Array.from({ length: MAX_PER_ANROP * 2 + 100 }, (_, i) => ({ version: String(i), namn: 'x' }));
    const f = fejk((_u, opt) => { const n = JSON.parse(opt.body).p_filer.length; return svar({ saknas: [{ version: 'v', namn: 'n' }], versionsglapp: [], versionskrock: [], ok: n - 1 }); });
    const res = await jamforMotProd(manga, { url: URL_, key: ANON, fetchFn: f });
    expect(f.anrop.map((a) => JSON.parse(a.opt.body).p_filer.length)).toEqual([500, 500, 100]);
    expect(res.saknas).toHaveLength(3);
    expect(res.ok).toBe(manga.length - 3);
  });
  it('allt som inte är ett pålitligt svar blir KontrollFel — aldrig ett tomt OK', async () => {
    const k = (f) => jamforMotProd(filer, { url: URL_, key: ANON, fetchFn: f, timeoutMs: 50 });
    await expect(k(fejk(() => { throw new Error('ECONNRESET'); }))).rejects.toThrow(/ingen kontakt med prod \(ECONNRESET\)/);
    await expect(k(fejk(() => svar({}, { status: 401, text: 'Invalid API key' })))).rejects.toThrow(/HTTP 401: Invalid API key/);
    await expect(k(fejk(() => svar({}, { status: 404, text: '{"code":"PGRST202"}' })))).rejects.toThrow(/jamfor_migrationer finns inte i prod/);
    await expect(k(fejk(() => svar({ saknas: [] })))).rejects.toThrow(/oväntat svar/);
    await expect(k(fejk(() => svar(null)))).rejects.toThrow(/oväntat svar/);
    await expect(k(fejk(() => ({ ok: true, status: 200, json: async () => { throw new Error('inte json'); } })))).rejects.toThrow(/inte är JSON/);
    const hang = fejk((_u, opt) => new Promise((_res, rej) => opt.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); })));
    await expect(k(hang)).rejects.toThrow(/ingen kontakt med prod inom/);
  });
});

describe('formatera och utgångskod', () => {
  it('tre rader: Saknas i prod, Versionsglapp, OK — krock bara när det finns någon', () => {
    const t = formatera({ ...tomt, ok: 30 });
    expect(t).toContain('  Saknas i prod: 0');
    expect(t).toContain('  Versionsglapp: 0');
    expect(t).toContain('  OK: 30');
    expect(t).not.toContain('Versionskrock');
    expect(t.indexOf('Saknas i prod')).toBeLessThan(t.indexOf('Versionsglapp'));
    expect(t.indexOf('Versionsglapp')).toBeLessThan(t.indexOf('OK:'));
  });
  it('listar migrationerna under sin rad, och glappet säger vad filen ska heta', () => {
    const t = formatera({
      saknas: [{ version: '20261015090000', namn: 'ny_sak' }],
      versionsglapp: [{ version: '20261012100000', namn: 'utjamningsperiod_namn', prod_version: '20261012092328' }],
      versionskrock: [{ version: '20261012092328', namn: 'annan', prod_namn: 'utjamningsperiod_namn' }], ok: 3,
    });
    expect(t).toContain('  Saknas i prod: 1\n    20261015090000_ny_sak');
    expect(t).toContain('20261012100000_utjamningsperiod_namn  →  prod har 20261012092328  (döp om filen till 20261012092328_utjamningsperiod_namn.sql)');
    expect(t).toContain('  Versionskrock: 1');
    expect(t).toContain('prod har den versionen som "utjamningsperiod_namn"');
  });
  it('felkod 1 om något saknas eller krockar, annars 0 (glapp varnar bara)', () => {
    expect(utgangskod(tomt)).toBe(0);
    expect(utgangskod({ ...tomt, versionsglapp: [{}] })).toBe(0);
    expect(utgangskod({ ...tomt, saknas: [{}] })).toBe(1);
    expect(utgangskod({ ...tomt, versionskrock: [{}] })).toBe(1);
  });
});

describe('kontrolleraMigrationer, releaseläget (vad-slapps)', () => {
  const sokv = ['supabase/migrations/20261014125025_a.sql', 'supabase/migrations/20261012100000_b.sql'];
  const kor = (svarsobjekt, extra = {}) => { const f = fangst(); return kontrolleraMigrationer(sokv, { env: MILJO, lasFil: INGEN_FIL, fetchFn: fejk(() => svar(svarsobjekt)), ut: f.ut, fel: f.fel, ...extra }).then((kod) => ({ kod, ut: f.utText(), fel: f.felText() })); };

  it('allt OK → 0, "OK: 2" och ingen varning', async () => {
    const r = await kor({ ...tomt, ok: 2 });
    expect(r.kod).toBe(0);
    expect(r.ut).toContain('OK: 2');
    expect(r.fel).toBe('');
  });
  it('Saknas i prod > 0 → felkod 1 och texten "Kör inte release"', async () => {
    const r = await kor({ ...tomt, saknas: [{ version: '20261012100000', namn: 'b' }], ok: 1 });
    expect(r.kod).toBe(1);
    expect(r.ut).toContain('Saknas i prod: 1');
    expect(r.fel).toContain(TEXT_KOR_INTE_RELEASE);
  });
  it('versionskrock blockerar också (felkod 1, "Kör inte release")', async () => {
    const r = await kor({ ...tomt, versionskrock: [{ version: '1', namn: 'a', prod_namn: 'b' }], ok: 1 });
    expect(r.kod).toBe(1);
    expect(r.fel).toContain(TEXT_KOR_INTE_RELEASE);
  });
  it('bara versionsglapp → 0 men med en uppmaning att döpa om', async () => {
    const r = await kor({ ...tomt, versionsglapp: [{ version: '20261012100000', namn: 'b', prod_version: '20261012092328' }], ok: 1 });
    expect(r.kod).toBe(0);
    expect(r.ut).toContain('Versionsglapp: 1');
    expect(r.ut).toContain('döp om filerna');
    expect(r.fel).toBe('');
  });
  it('FALLERAR STÄNGT: kan kontrollen inte köras → felkod 2 och exakt texten, aldrig 0', async () => {
    const saknasNyckel = await kor(tomt, { env: {} });
    expect(saknasNyckel.kod).toBe(2);
    expect(saknasNyckel.fel).toContain(TEXT_KAN_INTE_KONTROLLERA);
    expect(saknasNyckel.fel).toContain('saknas');
    expect(saknasNyckel.ut).not.toContain('OK:');
    const nat = await kor(tomt, { fetchFn: fejk(() => { throw new Error('ENOTFOUND'); }) });
    expect(nat.kod).toBe(2);
    expect(nat.fel).toContain('Kunde inte kontrollera mot prod — kör inte release');
    const funktionSaknas = await kor(tomt, { fetchFn: fejk(() => svar({}, { status: 404, text: '' })) });
    expect(funktionSaknas.kod).toBe(2);
    expect(funktionSaknas.fel).toContain('jamfor_migrationer finns inte i prod');
    const servicenyckel = await kor(tomt, { env: { ...MILJO, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) } });
    expect(servicenyckel.kod).toBe(2);
    expect(servicenyckel.fel).toContain('servicenyckel');
  });
  it('rena filnamn (utan mapp) och {version,namn} går också; filer som inte är migrationer hoppas över', async () => {
    const f = fejk(() => svar(tomt));
    await kontrolleraMigrationer(['supabase/migrations/README.md', { version: '1', namn: 'a' }, '2_b.sql'], { env: MILJO, lasFil: INGEN_FIL, fetchFn: f, ut: () => {}, fel: () => {} });
    expect(JSON.parse(f.anrop[0].opt.body).p_filer).toEqual([{ version: '1', namn: 'a' }, { version: '2', namn: 'b' }]);
  });
});

describe('kontrolleraMigrationer, PR-läget (CI): varnar, blockerar aldrig', () => {
  const sokv = ['supabase/migrations/20261015090000_ny.sql', 'supabase/migrations/20261012100000_gammal.sql'];
  const kor = (svarsobjekt, extra = {}) => { const f = fangst(); return kontrolleraMigrationer(sokv, { lage: 'pr', env: MILJO, lasFil: INGEN_FIL, fetchFn: fejk(() => svar(svarsobjekt)), ut: f.ut, fel: f.fel, ...extra }).then((kod) => ({ kod, ut: f.utText(), fel: f.felText() })); };

  it('saknas och glapp blir ::warning::-rader på rätt fil, felkod 0', async () => {
    const r = await kor({ saknas: [{ version: '20261015090000', namn: 'ny' }], versionsglapp: [{ version: '20261012100000', namn: 'gammal', prod_version: '20261012092328' }], versionskrock: [], ok: 0 });
    expect(r.kod).toBe(0);
    expect(r.ut).toContain('::warning file=supabase/migrations/20261015090000_ny.sql,title=Migrationen finns inte i prod än::');
    expect(r.ut).toContain('apply_migration');
    expect(r.ut).toContain('::warning file=supabase/migrations/20261012100000_gammal.sql,title=Versionsglapp::');
    expect(r.ut).toContain('Döp om till 20261012092328_gammal.sql');
  });
  it('versionskrock varnar också, och allt OK ger bara sammanfattningen', async () => {
    const krock = await kor({ ...tomt, versionskrock: [{ version: '20261015090000', namn: 'ny', prod_namn: 'annan' }] });
    expect(krock.kod).toBe(0);
    expect(krock.ut).toContain('title=Versionskrock::');
    const ok = await kor({ ...tomt, ok: 2 });
    expect(ok.kod).toBe(0);
    expect(ok.ut).not.toContain('::warning');
    expect(ok.ut).toContain('OK 2');
  });
  it('kan inte kontrollera (saknade variabler, fork, nät) → varning och felkod 0 — blockerar aldrig', async () => {
    const r = await kor(tomt, { env: {} });
    expect(r.kod).toBe(0);
    expect(r.ut).toContain('::warning');
    expect(r.ut).toContain('Kunde inte kontrollera migrationerna mot prod');
    expect(r.fel).toBe('');
    const nat = await kor(tomt, { fetchFn: fejk(() => { throw new Error('boom'); }) });
    expect(nat.kod).toBe(0);
  });
});

describe('kopplingarna får inte tas bort', () => {
  const les = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it('vad-slapps kör kontrollen och avslutar med dess felkod', () => {
    const s = les('./vad-slapps.mjs');
    expect(s).toMatch(/from '\.\/migrationskontroll\.mjs'/);
    expect(s).toMatch(/process\.exit\(await kontrolleraMigrationer\(migrationer\)\)/);
  });
  it('kontrollen läser aldrig en servicenyckel och går bara mot den kontrollerade funktionen', () => {
    const s = les('./migrationskontroll.mjs');
    expect(s).not.toMatch(/process\.env\.SUPABASE_SERVICE|SERVICE_ROLE_KEY|SUPABASE_KEY\b/);
    expect(s).toMatch(/rest\/v1\/rpc\/jamfor_migrationer/);
    expect(s).not.toMatch(/rest\/v1\/(?!rpc\/jamfor_migrationer)/);
  });
  it('CI: körs på PR:er som rör migrationer, med variabler (inte hemligheter), och blockerar inte', () => {
    const y = les('../.github/workflows/migrationskontroll.yml');
    expect(y).toMatch(/pull_request:/);
    expect(y).toMatch(/supabase\/migrations\/\*\*/);
    expect(y).toMatch(/vars\.NEXT_PUBLIC_SUPABASE_URL/);
    expect(y).toMatch(/vars\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(y).not.toMatch(/secrets\./);
    expect(y).toMatch(/continue-on-error: true/);
    expect(y).toMatch(/migrationskontroll\.mjs --pr origin\/\$\{\{ github\.base_ref \}\}/);
  });
  it('migrationen för funktionen: security definer, tom search_path, bara anon/authenticated, tak på 500 och ingen listning', () => {
    const { readdirSync } = require_fs();
    const dir = new URL('../supabase/migrations/', import.meta.url);
    const fil = readdirSync(dir).filter((f) => /_jamfor_migrationer\.sql$/.test(f));
    expect(fil).toHaveLength(1);
    expect(fil[0]).toMatch(/^\d{14}_jamfor_migrationer\.sql$/);
    const sql = readFileSync(new URL(fil[0], dir), 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = ''/);
    expect(sql).toMatch(/revoke all on function public\.jamfor_migrationer\(jsonb\) from public;/);
    expect(sql).toMatch(/grant execute on function public\.jamfor_migrationer\(jsonb\) to anon, authenticated;/);
    expect(sql).toMatch(/v_antal > 500/);
    expect(MAX_PER_ANROP).toBe(500);
    expect(sql).not.toMatch(/returns setof|returns table/i); // svarar om det man skickar in, listar inget
  });
  it('CLAUDE.md har reglerna: apply_migration för schemaändringar, döp om direkt efter, och kontrollen mot prod', () => {
    const c = les('../CLAUDE.md');
    expect(c).toMatch(/schemaändringar körs alltid via `apply_migration`, aldrig direkt/);
    expect(c).toMatch(/Läsning \(`select`\) och datakorrigeringar som Martin uttryckligen godkänt får köras direkt, men ska dokumenteras i STATUS\.md med ångra-kommando/);
    expect(c).toMatch(/Direkt efter `apply_migration`: hämta versionen prod stämplade och döp om filen till den, i samma PR, innan PR:en går vidare/);
    expect(c).toMatch(/Saknas i prod` > 0[^\n]*felkod 1 och "Kör inte release"/);
    expect(c).toMatch(/Kunde inte kontrollera mot prod — kör inte release/);
  });
});

function require_fs() { return { readdirSync: readdirSyncImpl }; }
import { readdirSync as readdirSyncImpl } from 'node:fs';
