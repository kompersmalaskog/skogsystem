// Statusrevisionen för 'oplanerad' + flödet "Klar för maskin": en ny trakt är oplanerad (syns, spärrar aldrig), Klar för maskin gör den planerad
// och nästa jobb för den valda maskinen. Provar de RIKTIGA gruppfunktionerna (planeringsvyns lista, förarlistan, kandidater, arbetsobjekt, sammanslagning).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { grupperaObjekt, statusGrupp } from './objektVal';
import { grupperaForareObjekt, type ForareObjekt } from './objektlista';
import { KANDIDAT_STATUS } from './objektKandidater';
import { arAktivStatus } from './arbetsobjekt';
import { arUnderPlanering, oplaneradRadText } from './klarTrakt';

const las = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('oplanerad är en riktig status överallt där status läses', () => {
  it('planeringsvyns lista: Oplanerade är en egen grupp (inte Planerade), planerad är Planerade', () => {
    expect(statusGrupp('oplanerad')).toBe('oplanerade');
    expect(statusGrupp('planerad')).toBe('planerade');
    expect(statusGrupp(null)).toBe('oplanerade');
    expect(statusGrupp('pagaende')).toBe('pagar');
  });
  it('arbetsrapport/planera: en oplanerad trakt är en aktiv arbetstrakt (planeringstid läggs INNAN den är klar för maskin)', () => {
    expect(arAktivStatus('oplanerad')).toBe(true);
    expect(arAktivStatus('avslutat')).toBe(false);
  });
  it('maskindatorns positionsval: en maskin i en oklarmarkerad trakt matchas ändå', () => {
    expect(KANDIDAT_STATUS).toContain('oplanerad');
  });
  it('under planering = oplanerad eller planerad', () => {
    expect(arUnderPlanering('oplanerad')).toBe(true);
  });
});

describe('förarlistan: oplanerade syns längre ner, spärras aldrig, nästa jobb är alltid ett planerat', () => {
  const pos = { lat: 57, lng: 15 };
  const objekt: ForareObjekt[] = [
    { id: 'op1', namn: 'Oplanerad nära', typ: 'gallring', status: 'oplanerad', lat: 57.01, lng: 15 },
    { id: 'pl1', namn: 'Planerad långt', typ: 'gallring', status: 'planerad', lat: 58, lng: 15 },
    { id: 'op2', namn: 'Oplanerad långt', typ: 'gallring', status: 'oplanerad', lat: 59, lng: 15 },
    { id: 'pag', namn: 'Pågår', typ: 'gallring', status: 'pagaende', lat: 57.5, lng: 15 },
  ];
  it('oplanerade är en egen grupp efter planerade — även när de ligger närmast', () => {
    const g = grupperaForareObjekt({ objekt, pos });
    expect(g.pagaende.map((o) => o.id)).toEqual(['pag']);
    expect(g.planerade.map((o) => o.id)).toEqual(['pl1']);
    expect(g.oplanerade.map((o) => o.id)).toEqual(['op1', 'op2']);
    expect(g.har).toEqual([]);
  });
  it('står maskinen inne i en oplanerad trakt hamnar den under Här (positionen vinner) — ingen spärr', () => {
    const med: ForareObjekt[] = [{ id: 'op', namn: 'Här', typ: 'gallring', status: 'oplanerad', lat: 57, lng: 15, geometri: { type: 'FeatureCollection', features: [{ properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [[[14.99, 56.99], [15.01, 56.99], [15.01, 57.01], [14.99, 57.01], [14.99, 56.99]]] } } as any] } }];
    const g = grupperaForareObjekt({ objekt: med, pos });
    expect(g.har.map((o) => o.id)).toEqual(['op']);
  });
  it('listraden: "N kvar" när kortet beräknat det, annars ärligt "Inte klarplanerad"', () => {
    expect(oplaneradRadText(3)).toBe('3 kvar');
    expect(oplaneradRadText(undefined)).toBe('Inte klarplanerad');
  });
});

describe('FLÖDE: Klar för maskin → under Planerade, nästa jobb för den valda skotaren', () => {
  const ny = (o: Partial<ForareObjekt> & { id: string }): ForareObjekt => ({ namn: o.id, typ: 'gallring', lat: 57.1, lng: 15, ...o });
  it('före: oplanerad (Oplanerade). efter: planerad (Planerade) och, tilldelad skotaren, överst bland planerade', () => {
    const fore = [ny({ id: 'skalviken', status: 'oplanerad', skotare_maskin_id: 'A110148' }), ny({ id: 'annan', status: 'planerad', lat: 57.05 })];
    expect(grupperaObjekt(fore as any).oplanerade.map((o) => o.id)).toEqual(['skalviken']);
    expect(grupperaObjekt(fore as any).planerade.map((o) => o.id)).toEqual(['annan']);

    // Klar för maskin: status → planerad (+ klar_skickad_timestamp)
    const efter = fore.map((o) => (o.id === 'skalviken' ? { ...o, status: 'planerad' } : o));
    expect(grupperaObjekt(efter as any).planerade.map((o) => o.id).sort()).toEqual(['annan', 'skalviken']);
    expect(grupperaObjekt(efter as any).oplanerade).toEqual([]);

    // Förarens lista på skotaren A110148: det tilldelade jobbet står först, trots att det andra ligger närmare
    const g = grupperaForareObjekt({ objekt: efter, pos: { lat: 57, lng: 15 }, maskinId: 'A110148' });
    expect(g.planerade.map((o) => o.id)).toEqual(['skalviken', 'annan']);
  });
  it('en annan skotare ser det inte som sitt nästa jobb', () => {
    const efter = [ny({ id: 'skalviken', status: 'planerad', skotare_maskin_id: 'A110148' }), ny({ id: 'annan', status: 'planerad', lat: 57.05 })];
    const g = grupperaForareObjekt({ objekt: efter, pos: { lat: 57, lng: 15 }, maskinId: 'A030353' });
    expect(g.planerade[0].id).toBe('annan');
  });
});

