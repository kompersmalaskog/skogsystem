import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/lonesystem/server';
import { kravRoll, ADMIN_ROLLER } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * En gräns som inte är satt är en gräns ingen valt. Utan den slog routen i
 * Vercels förval och 504:ade utan att något syntes — samma tysta felklass
 * som en nollställd km-siffra. Listan är EN fråga på ~120 ms; 15 sekunder är
 * gott om marginal och ger ett synligt fel om något ändå drar iväg.
 */
export const maxDuration = 15;

/**
 * GET /api/faktura/oversikt
 *
 * Trakterna grupperade på tillstånd. EN databasfråga, inget fönster.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEN HÄR RUTTEN KÖR INTE RADBYGGAREN, OCH DET ÄR HELA POÄNGEN.
 *
 * Förut byggde den ett fullt underlag per trakt för att kunna visa ett
 * belopp: 362 ms styck, ~24 sekunder för de 64 som låg i 90-dagarsfönstret,
 * och 504 i produktion. Tio av de nitton frågorna per trakt var dessutom
 * samma globala register hämtade om och om igen.
 *
 * Nu gör faktura_oversikt() allt i en fråga på ~120 ms för alla 123
 * vo-nummer. Fönstret behövdes bara för att dölja kostnaden och är borta.
 *
 * INGET BELOPP. Det hade krävt hela prisformeln en gång till, i SQL — två
 * implementationer av samma pris är den felklass acord_flyttkostnad var.
 * Listan visar volym och timmar; beloppet räknas av radbyggaren när en trakt
 * öppnas, och kommer tillbaka hit den dag status finns och "klara" är en
 * handfull i stället för 64.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Tillstand = 'klar' | 'atgard' | 'ingen_gemensam_kund' | 'pagar' | 'ej_paborjad';

export type OversiktsRad = {
  vo_nummer: string;
  namn: string;
  bolag: string | null;
  fortnox_kundnr: number | null;
  avtalsform: 'ackord' | 'timpeng';
  tillstand: Tillstand;
  avrakningsdatum: string | null;
  objekt_antal: number;
  volym_m3fub: number;
  g15h: number;
  hinder: string | null;
  /** Skiljer det som inte går att prissätta från det som bara är ofyllt. */
  hinder_typ: 'kund' | 'traillertimmar' | 'kontraktsnr' | null;
  /** true = trakten finns inte i objekt; att spara ett nummer lägger upp den. */
  saknar_objektrad: boolean;
};

export async function GET() {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;

  try {
    const sb = serverSupabase();
    const t0 = Date.now();
    const { data, error } = await sb.rpc('faktura_oversikt');
    if (error) throw new Error('faktura_oversikt(): ' + error.message);

    const rader: OversiktsRad[] = (data || []).map((r: any) => ({
      vo_nummer: r.vo_nummer,
      namn: r.namn || r.vo_nummer,
      bolag: r.bolag,
      fortnox_kundnr: r.fortnox_kundnr == null ? null : Number(r.fortnox_kundnr),
      avtalsform: r.avtalsform,
      tillstand: r.tillstand,
      avrakningsdatum: r.avrakningsdatum,
      objekt_antal: Number(r.objekt_antal) || 0,
      volym_m3fub: Number(r.volym_m3fub) || 0,
      g15h: Number(r.g15h) || 0,
      hinder: r.hinder,
      hinder_typ: r.hinder_typ,
      saknar_objektrad: !!r.saknar_objektrad,
    }));

    const av = (t: Tillstand) => rader.filter(r => r.tillstand === t);
    // Traillertimmar och kontraktsnummer är OLIKA slags väntan. Den första
    // gör raden omöjlig att prissätta; den andra är ett ofyllt fält. Blandas
    // de går de fem som faktiskt stoppar upp i de fyrtiofyra.
    const atgard = av('atgard');

    return NextResponse.json({
      ok: true,
      // Tiden går med i svaret. Blir listan långsam igen ska det synas i
      // samma andetag som listan, inte upptäckas av att någon väntar.
      ms: Date.now() - t0,
      antal: rader.length,
      grupper: {
        klara: av('klar'),
        gar_inte_att_prissatta: atgard.filter(r => r.hinder_typ === 'traillertimmar'),
        saknar_kontraktsnr: atgard.filter(r => r.hinder_typ === 'kontraktsnr'),
        ingen_gemensam_kund: av('ingen_gemensam_kund'),
        pagar: av('pagar'),
        ej_paborjad: av('ej_paborjad'),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e?.message || String(e) }, { status: 500 });
  }
}
