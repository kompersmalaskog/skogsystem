#!/usr/bin/env node
// Finns migrationsfilerna i prod, med samma version OCH samma namn? En kontroll, två anropare:
//   - scripts/vad-slapps.mjs (före release): "Saknas i prod" eller versionskrock → felkod 1 och "Kör inte release"; går kontrollen inte att köra → felkod 2.
//   - CI (.github/workflows/migrationskontroll.yml, `node scripts/migrationskontroll.mjs --pr origin/main`): varnar med ::warning::, blockerar aldrig.
//
// Läsningen går via SQL-funktionen public.jamfor_migrationer(jsonb) (migration …_jamfor_migrationer.sql): security definer, anroparen skickar in sina
// egna (version, namn) och får bara svar om just dem — inget går att räkna upp. Anropas med ANON-nyckeln (den som redan ligger i webbläsaren);
// servicenyckeln används aldrig och en nyckel som ser ut som en servicenyckel vägras.
//
// Innehållet jämförs inte (BEGIN/COMMIT, extra DROP IF EXISTS och kommentarer ger falsklarm); bara version + namn.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MIGRATIONSMAPP = 'supabase/migrations/';
export const MAX_PER_ANROP = 500; // samma tak som i funktionen
export const TEXT_KAN_INTE_KONTROLLERA = 'Kunde inte kontrollera mot prod — kör inte release';
export const TEXT_KOR_INTE_RELEASE = 'Kör inte release';

export class KontrollFel extends Error {}

/** `supabase/migrations/20261014125025_starta_jobb.sql` → { version: '20261014125025', namn: 'starta_jobb' }; annat → null. */
export function delaFilnamn(sokvag) {
  const m = /(?:^|\/)(\d+)_([^/]+)\.sql$/.exec(sokvag);
  return m ? { version: m[1], namn: m[2] } : null;
}

