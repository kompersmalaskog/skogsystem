import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";
import { maskinForKostnadsstalleEntydig, type KostnadsstalleRad } from "@/lib/ekonomi/kostnadsstalle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fortnox/result-per-costcenter?fromdate=YYYY-MM-DD&todate=YYYY-MM-DD
 *
 * Admin-only. Aggregerar resultat per kostnadsställe från fortnox_voucher_rows
 * (cachad voucher-data, uppdateras nattligt via pg_cron → /api/fortnox/sync-vouchers).
 *
 * `/3/reports/result` finns inte i Fortnox REST API (returnerar 2000764
 * "No such route") så vi bygger rapporten själva från voucher-rader.
 *
 * Account-grupperingar (BAS 2023/2024):
 *   3xxx → intakter
 *   56xx → drivmedel (transportmedel)
 *   50-55xx + 57-59xx → drift_service (lokaler, reparation, ovriga externa)
 *   78xx → avskrivning (av- och nedskrivningar av materiella tillgångar)
 *   70-77xx + 79xx → loner (personalkostnader)
 *   4xxx/6xxx/8xxx → ovrigt
 */
export async function GET(req: NextRequest) {
  try {
    // ── Admin-check ──
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
        },
      },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ ok: false, meddelande: "Ej inloggad" }, { status: 401 });
    }
    const { data: med } = await authClient
      .from("medarbetare")
      .select("roll")
      .eq("epost", user.email)
      .single();
    if (!med || (med.roll !== "admin" && med.roll !== "chef")) {
      return NextResponse.json({ ok: false, meddelande: "Kräver admin-roll" }, { status: 403 });
    }

    // ── Params ──
    const { searchParams } = new URL(req.url);
    const fromdate = searchParams.get("fromdate");
    const todate = searchParams.get("todate");
    if (!fromdate || !todate) {
      return NextResponse.json(
        { ok: false, meddelande: "fromdate och todate krävs (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    // ── Mappning + costcenters ──
    const supabase = serverSupabase();
    const [mapRes, maskinRes, ccRes, syncRes] = await Promise.all([
      // MED giltighetsdatum — koder återanvänds mellan maskiner över tid
      // (M12: R64101 → R64428 vid 2026-03-12). Radens datum avgör ägaren.
      supabase.from("maskin_kostnadsstalle").select("maskin_id, kostnadsstalle_kod, giltig_fran, giltig_till"),
      supabase.from("dim_maskin").select("maskin_id, visningsnamn, modell, maskin_typ, vardeminskning_kr_per_g15h, sald, sald_datum"),
      // Fortnox costcenters är liten och statisk — vi kan kalla den direkt.
      (async () => {
        try {
          const client = (await getFortnoxClient()) as any;
          const r = await fetch("https://api.fortnox.se/3/costcenters", {
            headers: { Authorization: `Bearer ${client.accessToken}`, Accept: "application/json" },
            cache: "no-store",
          });
          if (!r.ok) return { data: [] as any[], error: `HTTP ${r.status}` };
          const body = await r.json();
          return { data: body?.CostCenters || [], error: null };
        } catch (e: any) {
          return { data: [] as any[], error: e?.message || String(e) };
        }
      })(),
      supabase.from("fortnox_sync_state").select("*").eq("id", 1).maybeSingle(),
    ]);
    const mappningar: KostnadsstalleRad[] = mapRes.data || [];
    const maskinMap: Record<string, any> = {};
    for (const m of (maskinRes.data || [])) maskinMap[m.maskin_id] = m;
    const costCenters: { Code: string; Description?: string; Active?: boolean }[] = ccRes.data || [];
    const sync = syncRes.data;

    // ── Aggregera från cache ──
    // Läs ALLA rader i perioden (oavsett costcenter) — vi behöver helheten
    // för "Företaget totalt" och "Utan kostnadsställe". Paginering för att
    // komma runt Supabase default-limit 1000.
    type Rad = { account: string; debit: number; credit: number; costcenter: string | null; transaction_date: string };
    const rader: Rad[] = [];
    const sidStorlek = 1000;
    for (let offset = 0; ; offset += sidStorlek) {
      const { data, error: err } = await supabase
        .from("fortnox_voucher_rows")
        .select("account, debit, credit, costcenter, transaction_date")
        .gte("transaction_date", fromdate)
        .lte("transaction_date", todate)
        .order('id')  // unik tiebreaker — .range() kräver total ordning
        .range(offset, offset + sidStorlek - 1);
      if (err) {
        return NextResponse.json({ ok: false, meddelande: `Cache-läsning: ${err.message}` }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        rader.push({
          account: String(r.account || "").trim(),
          debit: Number(r.debit) || 0,
          credit: Number(r.credit) || 0,
          costcenter: r.costcenter || null,
          transaction_date: String(r.transaction_date || ""),
        });
      }
      if (data.length < sidStorlek) break;
    }

    // Hjälpare: gruppera rader per konto-klass enligt BAS. netto=debit-credit;
    // 3xxx är credit-saldo → intäkter = -netto.
    function grupperaKonto(accRader: { account: string; sum: number }[]) {
      let intakter = 0, drivmedel = 0, drift_service = 0, loner = 0, avskrivning = 0, ovrigt = 0;
      for (const r of accRader) {
        const first = r.account.charAt(0);
        const two = r.account.slice(0, 2);
        if (first === "3") intakter += -r.sum;
        else if (two === "56") drivmedel += r.sum;
        else if (first === "5") drift_service += r.sum;
        // 78 före 7-fallet: avskrivningen ska inte gömmas inne i lön
        else if (two === "78") avskrivning += r.sum;
        else if (first === "7") loner += r.sum;
        else if (first === "4" || first === "6" || first === "8") ovrigt += r.sum;
      }
      const kostnader_total = drivmedel + drift_service + loner + avskrivning + ovrigt;
      return {
        intakter,
        kostnader: { drivmedel, drift_service, loner, avskrivning, ovrigt, total: kostnader_total },
        resultat: intakter - kostnader_total,
      };
    }

    function aggrPerKonto(filter: (r: Rad) => boolean): { account: string; sum: number }[] {
      const m: Record<string, number> = {};
      for (const r of rader) {
        if (!filter(r)) continue;
        if (!r.account) continue;
        m[r.account] = (m[r.account] || 0) + (r.debit - r.credit);
      }
      return Object.entries(m).map(([account, sum]) => ({ account, sum }));
    }

    // 1) Företaget totalt — alla rader oavsett costcenter
    const totalRader = aggrPerKonto(() => true);
    const foretagetTotalt = { ok: true, konton: totalRader, ...grupperaKonto(totalRader) };

    // Rörelsens mått (för "mot i fjol"-jämförelsen): nettoomsättning 30–37,
    // övriga intäkter 38–39, rörelsekostnad 40–79, finansiellt 80–89.
    // Skiljer sig från kategorierna ovan — övriga intäkter kan svänga stort
    // mellan år (2025: 2,6 mkr) och döljer då verksamhetens utveckling.
    // const-arrow, inte function-deklaration — try-blocket ger annars TS1252.
    const rorelseGruppering = (accRader: { account: string; sum: number }[]) => {
      let nettoomsattning = 0, ovriga_intakter = 0, rorelsekostnad = 0, finansiellt = 0;
      for (const r of accRader) {
        const h = Number(r.account.slice(0, 2));
        if (h >= 30 && h <= 37) nettoomsattning += -r.sum;
        else if (h >= 38 && h <= 39) ovriga_intakter += -r.sum;
        else if (h >= 40 && h <= 79) rorelsekostnad += r.sum;
        else if (h >= 80 && h <= 89) finansiellt += r.sum;
      }
      return { nettoomsattning, ovriga_intakter, rorelsekostnad, finansiellt };
    };
    const rorelse = rorelseGruppering(totalRader);

    // Sista bokförda dag i spannet — klienten märker ärligt ett kvartal
    // "ofullständigt bokfört" i stället för att visa en låg stapel som fakta.
    let maxTransaktionsdatum = "";
    for (const r of rader) if (r.transaction_date > maxTransaktionsdatum) maxTransaktionsdatum = r.transaction_date;

    // Kvartalsserie ur SAMMA rader (spannet styr vilka kvartal som har data) —
    // intäkt mot kostnad per kvartal för trendgrafen. Kvartal utan rader
    // redovisas med antal_rader=0 så klienten kan skilja "tomt" från "noll".
    const kvartalsserie = [1, 2, 3, 4].map(q => {
      const iKvartal = (r: Rad) => Math.floor((Number(r.transaction_date.slice(5, 7)) - 1) / 3) + 1 === q;
      const g = grupperaKonto(aggrPerKonto(iKvartal));
      return {
        kvartal: q,
        intakter: g.intakter,
        kostnader_total: g.kostnader.total,
        resultat: g.resultat,
        antal_rader: rader.filter(iKvartal).length,
      };
    });

    // 2) Per maskin — varje Fortnox-RADS transaktionsdatum avgör vilken
    // maskin dess kostnadsställe hörde till DÅ (giltig_fran/giltig_till).
    // Koder återanvänds mellan maskiner (M12: R64101 → R64428) — "alla
    // koder maskinen någonsin haft" smetade gamla kostnader på nya ägaren
    // och räknade delade koder DUBBELT (samma rad hos båda maskinerna).
    // Uppslaget cachas per kod|datum; null (ingen/eller tvetydig ägare
    // den dagen) → raden redovisas under "övriga", tappas aldrig.
    // Entydig-varianten: en kod som bara EN maskin någonsin haft ägs av
    // den maskinen även i datumluckor (M6 1 jan, SCO jan–mars) — delade
    // koder (M12) avgörs fortfarande strikt av datumet.
    const agareCache = new Map<string, string | null>();
    const maskinForRad = (r: Rad): string | null => {
      if (!r.costcenter || !r.transaction_date) return null;
      const nyckel = `${r.costcenter}|${r.transaction_date}`;
      if (!agareCache.has(nyckel)) {
        agareCache.set(nyckel, maskinForKostnadsstalleEntydig(r.costcenter, r.transaction_date, mappningar));
      }
      return agareCache.get(nyckel)!;
    };
    // Kodlistan per maskin (alla generationer) behålls som BESKRIVNING för
    // UI-chips och för att alla mappade maskiner ska listas även utan rader.
    const koderPerMaskin: Record<string, string[]> = {};
    for (const m of mappningar) {
      const lista = (koderPerMaskin[m.maskin_id] = koderPerMaskin[m.maskin_id] || []);
      if (!lista.includes(m.kostnadsstalle_kod)) lista.push(m.kostnadsstalle_kod);
    }
    const maskiner: any[] = [];
    for (const [maskinId, koder] of Object.entries(koderPerMaskin)) {
      const kontoRader = aggrPerKonto(r => maskinForRad(r) === maskinId);
      const grupp = grupperaKonto(kontoRader);
      const maskinInfo = maskinMap[maskinId];
      const kostnadsstallen = koder.map(k => {
        const cc = costCenters.find(c => c.Code === k);
        return { kod: k, namn: cc?.Description || k };
      });
      maskiner.push({
        maskin_id: maskinId,
        maskin_namn: (maskinInfo?.visningsnamn && String(maskinInfo.visningsnamn).trim()) || maskinInfo?.modell || maskinId,
        maskin_typ: maskinInfo?.maskin_typ || null,
        // Rådata för verklig värdeminskning (KALKYL, ej bokförd) — klienten
        // räknar kr/G15-tim × periodens G15-timmar via
        // lib/ekonomi/vardeminskning.ts, EN delad plats.
        vardeminskning_grund: {
          vardeminskning_kr_per_g15h: maskinInfo?.vardeminskning_kr_per_g15h ?? null,
          sald: maskinInfo?.sald ?? null,
          sald_datum: maskinInfo?.sald_datum ?? null,
        },
        // Bevara primär-fältet för bakåtkompat — första CC:n
        kostnadsstalle: kostnadsstallen[0],
        kostnadsstallen, // hela listan för UI-chips
        ok: true,
        ...grupp,
        konton: kontoRader,
      });
    }
    maskiner.sort((a, b) => String(a.maskin_namn).localeCompare(String(b.maskin_namn), 'sv'));

    // 3) Utan kostnadsställe — costcenter IS NULL eller ''
    const utanKostRader = aggrPerKonto(r => !r.costcenter || r.costcenter === "");
    const utanKostnadsstalle = { ok: true, konton: utanKostRader, ...grupperaKonto(utanKostRader) };

    // 4) Övriga kostnadsställen — rader vars kod INGEN maskin ägde på radens
    //    datum: aldrig mappade koder (M8 Lastbil, TRA VM Trailer, EWA) men
    //    också rader från perioder där mappningen inte gällde. Testet måste
    //    vara per rad (inte "koden är mappad någon gång") — annars tappas
    //    sådana rader tyst: koden är mappad så de går inte hit, men ingen
    //    maskin matchar datumet. Varje rad hamnar i exakt en av
    //    maskin/övriga/utan-CC → summan är alltid företagstotalen.
    const ovrigaMap: Record<string, { account: string; sum: number }[]> = {};
    for (const r of rader) {
      if (!r.costcenter) continue;
      if (maskinForRad(r) !== null) continue;
      if (!ovrigaMap[r.costcenter]) ovrigaMap[r.costcenter] = [];
      const accList = ovrigaMap[r.costcenter];
      const hittad = accList.find(a => a.account === r.account);
      if (hittad) hittad.sum += (r.debit - r.credit);
      else accList.push({ account: r.account, sum: (r.debit - r.credit) });
    }
    const ovrigaKostnadsstallen = Object.entries(ovrigaMap).map(([kod, konton]) => {
      const cc = costCenters.find(c => c.Code === kod);
      return { kod, namn: cc?.Description || kod, ...grupperaKonto(konton), konton };
    });
    ovrigaKostnadsstallen.sort((a, b) => (b.intakter + b.kostnader.total) - (a.intakter + a.kostnader.total));

    return NextResponse.json({
      ok: true,
      period: { fromdate, todate },
      antal_rader_i_period: rader.length,
      max_transaction_date: maxTransaktionsdatum || null,
      kvartalsserie,
      rorelse,
      kostnadsstallen: costCenters.map(c => ({ kod: c.Code, namn: c.Description, aktiv: c.Active })),
      foretaget_totalt: foretagetTotalt,
      maskiner,
      utan_kostnadsstalle: utanKostnadsstalle,
      ovriga_kostnadsstallen: ovrigaKostnadsstallen,
      cache_status: sync
        ? {
            senaste_sync: sync.last_sync_at,
            senaste_lyckad: sync.last_success_at,
            status: sync.last_status,
            antal_verifikat: sync.voucher_count,
            antal_rader: sync.rows_count,
            fel: sync.last_error,
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        meddelande: e?.message || String(e),
        stack: e?.stack ? String(e.stack).split("\n").slice(0, 8) : null,
      },
      { status: 500 },
    );
  }
}
