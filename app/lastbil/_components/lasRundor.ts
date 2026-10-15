// Läser rundorna (flyttdag + flyttar + namn) för ett tidsfönster. EN väg in: Körningar, År och arket
// från Nu går alla hit, så en runda ser likadan ut överallt.
//
// Ett läsfel är ett fel för HELA läsningen (aldrig en halv lista som ser komplett ut): har vi inte fått
// alla rundor och alla flyttar kan summorna inte stämma, och vyn ska säga det i stället för att räkna.

import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { byggRundor, type Ben, type Runda, type RundaRad } from './rundor';
import { chunka, lasMaskinNamn, lasPlatsNamn, unika } from './lasNamn';

export type RundorSvar = { ok: true; rundor: Runda[] } | { ok: false };

const RUNDA_FALT = 'id, forare, starttid, sluttid, status, auto_avslutad_av, tillkorning_km, hem_km, hemresa_matt, total_km, matare_km, bransle_l';
const BEN_FALT = 'id, flyttdag_id, maskin_id, extern_maskin, fran_objekt_id, till_objekt_id, fran_plats_id, till_plats_id, flytt_km, mellankorning_km, tid_flytt_min, fakturerbar, flytt_typ, kund, sluttid, avbruten';
const CHUNK = 40;   // uuid:er i en in()-lista: håller adressen kort

/** Läser alla rundor som STARTAT i [fran, till) (UTC-ögonblick). */
export async function lasRundor(fran: string, till: string): Promise<RundorSvar> {
  try {
    const rader = await medAbortRetry(() => hamtaAlla<RundaRad>(
      () => supabase.from('flyttdag').select(RUNDA_FALT).gte('starttid', fran).lt('starttid', till) as any, 'id'));
    if (rader.error) throw rader.error;
    const ids = rader.data.map(r => r.id);

    // Flyttarna: exakt de som hör till rundorna (aldrig en tidsgissning), i omgångar.
    const benRader: any[] = [];
    for (const grupp of chunka(ids, CHUNK)) {
      const r = await medAbortRetry(() => supabase.from('maskin_flytt').select(BEN_FALT).in('flyttdag_id', grupp) as any);
      if (r.error) throw r.error;
      benRader.push(...(r.data ?? []));
    }
    const avslutade = benRader.filter(b => !b.avbruten && b.sluttid != null);

    const maskinNamn = await lasMaskinNamn();
    const objekt = await lasPlatsNamn('objekt', unika(avslutade.flatMap(b => [b.fran_objekt_id, b.till_objekt_id])));
    const platser = await lasPlatsNamn('flyttplats', unika(avslutade.flatMap(b => [b.fran_plats_id, b.till_plats_id])));
    const plats = (o: string | null, p: string | null) => (o && objekt.get(o)) || (p && platser.get(p)) || null;

    const benPerRunda = new Map<string, Ben[]>();
    for (const b of avslutade.sort((x, y) => String(x.starttid ?? '').localeCompare(String(y.starttid ?? '')))) {
      if (!b.flyttdag_id) continue;
      const lista = benPerRunda.get(b.flyttdag_id) ?? [];
      lista.push({
        id: b.id,
        maskin: b.maskin_id ? (maskinNamn.get(b.maskin_id) ?? b.maskin_id) : (b.extern_maskin || 'Okänd maskin'),
        fran: plats(b.fran_objekt_id, b.fran_plats_id),
        till: plats(b.till_objekt_id, b.till_plats_id),
        km: b.flytt_km != null ? Number(b.flytt_km) : null,
        min: b.tid_flytt_min != null ? Number(b.tid_flytt_min) : null,
        tomKm: b.mellankorning_km != null ? Number(b.mellankorning_km) : null,
        fakturerbar: !!b.fakturerbar,
        typ: b.flytt_typ ?? null,
        kund: b.kund ?? null,
      });
      benPerRunda.set(b.flyttdag_id, lista);
    }

    const tal = (v: unknown) => (v == null ? null : Number(v));
    const rundor = byggRundor(rader.data.map(r => ({
      ...r,
      tillkorning_km: tal(r.tillkorning_km), hem_km: tal(r.hem_km), total_km: tal(r.total_km),
      matare_km: tal(r.matare_km), bransle_l: tal(r.bransle_l),
    })), benPerRunda);
    return { ok: true, rundor };
  } catch (e) {
    console.error('[lastbil] rundor: läsfel', e);
    return { ok: false };
  }
}