function parsaEnv(text) {
  const ut = {};
  for (const rad of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(rad);
    if (!m || m[1].startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    ut[m[1]] = v;
  }
  return ut;
}

/** Är nyckeln en servicenyckel (JWT med role service_role, eller en sb_secret_-nyckel)? Då vägrar vi: kontrollen ska klara sig med anon. */
export function arServicenyckel(nyckel) {
  if (/^sb_secret_/i.test(nyckel)) return true;
  const delar = nyckel.split('.');
  if (delar.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(delar[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload && payload.role === 'service_role';
  } catch {
    return false;
  }
}

/**
 * URL och anon-nyckel: processens miljö först, sedan `.env.local`. Bara NEXT_PUBLIC_SUPABASE_URL och NEXT_PUBLIC_SUPABASE_ANON_KEY läses
 * (aldrig SUPABASE_SERVICE_*). Saknas något, eller är nyckeln en servicenyckel → KontrollFel.
 */
export function lasMiljo(env = process.env, lasFil = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null)) {
  const fil = lasFil('.env.local');
  const lokal = fil ? parsaEnv(fil) : {};
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || lokal.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || lokal.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) {
    throw new KontrollFel('NEXT_PUBLIC_SUPABASE_URL och NEXT_PUBLIC_SUPABASE_ANON_KEY saknas (varken i miljön eller i .env.local)');
  }
  if (arServicenyckel(key)) {
    throw new KontrollFel('NEXT_PUBLIC_SUPABASE_ANON_KEY ser ut som en servicenyckel — kontrollen ska köras med anon/publishable-nyckeln');
  }
  return { url, key };
}

const tom = () => ({ saknas: [], versionsglapp: [], versionskrock: [], ok: 0 });

/**
 * Jämför [{version, namn}] mot prod via public.jamfor_migrationer. Fler än 500 delas i omgångar. Kastar KontrollFel om svaret inte går att lita på
 * (nätfel, tidsgräns, HTTP-fel, funktionen saknas, oväntat svar) — aldrig ett tomt "OK" i det läget.
 */
export async function jamforMotProd(filer, { url, key, fetchFn = globalThis.fetch, timeoutMs = 15000 }) {
  const samlat = tom();
  if (filer.length === 0) return samlat;
  if (typeof fetchFn !== 'function') throw new KontrollFel('fetch finns inte i den här Node-versionen (kräver Node 18+)');
  const bas = url.replace(/\/+$/, '');
  for (let i = 0; i < filer.length; i += MAX_PER_ANROP) {
    const del = filer.slice(i, i + MAX_PER_ANROP);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let svar;
    try {
      svar = await fetchFn(`${bas}/rest/v1/rpc/jamfor_migrationer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ p_filer: del }),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new KontrollFel(e && e.name === 'AbortError' ? `ingen kontakt med prod inom ${Math.round(timeoutMs / 1000)} s` : `ingen kontakt med prod (${e && e.message ? e.message : e})`);
    } finally {
      clearTimeout(timer);
    }
    if (!svar.ok) {
      let detalj = '';
      try { detalj = (await svar.text()).slice(0, 200); } catch { /* ignoreras */ }
      if (svar.status === 404 || /PGRST202/.test(detalj)) {
        throw new KontrollFel('funktionen jamfor_migrationer finns inte i prod (migrationen är inte körd)');
      }
      throw new KontrollFel(`prod svarade HTTP ${svar.status}${detalj ? `: ${detalj}` : ''}`);
    }
    let j;
    try { j = await svar.json(); } catch { throw new KontrollFel('prod gav ett svar som inte är JSON'); }
    if (!j || !Array.isArray(j.saknas) || !Array.isArray(j.versionsglapp) || !Array.isArray(j.versionskrock) || typeof j.ok !== 'number') {
      throw new KontrollFel('oväntat svar från jamfor_migrationer');
    }
    samlat.saknas.push(...j.saknas);
    samlat.versionsglapp.push(...j.versionsglapp);
    samlat.versionskrock.push(...j.versionskrock);
    samlat.ok += j.ok;
  }
  return samlat;
}

/** Utskriften i releaseläget: "Saknas i prod: X", "Versionsglapp: Y", "OK: Z" (+ en rad om versionskrock bara när det finns några). */
export function formatera(res) {
  const rader = ['', '=== MIGRATIONER MOT PROD (schema_migrations, version + namn) ===', ''];
  rader.push(`  Saknas i prod: ${res.saknas.length}`);
  for (const m of res.saknas) rader.push(`    ${m.version}_${m.namn}`);
  rader.push(`  Versionsglapp: ${res.versionsglapp.length}`);
  for (const m of res.versionsglapp) rader.push(`    ${m.version}_${m.namn}  →  prod har ${m.prod_version}  (döp om filen till ${m.prod_version}_${m.namn}.sql)`);
  if (res.versionskrock.length > 0) {
    rader.push(`  Versionskrock: ${res.versionskrock.length}`);
    for (const m of res.versionskrock) rader.push(`    ${m.version}_${m.namn}  ↔  prod har den versionen som "${m.prod_namn}"`);
  }
  rader.push(`  OK: ${res.ok}`);
  return rader.join('\n');
}

/** 1 om något saknas eller versionen krockar med en annan migration; annars 0 (versionsglapp varnar bara). */
export function utgangskod(res) {
  return res.saknas.length + res.versionskrock.length > 0 ? 1 : 0;
}

function ghVarning(titel, fil, text) {
  const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return `::warning file=${fil},title=${esc(titel)}::${esc(text)}`;
}

/**
 * Kör kontrollen för filerna (sökvägar eller {version,namn}) och skriver resultatet. Returnerar utgångskod.
 *   lage 'release' (vad-slapps): 0 = OK, 1 = saknas/krock ("Kör inte release" på stderr), 2 = kunde inte kontrollera.
 *   lage 'pr' (CI): varnar med ::warning::, returnerar ALLTID 0.
 */
export async function kontrolleraMigrationer(sokvagar, { lage = 'release', env = process.env, lasFil, fetchFn, ut = console.log, fel = console.error } = {}) {
  const filer = [];
  const sokvagFor = new Map();
  for (const s of sokvagar) {
    const d = typeof s === 'string' ? delaFilnamn(s) : s;
    if (!d) continue;
    filer.push(d);
    if (typeof s === 'string') sokvagFor.set(`${d.version}_${d.namn}`, s);
  }
  let res;
  try {
    const miljo = lasMiljo(env, lasFil);
    res = await jamforMotProd(filer, { ...miljo, fetchFn });
  } catch (e) {
    if (!(e instanceof KontrollFel)) throw e;
    if (lage === 'pr') {
      ut(ghVarning('Kunde inte kontrollera migrationerna mot prod', MIGRATIONSMAPP, `${e.message}. Kontrollen varnar bara och blockerar inte.`));
    } else {
      fel(`\n${TEXT_KAN_INTE_KONTROLLERA}`);
      fel(`  Orsak: ${e.message}`);
    }
    return lage === 'pr' ? 0 : 2;
  }

  if (lage === 'pr') {
    const sok = (m) => sokvagFor.get(`${m.version}_${m.namn}`) || MIGRATIONSMAPP;
    for (const m of res.saknas) {
      ut(ghVarning('Migrationen finns inte i prod än', sok(m),
        `${m.version}_${m.namn} finns inte i prod. Kör den med apply_migration, hämta versionen prod stämplar och döp om filen till den i den här PR:en (CLAUDE.md, Migrationer).`));
    }
    for (const m of res.versionsglapp) {
      ut(ghVarning('Versionsglapp', sok(m), `Prod har ${m.namn} som ${m.prod_version}, men filen heter ${m.version}. Döp om till ${m.prod_version}_${m.namn}.sql (bara filnamnet; git ska visa R100).`));
    }
    for (const m of res.versionskrock) {
      ut(ghVarning('Versionskrock', sok(m), `Versionen ${m.version} finns i prod som "${m.prod_namn}", inte som "${m.namn}". Två migrationer vill ha samma version.`));
    }
    ut(`Migrationer mot prod: saknas ${res.saknas.length}, versionsglapp ${res.versionsglapp.length}, versionskrock ${res.versionskrock.length}, OK ${res.ok}.`);
    return 0;
  }

  ut(formatera(res));
  const kod = utgangskod(res);
  if (kod !== 0) fel(`\n${TEXT_KOR_INTE_RELEASE}: ${res.saknas.length} migration(er) saknas i prod${res.versionskrock.length ? ` och ${res.versionskrock.length} krockar med en annan migration` : ''}. Kör dem med apply_migration först.`);
  else if (res.versionsglapp.length) ut('\n  Versionsglapp blockerar inte, men döp om filerna till prods version (CLAUDE.md, Migrationer).');
  return kod;
}

// ── CLI: node scripts/migrationskontroll.mjs --pr origin/main  (CI: PR:ens NYA migrationer; varnar, felkod 0)
async function cli() {
  const arg = process.argv.slice(2);
  const i = arg.indexOf('--pr');
  if (i === -1) {
    console.error('Användning: node scripts/migrationskontroll.mjs --pr <bas, t.ex. origin/main>');
    process.exit(64);
  }
  const bas = arg[i + 1] || 'origin/main';
  let filer = [];
  try {
    filer = execSync(`git diff --name-only --diff-filter=AR -M ${bas}...HEAD -- ${MIGRATIONSMAPP}`, { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (e) {
    console.log(ghVarning('Kunde inte läsa PR:ens migrationer', MIGRATIONSMAPP, `git diff mot ${bas} misslyckades: ${e.message.split('\n')[0]}`));
    process.exit(0);
  }
  if (filer.length === 0) {
    console.log('Inga nya migrationer i den här PR:en.');
    process.exit(0);
  }
  const rader = [];
  const ut = (s) => { console.log(s); rader.push(s); };
  const kod = await kontrolleraMigrationer(filer, { lage: 'pr', ut });
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Migrationer mot prod\n\n${filer.map((f) => `- \`${f}\``).join('\n')}\n\n${rader.filter((r) => !r.startsWith('::')).join('\n')}\n`); } catch { /* sammanfattningen är bara en bonus */ }
  }
  process.exit(kod);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
