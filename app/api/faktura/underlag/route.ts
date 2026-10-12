import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/lonesystem/server';
import { kravRoll, ADMIN_ROLLER } from '@/lib/auth/server';
import { hamtaVoUnderlag } from '@/lib/faktura/hamtaUnderlag';
import { byggRader, garAttSkicka, type FakturaRad } from '@/lib/faktura/radbyggare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/faktura/underlag
 * Body: { vo_nummer: string | string[], dry_run?: boolean, typ?: 'a_conto' | 'slutredovisning' }
 *
 * dry_run=true (DEFAULT): räknar fram raderna och returnerar dem. Skriver inget.
 * dry_run=false: sparar samma rader som ett underlag med status 'utkast'.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EN BERÄKNING, TVÅ GRENAR. Det Martin godkänner i granskningen är PER
 * KONSTRUKTION det som sparas: båda grenarna läser samma `rader`-array, och
 * den skarpa grenen räknar aldrig om något. Samma form som
 * /api/fortnox/salary-export.
 *
 * DEFAULT ÄR DRY RUN, till skillnad från löneexporten. Där är dry_run=false
 * default eftersom rutinen är inarbetad; här har ingen faktura någonsin
 * byggts av appen, och ett glömt fält ska ge en förhandsvisning, inte ett
 * sparat underlag.
 *
 * SKICKAR INGENTING TILL FORTNOX. Den skarpa grenen skriver bara till våra
 * egna tabeller (faktura_vo / faktura_underlag / faktura_rad) som 'utkast'.
 * Att skapa en riktig faktura hos Vida är ett utåtriktat steg som kräver ett
 * eget beslut — och à-prisen för 'fortnox'-rader hämtas först då.
 * ─────────────────────────────────────────────────────────────────────────
 */

type Resultat = {
  vo_nummer: string;
  objektnamn: string;
  kund: number | null;
  bolag: string | null;
  avtalsform: 'ackord' | 'timpeng';
  avrakningsdatum: string | null;
  objekt_ids: string[];
  rader: FakturaRad[];
  noter: { niva: string; text: string }[];
  hinder: string[];
  gar_att_skicka: boolean;
  /** Summa på de rader som HAR ett pris. Fortnox-rader saknas alltid här. */
  summa_kant: number;
  rader_utan_pris: number;
  fel?: string;
};

