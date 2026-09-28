import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/lonesystem/server';
import { kravRoll, ADMIN_ROLLER } from '@/lib/auth/server';
import { hamtaVoUnderlag } from '@/lib/faktura/hamtaUnderlag';
import { byggRader, garAttSkicka } from '@/lib/faktura/radbyggare';
import { arSlutavraknad } from '@/lib/objekt/avrakning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/faktura/oversikt?dagar=90&max=25
 *
 * Trakterna grupperade på TILLSTÅND, med summan på dem som är klara.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VARFÖR ETT FÖNSTER, OCH VARFÖR DET SYNS
 *
 * 94 vo-nummer är slutavräknade. Att bygga underlag för alla vid varje
 * sidladdning är ~1 400 frågor mot databasen, och de flesta är historik som
 * Martin redan fakturerat för hand — appen kan inte veta vilka, eftersom
 * faktura_underlag är tom och de gamla fakturorna inte är kopplade.
 *
 * Därför byggs bara de som avräknats inom fönstret, och vyn SKRIVER UT hur
 * många som ligger utanför. En avgränsning som inte syns är en lögn om vad
 * listan innehåller.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type OversiktsRad = {
  vo_nummer: string;
  namn: string;
  bolag: string | null;
  kund: number | null;
  avtalsform: 'ackord' | 'timpeng';
  avrakningsdatum: string | null;
  /** m³fub för ackord, timmar för timpeng. Enheten följer med. */
  mangd: number;
  mangd_enhet: 'm3fub' | 'h';
  summa: number;
  /** Första hindret, för raderna som behöver åtgärd. */
  orsak?: string;
};

export async function GET(req: NextRequest) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;

  try {
    const sp = new URL(req.url).searchParams;
    const dagar = Math.min(3650, Math.max(1, Number(sp.get('dagar')) || 90));
    const max = Math.min(60, Math.max(1, Number(sp.get('max')) || 25));

    const sb = serverSupabase();
    const { data: objekt, error } = await sb.from('dim_objekt')
      .select('objekt_id, object_name, vo_nummer, bolag, timpeng, huvudtyp, exkludera, '
        + 'skordning_avslutad, skotning_avslutad, egen_skotning')
      .not('vo_nummer', 'is', null)
      .order('vo_nummer');
    if (error) throw new Error('Kunde inte läsa dim_objekt: ' + error.message);

    // Gruppera på VO. Ett VO är klart först när ALLA dess objektrader är det
    // — Jätsbygd har två, och en av dem saknar skördningsdatum.
    type Grupp = { vo: string; namn: string; bolag: string | null; timpeng: boolean;
                   klar: boolean; nagonKlar: boolean; avr: string | null };
    const per = new Map<string, Grupp>();
    for (const o of (objekt || []) as any[]) {
      if (o.exkludera) continue;
      const g = per.get(o.vo_nummer) || {
        vo: o.vo_nummer, namn: o.object_name || o.vo_nummer, bolag: o.bolag,
        timpeng: !!o.timpeng || (o.huvudtyp || '') === 'Gallring',
        klar: true, nagonKlar: false, avr: null,
      };
      const klar = arSlutavraknad(o as any);
      g.klar = g.klar && klar;
      g.nagonKlar = g.nagonKlar || klar;
      const d = o.skotning_avslutad || o.skordning_avslutad || null;
      if (d && (!g.avr || d > g.avr)) g.avr = d;
      if (o.bolag && !g.bolag) g.bolag = o.bolag;
      per.set(o.vo_nummer, g);
    }
    const alla = Array.from(per.values());

    const grans = new Date(Date.now() - dagar * 86400000).toISOString().slice(0, 10);
    const klaraAlla = alla.filter(g => g.klar).sort((a, b) => (b.avr || '').localeCompare(a.avr || ''));
    const iFonster = klaraAlla.filter(g => (g.avr || '') >= grans).slice(0, max);

    const klara: OversiktsRad[] = [];
    const atgard: OversiktsRad[] = [];

    for (const g of iFonster) {
      try {
        const { underlag } = await hamtaVoUnderlag(sb as any, g.vo);
        const rader = byggRader(underlag);
        const kan = garAttSkicka(underlag, rader);
        const medPris = rader.filter(r => (r.a_pris ?? r.a_pris_beraknat) != null && r.antal != null);
        const timmar = underlag.maskiner.reduce((s, m) => s + m.g15h, 0);
        const rad: OversiktsRad = {
          vo_nummer: g.vo, namn: underlag.objektnamn, bolag: underlag.bolag,
          kund: underlag.fortnox_kundnr,
          avtalsform: underlag.timpeng ? 'timpeng' : 'ackord',
          avrakningsdatum: underlag.avrakningsdatum,
          mangd: underlag.timpeng ? timmar : underlag.volymM3fub,
          mangd_enhet: underlag.timpeng ? 'h' : 'm3fub',
          summa: medPris.reduce((s, r) => s + (r.a_pris ?? r.a_pris_beraknat)! * r.antal!, 0),
        };
        if (kan.ok) klara.push(rad);
        else atgard.push({ ...rad, orsak: kan.hinder[0] });
      } catch (e: any) {
        atgard.push({
          vo_nummer: g.vo, namn: g.namn, bolag: g.bolag, kund: null,
          avtalsform: g.timpeng ? 'timpeng' : 'ackord', avrakningsdatum: g.avr,
          mangd: 0, mangd_enhet: g.timpeng ? 'h' : 'm3fub', summa: 0,
          orsak: e?.message || String(e),
        });
      }
    }

    // Pågår: något är avslutat men inte allt. Ingen summa — trakten är inte
    // färdig, och ett halvt belopp är värre än inget.
    const pagar: OversiktsRad[] = alla
      .filter(g => !g.klar && g.nagonKlar)
      .sort((a, b) => (b.avr || '').localeCompare(a.avr || ''))
      .map(g => ({
        vo_nummer: g.vo, namn: g.namn, bolag: g.bolag, kund: null,
        avtalsform: g.timpeng ? 'timpeng' : 'ackord', avrakningsdatum: g.avr,
        mangd: 0, mangd_enhet: g.timpeng ? 'h' : 'm3fub', summa: 0,
        orsak: 'Skotningen är inte avslutad',
      }));

    // Väntar på inmätning: à conto skickat, slutredovisning kvar. Kräver
    // faktura_underlag — tom i dag, och de gamla fakturorna är inte kopplade
    // till VO. Gruppen visas tom med den förklaringen i stället för att
    // utelämnas, så det syns att den inte är glömd.
    const { data: skickade } = await sb.from('faktura_underlag')
      .select('vo_nummer, typ, status').eq('typ', 'a_conto').eq('status', 'skickat');
    const vantar: OversiktsRad[] = (skickade || []).map((u: any) => {
      const g = per.get(u.vo_nummer);
      return {
        vo_nummer: u.vo_nummer, namn: g?.namn || u.vo_nummer, bolag: g?.bolag || null,
        kund: null, avtalsform: g?.timpeng ? 'timpeng' : 'ackord',
        avrakningsdatum: g?.avr || null, mangd: 0,
        mangd_enhet: g?.timpeng ? 'h' : 'm3fub', summa: 0,
        orsak: 'À conto skickat, slutredovisning kvar',
      };
    });

    return NextResponse.json({
      ok: true,
      fonster: {
        dagar, max,
        byggda: iFonster.length,
        klara_totalt: klaraAlla.length,
        utanfor: klaraAlla.length - iFonster.length,
      },
      grupper: { klara, atgard, vantar, pagar },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e?.message || String(e) }, { status: 500 });
  }
}