describe('källvakter: alla ställen som läser status är med', () => {
  it('importen sätter oplanerad på NYA trakter (inte vid omimport) och faller tillbaka före migrationen', () => {
    const imp = las('../app/api/import-trakt/route.ts');
    expect(imp).toContain("{ ...data, status: 'oplanerad' }");
    expect(imp).toContain("r.error?.code === '23514'");
    // omimport (UPDATE) rör aldrig status: människan äger den
    expect(imp).toContain('status sätts uttryckligen till \'oplanerad\' vid INSERT');
  });
  it('Starta körning går att trycka på en oplanerad trakt (förarna spärras aldrig)', () => {
    expect(las('../app/planering/page.tsx')).toContain("isForare && (valtObjekt?.status === 'planerad' || valtObjekt?.status === 'oplanerad')");
  });
  it('arbetsrapport och planera räknar oplanerad som aktiv; maskinflytt kan flytta dit; sammanslagning av ett påbörjat jobb gäller även en oplanerad Vida-trakt', () => {
    expect(las('./arbetsobjekt.ts')).toContain('"oplanerad", "planerad", "pagaende", "skordning", "skotning"');
    expect(las('../app/maskinflytt/MaskinflyttClient.tsx')).toContain("s === 'pagaende' || s === 'planerad' || s === 'oplanerad'");
    expect(las('./slaIhopJobb.ts')).toContain("till.status === 'planerad' || till.status === 'oplanerad'");
  });
  it('importen av produktionsfiler flippar (o)planerad → pagaende (loggläge som förut)', () => {
    expect(las('../skogsmaskin_import_version_6.py')).toContain("rad.get('status') not in ('planerad', 'oplanerad')");
  });
  it('helikopter-v2 och översikt-v2 tappar inte nya trakter', () => {
    expect(las('../app/helikopter-v2/page.tsx')).toContain("o.status === 'oplanerad' || o.status === 'planerad' || o.status === 'pagaende'");
    expect(las('../app/oversikt-v2/page.tsx')).toContain("if (o.status === 'oplanerad') {");
  });
});

describe('migrationen 20261017072819 (körd i prod 2026-10-17)', () => {
  const sql = las('../supabase/migrations/20261017072819_klar_med_trakten_kolumner.sql');
  it('CHECK får oplanerad, default blir oplanerad', () => {
    expect(sql).toContain("check (status = any (array['oplanerad'::text, 'planerad'::text, 'pagaende'::text, 'skotning'::text, 'avslutat'::text]))");
    expect(sql).toContain("alter column status set default 'oplanerad'");
  });
  it('planerad utan klar_skickad_timestamp → oplanerad; pågående/avslutade rörs inte', () => {
    expect(sql).toContain("set status = 'oplanerad'\n where status = 'planerad'\n   and klar_skickad_timestamp is null;");
    expect(sql).not.toMatch(/set status = 'oplanerad'[^;]*pagaende/);
  });
  it('band: default bort, false → null bara på oplanerade/planerade', () => {
    expect(sql).toContain('alter column skordare_band drop default');
    expect(sql).toContain("update public.objekt set skordare_band = null where skordare_band = false and status in ('oplanerad', 'planerad');");
    expect(sql).toContain("update public.objekt set skotare_band  = null where skotare_band  = false and status in ('oplanerad', 'planerad');");
  });
  it('alla nya kolumner och tabellen finns, idempotent', () => {
    for (const k of ['prognos_godkand_av', 'prognos_godkand_at', 'prognos_godkand_underlag', 'medelstam', 'har_du_svar', 'ved_detaljer', 'klar_kvar_antal', 'klar_kvar_beraknad_at']) expect(sql, k).toContain(`add column if not exists ${k} `);
    expect(sql).toContain('create table if not exists public.klar_trakt_paminnelse');
    expect(sql).toContain('enable row level security');
    expect(sql.match(/add column(?! if not exists)/g)).toBeNull();
  });
  it('körs i EN transaktion', () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
  });
});
