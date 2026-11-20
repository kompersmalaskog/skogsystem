// Källvakter för "Föraren från Opti" (2026-11-20, migrationerna 20261120140001–5). Regeln bor i databasen (supabase/tests/forare_fran_opti_lokal
// provar den mot riktig Postgres); det här är fallgroparna i APPEN som annars bryter den utan att något larmar.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const rot = join(__dirname, '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');
const migrationer = readdirSync(join(rot, 'supabase/migrations')).filter((f) => /^20261120140\d{3}_forare_fran_opti_/.test(f)).sort();
const alla = migrationer.map((f) => las(`supabase/migrations/${f}`)).join('\n');

describe('Föraren från Opti', () => {
  it('fem migrationsfiler i ordning (kolumner, slagning, omräkning, triggrar, historik)', () => {
    expect(migrationer.map((f) => f.replace(/^\d+_forare_fran_opti_/, ''))).toEqual(['1_kolumner.sql', '2_slagning.sql', '3_omrakning.sql', '4_triggers.sql', '5_historik.sql']);
  });

  it('enhetens nyckel forare_id RÖRS ALDRIG på kvittenserna: RLS, upserten och "vad har jag kvitterat" bygger på den', () => {
    // Triggern som sätter utford_av får inte skriva forare_id; bara besöksraden (som servern skriver) skrivs om.
    const kvittens = alla.slice(alla.indexOf('create or replace function public.kvittens_satt_utford'), alla.indexOf('create or replace function public.fakt_skift_rakna_om_forare'));
    expect(kvittens).toContain('new.utford_av');
    expect(kvittens).not.toMatch(/new\.forare_id\s*:=/);
    // Enheten läser sin egen kvittens på forare_id — ändras det till utford_av hittar den inte sina kvittenser och varje larm kommer tillbaka.
    for (const fil of ['lib/larm/kvittens.ts', 'lib/instruktioner/sett.ts']) {
      const k = las(fil);
      expect(k).toContain(".eq('forare_id', forareId)");
      expect(k).not.toContain('utford_av');
    }
  });

  it('en omräkning får inte skriva om beviset på NÄR: tidsutlösarna skyddas av omräkningsflaggan', () => {
    const tid = alla.slice(alla.indexOf('create or replace function public.korvy_kvittens_forare_satt_tid'), alla.indexOf('create or replace function public.forare_rakna_om'));
    expect(tid.match(/app\.forare_omrakning/g)?.length).toBe(2);
    expect(alla).toMatch(/set_config\('app\.forare_omrakning', 'off', true\)/);
  });

  it('strukna lass rörs inte, i triggern och i historiken', () => {
    expect(alla).toContain("if new.status = 'struket' then return new; end if;");
    expect(las('supabase/migrations/20261120140005_forare_fran_opti_5_historik.sql')).toContain("where status <> 'struket'");
    expect(las('supabase/migrations/20261120140003_forare_fran_opti_3_omrakning.sql')).toContain("status <> 'struket'");
  });

  it('klienten skriver aldrig medarbetare_id på ett befintligt lass (upserten sätter den bara vid INSERT) — annars krockar den med triggern', () => {
    const rpc = readdirSync(join(rot, 'supabase/migrations')).filter((f) => /_skotar_lass_/.test(f)).sort().map((f) => las(`supabase/migrations/${f}`)).join('\n');
    const upd = [...rpc.matchAll(/on conflict \(id\) do update set([\s\S]*?);/g)].map((m) => m[1]);
    expect(upd.length).toBeGreaterThan(0);
    for (const s of upd) expect(s).not.toContain('medarbetare_id');
  });

  it('appen läser aldrig originalet (registrerad_av) eller källan som om de vore föraren', () => {
    for (const fil of ['lib/skotarLass/server.ts', 'lib/skotarLass/lasServer.ts']) expect(las(fil)).not.toContain('registrerad_av');
  });

  it('funktionerna delas inte ut till anon/authenticated: de svarar på en maskin och en tid, inget annat', () => {
    expect(alla).toMatch(/revoke all on function public\.opti_forare[^;]*from public, anon, authenticated/);
    expect(alla).toMatch(/revoke all on function public\.forare_rakna_om[^;]*from public, anon, authenticated/);
  });
});
