'use client';

// Skotarlänken: bakgrunden Ritad. Samma ritning som appens Ritad (lib/hooks/useRitadKarta: grunden, skogsbilden, blött, brant, vägar, diken),
// men datan hämtas via länken (GET /api/skotare/<token>/ritad?del=…) där servern räknar området ur trakten.
//   • Inget hämtas förrän Ritad väljs. Sedan en gång per sida.
//   • Allt sparas i enheten (lib/ritadKarta/reserv): utan täckning i hytten ritas det som hämtades senast.
//   • Ritads lager läggs UNDER allt länken ritar (traktgräns, spår, högar, markeringar).

import { useEffect, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { laggTillGrund, sattSkog, tolkaMark, ritadStatusText, type RitadStatus } from '@/lib/hooks/useRitadKarta';
import { byggRitat, type Ritat } from '@/lib/ritadKarta/bygg';
import { RITAD_LAGER, ritadSynlighet } from '@/lib/ritadKarta/lager';
import { medReserv } from '@/lib/ritadKarta/reserv';
import { arVagFC, type VagFC } from '@/lib/ritadKarta/vagar';
import { arDikeFC, type DikeFC } from '@/lib/ritadKarta/diken';
import { kartBasPaint } from '@/lib/kartBas';
import type { Rutnat } from '@/lib/ritadKarta/skog';
import type { OmradesKalla } from '@/lib/ritadKarta/omrade';

/** Lagren som ligger under Ritad (bakgrunden och de två fotolagren). */
export const UNDER_RITAD = ['bg', 'bas-foto', 'bas-karta'];

/** Flyttar Ritads lager så att de ligger direkt ovanpå bakgrundslagren och under allt annat. Ordningen inom Ritad behålls. */
export function flyttaRitadUnder(map: Pick<maplibregl.Map, 'getStyle' | 'getLayer' | 'moveLayer'>): void {
  const ritad = new Set(RITAD_LAGER);
  const forsta = (map.getStyle()?.layers ?? []).find((l) => !ritad.has(l.id) && !UNDER_RITAD.includes(l.id));
  if (!forsta) return;
  for (const id of RITAD_LAGER) if (map.getLayer(id)) map.moveLayer(id, forsta.id);
}

type Hamtat = { ritat: Ritat; vagar: VagFC | null; diken: DikeFC | null; ar: number | null; kalla: OmradesKalla; saknas: string[] };

async function hamtaDel<T>(token: string, del: string, ok: (v: unknown) => boolean = () => true): Promise<{ varde: T | null; fel: string | null }> {
  let fel: string | null = null;
  const r = await medReserv<T>(`skotare/${token}/${del}`, async () => {
    const svar = await fetch(`/api/skotare/${token}/ritad?del=${del}`);
    const j = await svar.json().catch(() => null);
    if (!svar.ok || !j || !ok(j)) { fel = typeof j?.error === 'string' ? j.error : null; return { ok: false }; }
    return { ok: true, varde: j as T };
  });
  return { varde: r?.varde ?? null, fel };
}

async function hamtaAllt(token: string): Promise<Hamtat | { fel: string }> {
  const [laser, mark, vagar, diken, stammar] = await Promise.all([
    hamtaDel<Rutnat>(token, 'laser'),
    hamtaDel<any>(token, 'mark'),
    hamtaDel<VagFC>(token, 'vagar', arVagFC),
    hamtaDel<DikeFC>(token, 'diken', arDikeFC),
    hamtaDel<{ kalla: OmradesKalla; punkter: [number, number][] }>(token, 'stammar', (v: any) => Array.isArray(v?.punkter)),
  ]);
  if (!laser.varde) return { fel: laser.fel ?? 'Kunde inte hämta laserdatan' };
  const m = await tolkaMark(mark.varde);
  const punkter = (stammar.varde?.punkter ?? []).map(([lat, lng]) => ({ lat, lng }));
  const saknas = [...m.saknas, ...(vagar.varde ? [] : ['Trafikverkets vägar']), ...(diken.varde ? [] : ['diken'])];
  return { ritat: byggRitat(laser.varde, punkter, m.rutnat, m.skugga), vagar: vagar.varde, diken: diken.varde, ar: laser.varde.ar ?? null, kalla: stammar.varde?.kalla ?? 'vida', saknas };
}

export function useRitadSkotare({ map, klar, vald, token }: { map: maplibregl.Map | null; klar: boolean; vald: boolean; token: string }): { status: RitadStatus; text: string } {
  const [svar, setSvar] = useState<Hamtat | { fel: string } | null>(null);
  const [grund, setGrund] = useState(false);
  const startad = useRef(false);
  const ritad = useRef(false);

  // Grunden (bakgrund, terrängskuggning, vatten, vägar, hus) och hämtningen: först när Ritad väljs.
  useEffect(() => {
    if (!map || !klar || !vald) return;
    if (!grund) {
      try { laggTillGrund(map); flyttaRitadUnder(map); setGrund(true); } catch (e) { console.warn('[skotare/ritad] grunden', e); }
    }
    if (startad.current) return;
    startad.current = true;
    hamtaAllt(token).then(setSvar).catch(() => setSvar({ fel: 'Kunde inte hämta laserdatan' }));
  }, [map, klar, vald, grund, token]);

  // Skogen på kartan, en gång.
  useEffect(() => {
    if (!map || !grund || !svar || 'fel' in svar || ritad.current) return;
    try { sattSkog(map, svar.ritat, svar.vagar, svar.diken, kartBasPaint('ritad')); flyttaRitadUnder(map); ritad.current = true; } catch (e) { console.warn('[skotare/ritad] skogen', e); }
  }, [map, grund, svar]);

  // Synligheten: Ritad på → Ritads lager syns och fotolagren göms (de ligger ändå under Ritads täckande bakgrund).
  useEffect(() => {
    if (!map || !grund) return;
    const syn = ritadSynlighet({ vald });
    for (const id of RITAD_LAGER) { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', syn[id] ? 'visible' : 'none'); } catch { /* */ } }
  }, [map, grund, vald, svar]);

  const status: RitadStatus = !vald ? { typ: 'av' } : !svar ? { typ: 'laser' } : 'fel' in svar ? { typ: 'fel', text: svar.fel } : { typ: 'klar', ar: svar.ar, kalla: svar.kalla, saknas: svar.saknas };
  const text = status.typ === 'klar' && status.kalla === 'punkt' ? ritadStatusText(status).replace('1 km runt objektet (ingen traktgräns)', '1 km runt trakten') : ritadStatusText(status);
  return { status, text };
}
