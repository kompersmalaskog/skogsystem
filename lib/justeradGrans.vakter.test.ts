import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PRICK_LAGER_SPEC } from './objektKarta';

// EN sanning för traktgränsen (Martin 2026-11-25): justerade kopior gäller överallt där servern/översikten läser traktgränsen — via vyn objekt_traktgrans, aldrig via objekt_geometri.
const rot = path.resolve(__dirname, '..');
const las = (p: string) => fs.readFileSync(path.join(rot, p), 'utf8');
const MIGRATION = 'supabase/migrations/20261125170026_traktgrans_justerad.sql';

describe('en sanning för traktgränsen — vakter', () => {
  it('objektlistan ("Här"), traktanalysen och skogsdatan läser traktgränsen BARA via vyn objekt_traktgrans', () => {
    for (const f of ['components/planering/ObjektLista.tsx', 'lib/traktAnalys/server.ts', 'lib/skogsdata/server.ts', 'lib/skogsdata/uttagServer.ts']) {
      const k = las(f);
      expect(k, f).toMatch(/from\(['"]objekt_traktgrans['"]\)/);
      expect(k, `${f} får inte läsa Vidas original direkt`).not.toMatch(/from\(['"]objekt_geometri['"]\)/);
    }
  });

  it('översiktslagret (objlista-*) ritar bara prickar, ringar och namn — ingen linje eller yta, alltså aldrig en traktgräns', () => {
    const typer = Object.values(PRICK_LAGER_SPEC).map((s) => s.type);
    expect(typer.length).toBeGreaterThan(0);
    for (const t of typer) expect(['circle', 'symbol']).toContain(t);
  });

  it('bara RPC:n satt_justerad_traktgrans skriver tabellen — ingen klientkod skriver den direkt', () => {
    const filer: string[] = [];
    const gå = (d: string) => { for (const n of fs.readdirSync(path.join(rot, d), { withFileTypes: true })) {
      if (['node_modules', '.next', '.git'].includes(n.name)) continue;
      const p = path.join(d, n.name);
      if (n.isDirectory()) gå(p); else if (/\.(ts|tsx)$/.test(n.name) && !/\.test\.tsx?$/.test(n.name)) filer.push(p);
    } };
    for (const d of ['app', 'lib', 'components']) gå(d);
    for (const f of filer) {
      const k = las(f);
      expect(k, `${f} skriver objekt_traktgrans_justerad direkt`).not.toMatch(/from\(['"]objekt_traktgrans_justerad['"]\)/);
      if (/satt_justerad_traktgrans/.test(k)) expect(['lib/justeradGransSynk.ts', 'lib/justeradGrans.ts']).toContain(f);   // den senare bara i kommentar
    }
  });

  it('planeringsvyn skickar den justerade gränsen bara som riktig admin, utanför testläge/maskinläge, aldrig medan hörn redigeras och bara när markörer, Vidas delar och origo hör till objektet', () => {
    const k = las('app/planering/page.tsx');
    const a = k.indexOf('synkaJusteradGrans(supabase');
    expect(a).toBeGreaterThan(0);
    const block = k.slice(k.lastIndexOf('useEffect(() => {', a), a + 400);
    expect(block).toMatch(/isAdminRiktig \|\| testlage \|\| maskinlage/);
    expect(block).toMatch(/markersLoaded \|\| markersObjektIdRef\.current !== oid \|\| traktGeoHamtadFor !== oid/);
    expect(block).toMatch(/hornEditActive \|\| redigeraGransIdn\.length > 0/);
    expect(block).toMatch(/byggJusteradeDelar\(markers as any\[\], traktdelDelar, svgToLatLon\)/);
    expect(block).toMatch(/if \(!bygg\.ok\) \{[^}]*return;/);   // fel origo → ingenting skrivs
    expect(block).toMatch(/raknaOmEfterGransandring\(\)/);
  });

  it('inga tillfälliga riggkrokar kvar', () => {
    expect(las('app/planering/page.tsx')).not.toMatch(/TEMP-RIGG/);
  });

  it('migrationen: vyn byter ut Vida-delar på nyckeln <TRDEL_ID|TRDEL_NR_K>:<delindex>, RPC:n är bara för admin och stängd för anon, tabellen har ingen skrivpolicy', () => {
    const m = las(MIGRATION);
    expect(m).toMatch(/create or replace view public\.objekt_traktgrans/);
    expect(m).toMatch(/left join public\.objekt_traktgrans_justerad/);
    expect(m).toMatch(/TRDEL_ID[\s\S]{0,200}TRDEL_NR_K/);               // samma nyckelregel som lib/traktGeometri.traktdelNyckel
    expect(m).toMatch(/if not public\.ar_admin\(\)/);
    expect(m).toMatch(/revoke all on function public\.satt_justerad_traktgrans\(uuid, jsonb\) from public, anon/);
    expect(m).toMatch(/revoke all on public\.objekt_traktgrans_justerad from anon, authenticated/);
    expect(m).not.toMatch(/for (insert|update|delete|all) to authenticated/i);
    expect(m).toMatch(/security_invoker = true/);
    // Samma nyckelregel som appen (partKey = nyckel + ':' + delindex).
    expect(las('lib/traktGeometri.ts')).toMatch(/partKey: tdKey \+ ':' \+ idx/);
    expect(las('lib/traktGeometri.ts')).toMatch(/txt\(p\.TRDEL_ID\) \|\| txt\(p\.TRDEL_NR_K\)/);
  });
});
