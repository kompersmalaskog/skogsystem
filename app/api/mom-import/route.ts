import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// SERVICE-ROLLEN, inte anon: routen är server-side och läser/skriver RLS-låsta
// tabeller (operator_medarbetare, fakt_skift, arbetsdag). Med anon-nyckeln såg
// den 0 rader (tyst RLS-tomhet) och svarade 500 på VARJE anrop — synken var
// död i prod sedan RLS-migrationen 20260524.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/mom-import
 *
 * Skapar/uppdaterar arbetsdag-rader baserat på fakt_skift-data.
 * Manuellt redigerade rader (redigerad=true) skrivs aldrig över.
 * Övriga rader raderas och återskapas med färsk data.
 *
 * Body (optional): { datum?: string }
 */
// Nedre datumgräns för synken. fakt_skift-rader FÖRE 2026-07-14 bär den
// fil-lokala OperatorKey-felattributionen som #145 fixade FRAMÅT (fixen
// deployades till live-importern 14 juli 2026). De historiska dagarna
// (10–12 jun A110148, 7–12 jul A030353 — 91,7h) är redan manuellt rättade
// i arbetsdag; en synk bakåt skulle återskapa dem FELATTRIBUERADE på fel
// förare. Rådatan rättas inte (vi ändrar inte vad maskinen rapporterade).
// Vill man synka före gränsen måste fakt_skift-attributionen rättas FÖRST —
// flytta då gränsen medvetet via env MOM_SYNK_FRAN (YYYY-MM-DD).
const SYNK_FRAN = process.env.MOM_SYNK_FRAN || '2026-07-14';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const filterDatum: string | undefined = body.datum;

    if (filterDatum && filterDatum < SYNK_FRAN) {
      return NextResponse.json({
        created: 0,
        message: `Datum ${filterDatum} ligger före synk-gränsen ${SYNK_FRAN} — gamla fakt_skift-rader har pre-#145-felattribution och historiska arbetsdagar är redan manuellt rättade. Rätta fakt_skift först om synk bakåt verkligen behövs (se MOM_SYNK_FRAN).`,
      }, { status: 400 });
    }

    // 1. Hämta operator → medarbetare mappning
    const { data: mappningar, error: mapErr } = await supabase
      .from('operator_medarbetare')
      .select('operator_id, medarbetare_id');

    if (mapErr || !mappningar?.length) {
      return NextResponse.json(
        { error: 'Ingen operator_medarbetare-data', details: mapErr?.message },
        { status: 500 }
      );
    }

    const opMap: Record<string, string> = {};
    for (const m of mappningar) {
      opMap[m.operator_id] = m.medarbetare_id;
    }

    // 2. Hämta fakt_skift-rader
    let query = supabase
      .from('fakt_skift')
      .select('datum, maskin_id, operator_id, inloggning_tid, utloggning_tid, langd_sek')
      .order('datum', { ascending: false });

    if (filterDatum) {
      query = query.eq('datum', filterDatum);
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const fran = thirtyDaysAgo.toISOString().split('T')[0];
      // 30-dagarsfönstret klipps mot synk-gränsen — aldrig bakåt förbi den
      query = query.gte('datum', fran > SYNK_FRAN ? fran : SYNK_FRAN);
    }

    const { data: skift, error: skiftErr } = await query;
    if (skiftErr) {
      return NextResponse.json(
        { error: 'Kunde inte hämta fakt_skift', details: skiftErr.message },
        { status: 500 }
      );
    }

    if (!skift?.length) {
      return NextResponse.json({ created: 0, message: 'Inga skift att bearbeta' });
    }

    // 3. Hämta skyddade rader: manuellt REDIGERADE och BEKRÄFTADE.
    // En bekräftelse är förarens underskrift — synken skriver ALDRIG över den
    // (samma skydd som redigerad). Avviker MOM-datan från det som bekräftades
    // registreras avvikelsen i stället (synk_avvikelse) — appen ändrar inte
    // tyst, den berättar.
    const datumSet = [...new Set(skift.map(s => s.datum))];
    const medarbetareIds = [...new Set(
      skift.map(s => opMap[s.operator_id]).filter(Boolean)
    )];

    const { data: skyddadeRader } = await supabase
      .from('arbetsdag')
      .select('id, medarbetare_id, datum, start_tid, slut_tid, rast_min, redigerad, bekraftad')
      .in('datum', datumSet)
      .in('medarbetare_id', medarbetareIds)
      .or('redigerad.eq.true,bekraftad.eq.true');

    const skyddade = new Set(
      (skyddadeRader || []).map(r => `${r.medarbetare_id}_${r.datum}`)
    );

    // 4. Hämta rast_sek och objekt_id från fakt_tid per operator+datum
    const operatorIds = [...new Set(skift.map(s => s.operator_id).filter(Boolean))];
    let rastMap: Record<string, number> = {};
    let objektMap: Record<string, string> = {}; // key: medarbetare_id_datum → objekt_id

    // objektListaMap: alla objekt per (medarbetare, datum) sorterade på engine_time
    // → används för arbetsdag_objekt-tabellen så vi kan visa flera objekt per dag.
    const objektListaMap: Record<string, { objekt_id: string; engine_time_sek: number }[]> = {};

    if (operatorIds.length && datumSet.length) {
      const { data: rastData } = await supabase
        .from('fakt_tid')
        .select('operator_id, datum, rast_sek, objekt_id, engine_time_sek')
        .in('operator_id', operatorIds)
        .in('datum', datumSet);

      if (rastData) {
        const objektTid: Record<string, Record<string, number>> = {};
        for (const r of rastData) {
          const medId = opMap[r.operator_id];
          if (!medId) continue;
          const key = `${medId}_${r.datum}`;
          rastMap[key] = (rastMap[key] || 0) + (r.rast_sek || 0);
          if (r.objekt_id) {
            if (!objektTid[key]) objektTid[key] = {};
            objektTid[key][r.objekt_id] = (objektTid[key][r.objekt_id] || 0) + (r.engine_time_sek || 0);
          }
        }
        // Dominant objekt → arbetsdag.objekt_id (bakåtkompat)
        // Hela listan → arbetsdag_objekt
        for (const [key, objs] of Object.entries(objektTid)) {
          const sorterade = Object.entries(objs)
            .map(([oid, sek]) => ({ objekt_id: oid, engine_time_sek: sek }))
            .sort((a, b) => b.engine_time_sek - a.engine_time_sek);
          if (sorterade.length) objektMap[key] = sorterade[0].objekt_id;
          objektListaMap[key] = sorterade;
        }
      }
    }

    // 5. Aggregera skift per (medarbetare_id, datum)
    type DagAgg = {
      medarbetare_id: string;
      datum: string;
      maskin_id: string;
      earliestStart: string;
      latestEnd: string;
      totalSek: number;
    };

    const dagMap: Record<string, DagAgg> = {};

    for (const s of skift) {
      const medId = opMap[s.operator_id];
      if (!medId) continue;

      const key = `${medId}_${s.datum}`;
      // OBS: skyddade byggs MED i dagMap (behövs för 5b-heuristiken och för
      // avvikelse-jämförelsen mot bekräftade dagar) — de filtreras bort
      // först vid insert-listan i steg 5d.

      if (!dagMap[key]) {
        dagMap[key] = {
          medarbetare_id: medId,
          datum: s.datum,
          maskin_id: s.maskin_id,
          earliestStart: s.inloggning_tid,
          latestEnd: s.utloggning_tid,
          totalSek: 0,
        };
      }

      const agg = dagMap[key];
      if (s.inloggning_tid < agg.earliestStart) agg.earliestStart = s.inloggning_tid;
      if (s.utloggning_tid > agg.latestEnd) agg.latestEnd = s.utloggning_tid;
      agg.totalSek += s.langd_sek || 0;
    }

    // 5b. Heuristik: Rottne-maskiner saknar OperatorShiftDefinition — Python-
    // parsern bygger syntetiska skift där ALLA operatörer på samma maskin/dag
    // får samma inloggningstid (maskinens första starttid). Det gör att den
    // andra föraren felaktigt visas som inloggad kl 06:49 när han egentligen
    // tog över klockan 17:01.
    //
    // Regel: om två+ förare på samma maskin/datum har identisk earliestStart,
    // sortera dem på latestEnd ASC och anta sekventiell körning — den förstas
    // slut blir den andras start.
    const perMaskinDag: Record<string, DagAgg[]> = {};
    for (const agg of Object.values(dagMap)) {
      const mk = `${agg.maskin_id}_${agg.datum}`;
      (perMaskinDag[mk] = perMaskinDag[mk] || []).push(agg);
    }
    for (const grupp of Object.values(perMaskinDag)) {
      if (grupp.length < 2) continue;
      const sameStart = grupp.every(a => a.earliestStart === grupp[0].earliestStart);
      if (!sameStart) continue;
      // Sekventiell modell: sortera på slut-tid, varje efterkommande börjar där föregående slutade.
      grupp.sort((a, b) => a.latestEnd.localeCompare(b.latestEnd));
      for (let i = 1; i < grupp.length; i++) {
        grupp[i].earliestStart = grupp[i - 1].latestEnd;
      }
    }

    // 5c. Proportionell rast-fördelning för delade maskindagar.
    // fakt_tid har bara rader för EN operatör per (datum, maskin, objekt) pga
    // Python-parserns "senaste-vinner"-mappning. När två förare kört samma
    // maskin samma dag hamnar hela maskinens rast på en förare (ofta den
    // som loggade ut senast) medan den andra får 0 min. Fördela istället
    // totalrasten proportionellt mot varje förares skiftlängd.
    const parseHM = (iso: string): number => {
      const m = iso.match(/(\d{2}):(\d{2})/);
      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
    };
    for (const grupp of Object.values(perMaskinDag)) {
      if (grupp.length < 2) continue;
      // Summera totalrast från rastMap och kolla om den är ojämnt fördelad.
      const rastPerOp = grupp.map(agg => {
        const key = `${agg.medarbetare_id}_${agg.datum}`;
        return rastMap[key] || 0;
      });
      const totalRastSek = rastPerOp.reduce((s, r) => s + r, 0);
      if (totalRastSek === 0) continue;
      const nollor = rastPerOp.filter(r => r === 0).length;
      // Om minst en har rast och minst en annan har 0 → omfördela proportionellt
      if (nollor === 0) continue;
      const spans = grupp.map(agg => Math.max(0, parseHM(agg.latestEnd) - parseHM(agg.earliestStart)));
      const totalSpan = spans.reduce((s, v) => s + v, 0);
      if (totalSpan === 0) continue;
      for (let i = 0; i < grupp.length; i++) {
        const andel = spans[i] / totalSpan;
        const nyRastSek = Math.round(totalRastSek * andel);
        rastMap[`${grupp[i].medarbetare_id}_${grupp[i].datum}`] = nyRastSek;
      }
    }

    // 5. Skapa arbetsdag-rader
    // DB lagrar lokal svensk tid märkt som UTC (parse_datetime strippar timezone)
    // Extrahera HH:MM direkt utan konvertering
    const hhmm = (iso: string) => {
      const m = iso.match(/(\d{2}):(\d{2})/);
      return m ? `${m[1]}:${m[2]}` : '00:00';
    };

    // 5d. Avvikelse-registrering för BEKRÄFTADE dagar: synken rör dem inte,
    // men om MOM-datan skiljer sig från det föraren skrev under på (> 1 min
    // på start/slut/rast) sparas avvikelsen i arbetsdag.synk_avvikelse så
    // UI:t senare kan fråga "din maskindata har ändrats — vill du uppdatera?".
    // Matchar MOM igen nollas fältet. Fail-soft: saknas kolumnen (migration
    // ej körd) loggas det bara — synken får inte stanna på metadatat.
    const tidMin = (t: string | null) => {
      const m = (t || '').match(/(\d{2}):(\d{2})/);
      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
    };
    for (const skyddad of (skyddadeRader || [])) {
      if (!skyddad.bekraftad || skyddad.redigerad) continue; // bara bekräftade, oredigerade
      const key = `${skyddad.medarbetare_id}_${skyddad.datum}`;
      const agg = dagMap[key];
      if (!agg) continue; // ingen MOM-data för dagen — inget att jämföra
      const momStart = hhmm(agg.earliestStart);
      const momSlut = hhmm(agg.latestEnd);
      const momRast = Math.round((rastMap[key] || 0) / 60);
      const dStart = Math.abs((tidMin(momStart) ?? 0) - (tidMin(skyddad.start_tid) ?? 0));
      const dSlut = Math.abs((tidMin(momSlut) ?? 0) - (tidMin(skyddad.slut_tid) ?? 0));
      const dRast = Math.abs(momRast - (skyddad.rast_min || 0));
      const avviker = dStart > 1 || dSlut > 1 || dRast > 1;
      const { error: avvErr } = await supabase
        .from('arbetsdag')
        .update({
          synk_avvikelse: avviker
            ? {
                mom_start: momStart, mom_slut: momSlut, mom_rast_min: momRast,
                bekraftad_start: (skyddad.start_tid || '').slice(0, 5),
                bekraftad_slut: (skyddad.slut_tid || '').slice(0, 5),
                bekraftad_rast_min: skyddad.rast_min || 0,
                upptackt: new Date().toISOString(),
              }
            : null,
        })
        .eq('id', skyddad.id);
      if (avvErr) console.warn('synk_avvikelse kunde inte skrivas (migration ej körd?):', avvErr.message);
    }

    const rows = Object.values(dagMap)
      .filter(agg => !skyddade.has(`${agg.medarbetare_id}_${agg.datum}`))
      .map(agg => {
      const rastKey = `${agg.medarbetare_id}_${agg.datum}`;
      const rastSek = rastMap[rastKey] || 0;
      const rastMin = Math.round(rastSek / 60);
      return {
        medarbetare_id: agg.medarbetare_id,
        datum: agg.datum,
        dagtyp: 'normal',
        start_tid: hhmm(agg.earliestStart),
        slut_tid: hhmm(agg.latestEnd),
        rast_min: rastMin,
        maskin_id: agg.maskin_id,
        objekt_id: objektMap[rastKey] || null,
        bekraftad: false,
      };
    });

    if (!rows.length) {
      return NextResponse.json({ created: 0, message: 'Inga dagar att uppdatera' });
    }

    // 6. Radera befintliga rader för dessa datum — men ALDRIG redigerade
    // eller bekräftade (dubbelt skydd: skyddade är redan bortfiltrerade ur
    // rows, filtren här är bältet OCH hängslena). Delete-fel kontrolleras —
    // en tyst misslyckad delete ger insert-krock som följdfel (#162-klassen).
    for (const datum of datumSet) {
      const medIds = rows.filter(r => r.datum === datum).map(r => r.medarbetare_id);
      if (medIds.length) {
        const { error: delErr } = await supabase
          .from('arbetsdag')
          .delete()
          .eq('datum', datum)
          .in('medarbetare_id', medIds)
          .or('redigerad.is.null,redigerad.eq.false')
          .or('bekraftad.is.null,bekraftad.eq.false');
        if (delErr) {
          return NextResponse.json(
            { error: `Kunde inte radera gamla rader för ${datum}`, details: delErr.message },
            { status: 500 }
          );
        }
      }
    }

    // 7. Insert nya rader. Hämta också medarbetare_id+datum för att kunna
    // skriva arbetsdag_objekt-rader i nästa steg.
    const { data: inserted, error: insertErr } = await supabase
      .from('arbetsdag')
      .insert(rows)
      .select('id, medarbetare_id, datum, start_tid, slut_tid, arbetad_min, maskin_id');

    if (insertErr) {
      return NextResponse.json(
        { error: 'Kunde inte skapa arbetsdagar', details: insertErr.message },
        { status: 500 }
      );
    }

    // 7b. Skapa arbetsdag_objekt-rader. CASCADE från delete i steg 6 har redan
    // tagit bort gamla rader. För varje arbetsdag, fördela tiden proportionellt
    // mot engine_time per objekt. Hämta objekt-namn från dim_objekt.
    if (inserted && inserted.length > 0) {
      const allaObjektIds = new Set<string>();
      for (const lista of Object.values(objektListaMap)) {
        for (const o of lista) allaObjektIds.add(o.objekt_id);
      }
      let objektNamnMap: Record<string, string> = {};
      if (allaObjektIds.size > 0) {
        const { data: objektData } = await supabase
          .from('dim_objekt')
          .select('objekt_id, object_name')
          .in('objekt_id', Array.from(allaObjektIds));
        for (const o of objektData || []) {
          objektNamnMap[o.objekt_id] = o.object_name;
        }
      }

      const objektRader: any[] = [];
      for (const ad of inserted) {
        const key = `${ad.medarbetare_id}_${ad.datum}`;
        const objLista = objektListaMap[key] || [];
        if (objLista.length === 0) continue;
        const totalEngine = objLista.reduce((s, o) => s + o.engine_time_sek, 0);
        objLista.forEach((o, i) => {
          const andel = totalEngine > 0 ? o.engine_time_sek / totalEngine : 1 / objLista.length;
          const arbMin = ad.arbetad_min ? Math.round(ad.arbetad_min * andel) : null;
          objektRader.push({
            arbetsdag_id: ad.id,
            objekt_id: o.objekt_id,
            objekt_namn: objektNamnMap[o.objekt_id] || null,
            maskin_id: ad.maskin_id,
            // start/slut för enskilt objekt går inte att exakt rekonstruera från
            // fakt_tid (saknar tidsstämplar per WorkTime). Lämnar null —
            // användaren kan korrigera manuellt om det behövs.
            start_tid: i === 0 ? ad.start_tid : null,
            slut_tid: i === objLista.length - 1 ? ad.slut_tid : null,
            arbetad_min: arbMin,
            ordning: i + 1,
            skapad_av: 'mom',
          });
        });
      }
      if (objektRader.length > 0) {
        const { error: ojErr } = await supabase.from('arbetsdag_objekt').insert(objektRader);
        if (ojErr) {
          // Logga men fail-not — arbetsdag är redan skapad.
          console.warn('arbetsdag_objekt-insert fel:', ojErr.message);
        }
      }
    }

    // 7c. Köa dagsslut-notiser ("Din arbetsdag — Stämmer?"). Kön har haft en
    // konsument (flush-cronen var 5:e minut) men ALDRIG en producent — detta
    // är den. Dedupen är bärande: MOM-filerna är kumulativa så synken kör
    // många gånger per dag för samma datum — unikt index (typ, mottagare,
    // datum) + ignoreDuplicates (= ON CONFLICT DO NOTHING) ger EN notis per
    // dag, aldrig spam. skickas_at = tidigast 17:00 svensk tid — en lunch-
    // utloggning ska inte notifiera halva dagen; meddelandet byggs FÄRSKT
    // vid flush (då har ev. eftermiddagsfiler hunnit in). Fail-soft: saknas
    // kolumn/index (migration ej körd) loggas det bara — synken stannar inte.
    if (inserted && inserted.length > 0) {
      const kl17 = (datum: string): string => {
        // 17:00 Europe/Stockholm för datumet, OBEROENDE av serverns tidszon.
        // OBS: toLocaleString+new Date-tricket duger inte — strängen parsas i
        // serverns lokala tz och gav fel offset på icke-UTC-servrar. Intl:s
        // longOffset ger tidszonens faktiska offset (sommar-/vintertid).
        const ref = new Date(`${datum}T12:00:00Z`);
        const offsetStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', timeZoneName: 'longOffset' })
          .formatToParts(ref).find(p => p.type === 'timeZoneName')?.value || 'GMT+02:00';
        const m = offsetStr.match(/([+-])(\d{2}):(\d{2})/);
        const offMin = m ? (m[1] === '-' ? -1 : 1) * (parseInt(m[2]) * 60 + parseInt(m[3])) : 120;
        const d = new Date(`${datum}T17:00:00Z`);
        d.setMinutes(d.getMinutes() - offMin);
        return d.toISOString();
      };
      const notisRader = inserted
        .filter((ad: any) => ad.slut_tid)
        .map((ad: any) => ({
          typ: 'dagsslut',
          mottagare_id: ad.medarbetare_id,
          datum: ad.datum,
          skickas_at: new Date(Math.max(Date.now(), new Date(kl17(ad.datum)).getTime())).toISOString(),
          payload: {},
        }));
      // Insert EN rad i taget med 23505 (unik-krock) tolererad som dedup-träff.
      // OBS: upsert med onConflict fungerar INTE här — indexet är PARTIELLT
      // (WHERE datum IS NOT NULL) och PostgREST:s ON CONFLICT-spec kan inte
      // matcha det ("no unique or exclusion constraint..."). En batch-insert
      // duger inte heller: en dup i batchen hade fällt ALLA rader.
      for (const notis of notisRader) {
        const { error: notisErr } = await supabase.from('notis_kö').insert(notis);
        if (notisErr && notisErr.code !== '23505') {
          console.warn('notis_kö kunde inte fyllas (migration ej körd?):', notisErr.message);
        }
      }
    }

    // 8. Fallback: skapa arbetsdag från fakt_tid för datum som saknar rad
    //    (täcker fall där fakt_skift saknas men fakt_tid finns)
    const { data: tidData } = await supabase
      .from('fakt_tid')
      .select('datum, maskin_id, operator_id, processing_sek, terrain_sek, other_work_sek, rast_sek, engine_time_sek, objekt_id')
      .in('datum', datumSet);

    if (tidData?.length) {
      // Aggregera per operator+datum
      const tidAgg: Record<string, {
        datum: string; maskin_id: string; medarbetare_id: string;
        g15sek: number; rastSek: number; engineSek: number; objekt_id: string | null;
      }> = {};

      for (const r of tidData) {
        const medId = opMap[r.operator_id];
        if (!medId) continue;
        const key = `${medId}_${r.datum}`;
        if (!tidAgg[key]) {
          tidAgg[key] = {
            datum: r.datum, maskin_id: r.maskin_id, medarbetare_id: medId,
            g15sek: 0, rastSek: 0, engineSek: 0, objekt_id: null,
          };
        }
        tidAgg[key].g15sek += (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0);
        tidAgg[key].rastSek += r.rast_sek || 0;
        tidAgg[key].engineSek += r.engine_time_sek || 0;
        if (r.objekt_id) tidAgg[key].objekt_id = r.objekt_id;
      }

      // Kolla vilka som redan har arbetsdag
      const fallbackKeys = Object.keys(tidAgg);
      const fallbackMedIds = [...new Set(fallbackKeys.map(k => k.split('_')[0]))];
      const { data: befintliga } = await supabase
        .from('arbetsdag')
        .select('medarbetare_id, datum')
        .in('datum', datumSet)
        .in('medarbetare_id', fallbackMedIds);

      const finnsRedanSet = new Set(
        (befintliga || []).map(r => `${r.medarbetare_id}_${r.datum}`)
      );

      const fallbackRows = Object.entries(tidAgg)
        .filter(([key]) => !finnsRedanSet.has(key) && !skyddade.has(key))
        .map(([, agg]) => {
          const rastMin = Math.round(agg.rastSek / 60);
          // OBS: arbetad_min är en GENERATED column (slut−start−rast) och får
          // inte sättas i insert — den gamla koden gjorde det, vilket fick
          // VARJE fallback-insert att faila (tyst, loggades bara). Utan
          // start/slut-tider blir arbetad_min null — ärligt: vi vet G15-tid
          // ur fakt_tid men inte klockslagen.
          return {
            medarbetare_id: agg.medarbetare_id,
            datum: agg.datum,
            dagtyp: 'normal',
            maskin_id: agg.maskin_id,
            objekt_id: agg.objekt_id,
            rast_min: rastMin,
            bekraftad: false,
          };
        });

      let fallbackCreated = 0;
      if (fallbackRows.length) {
        const { data: fbInserted, error: fbErr } = await supabase
          .from('arbetsdag')
          .insert(fallbackRows)
          .select('id');
        if (fbErr) {
          console.error('Fallback arbetsdag insert error:', fbErr.message);
        }
        fallbackCreated = fbInserted?.length || 0;
      }

      return NextResponse.json({
        created: (inserted?.length || 0) + fallbackCreated,
        skipped: skyddade.size,
        fallback: fallbackCreated,
        message: `${(inserted?.length || 0) + fallbackCreated} arbetsdagar skapade/uppdaterade (varav ${fallbackCreated} från fakt_tid)`,
      });
    }

    return NextResponse.json({
      created: inserted?.length || 0,
      skipped: skyddade.size,
      message: `${inserted?.length || 0} arbetsdagar skapade/uppdaterade`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Okänt fel';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