export async function POST(req: NextRequest) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run ?? true;
    const typ: string = body.typ === 'slutredovisning' ? 'slutredovisning' : 'a_conto';
    const vo: string[] = Array.isArray(body.vo_nummer)
      ? body.vo_nummer.map(String)
      : body.vo_nummer ? [String(body.vo_nummer)] : [];

    if (!vo.length) {
      return NextResponse.json({ ok: false, meddelande: 'vo_nummer krävs.' }, { status: 400 });
    }

    const sb = serverSupabase();
    const resultat: Resultat[] = [];

    for (const v of vo) {
      try {
        const { underlag, noter, objektIds } = await hamtaVoUnderlag(sb as any, v);
        const rader = byggRader(underlag);
        const kan = garAttSkicka(underlag, rader);
        const medPris = rader.filter(r => (r.a_pris ?? r.a_pris_beraknat) != null && r.antal != null);
        resultat.push({
          vo_nummer: v,
          objektnamn: underlag.objektnamn,
          kund: underlag.fortnox_kundnr,
          bolag: underlag.bolag,
          avtalsform: underlag.timpeng ? 'timpeng' : 'ackord',
          avrakningsdatum: underlag.avrakningsdatum,
          objekt_ids: objektIds,
          rader,
          noter,
          hinder: kan.hinder,
          gar_att_skicka: kan.ok,
          summa_kant: medPris.reduce((s, r) => s + (r.a_pris ?? r.a_pris_beraknat)! * r.antal!, 0),
          rader_utan_pris: rader.length - medPris.length,
        });
      } catch (e: any) {
        // Ett VO som inte går att läsa får INTE tysta de andra, och det får
        // inte heller se ut som ett tomt underlag. Det blir en egen post med
        // felet i — granskningen visar den som just ett fel.
        resultat.push({
          vo_nummer: v, objektnamn: v, kund: null, bolag: null,
          avtalsform: 'ackord', avrakningsdatum: null, objekt_ids: [],
          rader: [], noter: [], hinder: [e?.message || String(e)],
          gar_att_skicka: false, summa_kant: 0, rader_utan_pris: 0,
          fel: e?.message || String(e),
        });
      }
    }

    if (dryRun) {
      return NextResponse.json({ ok: true, dry_run: true, typ, antal: resultat.length, resultat });
    }

    // ── SKARP GREN: spara exakt de rader som räknades fram ovan ──────────
    const sparade: { vo_nummer: string; underlag_id: string; rader: number }[] = [];
    const avvisade: { vo_nummer: string; orsak: string }[] = [];

    for (const r of resultat) {
      if (!r.gar_att_skicka) {
        avvisade.push({ vo_nummer: r.vo_nummer, orsak: r.hinder.join(' · ') });
        continue;
      }

      // faktura_vo måste finnas innan ett underlag kan peka på det.
      const { error: voFel } = await sb.from('faktura_vo')
        .upsert({ foretag_id: 'kompersmala', vo_nummer: r.vo_nummer },
                { onConflict: 'foretag_id,vo_nummer' });
      if (voFel) { avvisade.push({ vo_nummer: r.vo_nummer, orsak: 'faktura_vo: ' + voFel.message }); continue; }

      const { data: ul, error: ulFel } = await sb.from('faktura_underlag')
        .insert({ foretag_id: 'kompersmala', vo_nummer: r.vo_nummer, typ, status: 'utkast' })
        .select('id').single();
      if (ulFel || !ul) { avvisade.push({ vo_nummer: r.vo_nummer, orsak: 'faktura_underlag: ' + (ulFel?.message || 'ingen rad') }); continue; }

      // Raderna kommer ORÖRDA från byggRader. a_pris_beraknat och
      // kostnadsstalle skrivs INTE — det första är ett uträknat pris som
      // aldrig lagras (rad_pris_agare), det andra har ingen kolumn än.
      const { error: radFel } = await sb.from('faktura_rad').insert(
        r.rader.map(rad => ({
          foretag_id: 'kompersmala',
          underlag_id: ul.id,
          radnr: rad.radnr,
          artikelnr: rad.artikelnr,
          benamning: rad.benamning,
          antal: rad.antal,
          enhet: rad.enhet,
          prisagare: rad.prisagare,
          a_pris: rad.a_pris,
          harledning: rad.harledning,
          kalla: rad.kalla,
          kalla_id: rad.kalla_id,
          status: rad.status,
          fel_kod: rad.fel_kod,
        })));
      if (radFel) {
        // Underlaget städas bort så att ett halvt underlag inte blir kvar.
        // faktura_rad har ON DELETE CASCADE mot underlaget.
        await sb.from('faktura_underlag').delete().eq('id', ul.id);
        avvisade.push({ vo_nummer: r.vo_nummer, orsak: 'faktura_rad: ' + radFel.message });
        continue;
      }

      // LÄS TILLBAKA. En insert som inte kastar bevisar inte att raderna
      // finns — RLS kan svälja skrivningen tyst och ge 0 rader utan fel.
      const { count, error: kollFel } = await sb.from('faktura_rad')
        .select('id', { count: 'exact', head: true }).eq('underlag_id', ul.id);
      if (kollFel || (count ?? 0) !== r.rader.length) {
        await sb.from('faktura_underlag').delete().eq('id', ul.id);
        avvisade.push({
          vo_nummer: r.vo_nummer,
          orsak: `sparade ${count ?? 0} av ${r.rader.length} rader — underlaget ångrat`,
        });
        continue;
      }

      sparade.push({ vo_nummer: r.vo_nummer, underlag_id: ul.id, rader: r.rader.length });
    }

    return NextResponse.json({
      ok: avvisade.length === 0,
      dry_run: false,
      typ,
      sparade,
      avvisade,
      // Samma beräkning som dry_run returnerade — inte en omräkning.
      resultat,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e?.message || String(e) }, { status: 500 });
  }
}
