"use client";
// Läser det Översikten och menyns siffra behöver, en källa i taget — en källa som fallerar blir en egen rad
// ("Kunde inte kontrollera …"), aldrig en tyst nolla. Uppbyggnaden av raderna är ren (lib/admin/attGora).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ymdLokal } from "@/lib/datumLokal";
import { franGolv } from "@/lib/skarpStart";
import { useDatahalsa } from "@/app/datahalsa/useDatahalsa";
import { laddaVilobrottLista, type VilobrottRad } from "@/lib/admin/vilobrottLista";
import {
  byggAttGora, raknaLonLage, type AttGoraIndata, type Kalla, type Sak,
  type Person, type MaskinRad, type LonLage, type AvtalRad, type ArbetstidSvar,
} from "@/lib/admin/attGora";
import type { MedarbetarKontroller } from "@/lib/medarbetarKontroll";
import type { ArbetstidForare } from "@/lib/arbetstidsgranser";

const tom = <T,>(): Kalla<T> => ({ data: null, fel: null });
const felText = (e: any) => String(e?.message || e);

async function las<T>(f: () => Promise<T>): Promise<Kalla<T>> {
  try { return { data: await f(), fel: null }; } catch (e) { return { data: null, fel: felText(e) }; }
}

export type AttGora = {
  laddar: boolean; saker: Sak[]; ladda: () => void;
  /** Förare som är gula eller röda på en arbetstidsgräns (röda först) och läsfel som påverkar talen. */
  arbetstid: ArbetstidForare[]; arbetstidVarningar: string[];
  /** Alla vilobrott i fönstret (med dagarna de gäller) — arket som en vilobrottsrad öppnar läser ur dem. Tom tills de lästs. */
  vilobrott: VilobrottRad[];
};

export function useAttGora(): AttGora {
  const dh = useDatahalsa();
  const [indata, setIndata] = useState<Omit<AttGoraIndata, "leverans">>({
    kontroller: tom(), personer: tom(), maskiner: tom(), lon: tom(), vilobrott: tom(), avtal: tom(), arbetstid: tom(),
  });
  const [klart, setKlart] = useState(false);
  const [omgang, setOmgang] = useState(0);
  const ladda = useCallback(() => setOmgang(n => n + 1), []);

  useEffect(() => {
    let avbruten = false;
    setKlart(false);
    (async () => {
      const nu = new Date();
      const idag = ymdLokal(nu);
      const igar = ymdLokal(new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 1));
      // Löneperiod = arbetsmånad + 1: den månad som just avslutats är den som ska granskas och skickas.
      const arbStartDatum = new Date(nu.getFullYear(), nu.getMonth() - 1, 1);
      const arbetsManad = ymdLokal(arbStartDatum).slice(0, 7);
      const loneperiod = idag.slice(0, 7);
      const fran = franGolv(`${arbetsManad}-01`);

      // Vilka förare som har dagar i arbetsmånaden: dem lönen gäller.
      const arbetsdagar = las(async () => {
        const r = await supabase.from("arbetsdag").select("medarbetare_id, datum").gte("datum", fran).lte("datum", igar);
        if (r.error) throw r.error;
        return (r.data || []) as { medarbetare_id: string; datum: string }[];
      });

      const [kontroller, personer, maskiner, ad, logg, underlag, ledare, vilobrott, avtal, arbetstid] = await Promise.all([
        las<MedarbetarKontroller>(async () => {
          const r = await fetch("/api/medarbetare/kontroller", { cache: "no-store" });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
          return j as MedarbetarKontroller;
        }),
        las<Person[]>(async () => {
          const r = await supabase.from("medarbetare").select("id, namn, user_id").order("namn");
          if (r.error) throw r.error;
          return (r.data || []) as Person[];
        }),
        las<MaskinRad[]>(async () => {
          const r = await supabase.from("dim_maskin").select("maskin_id, visningsnamn, modell, bekraftad, aktiv_till");
          if (r.error) throw r.error;
          return (r.data || []) as MaskinRad[];
        }),
        arbetsdagar,
        las(async () => {
          const r = await supabase.from("fortnox_export_logg").select("medarbetare_id, status").eq("period", loneperiod);
          if (r.error) throw r.error;
          return (r.data || []) as { medarbetare_id: string; status: string }[];
        }),
        // Förarens godkännande av månaden (samma tabell som exporten och Arbetsrapport läser): NULL/tom status = väntar.
        las(async () => {
          const r = await supabase.from("loneunderlag").select("medarbetare_id, status").eq("period", arbetsManad);
          if (r.error) throw r.error;
          return (r.data || []) as { medarbetare_id: string; status: string | null }[];
        }),
        // Företagsledare har ingen lön i appen och räknas inte. Ett läsfel är ett fel, aldrig "ingen är ledare".
        las(async () => {
          const r = await supabase.from("medarbetare").select("id, foretagsledare");
          if (r.error) throw r.error;
          return (r.data || []) as { id: string; foretagsledare: boolean | null }[];
        }),
        las(() => laddaVilobrottLista(nu)),
        las<AvtalRad | null>(async () => {
          const r = await supabase.from("gs_avtal").select("giltigt_till").order("giltigt_fran", { ascending: false }).limit(1).maybeSingle();
          if (r.error) throw r.error;
          return (r.data as AvtalRad | null) ?? null;
        }),
        // Arbetstid: lagens sex gränser per förare. Ett läsfel är en sak att åtgärda, aldrig "ingen gräns nådd".
        las<ArbetstidSvar>(async () => {
          const r = await fetch("/api/lon/arbetstid", { cache: "no-store" });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) throw new Error(j.meddelande || `HTTP ${r.status}`);
          return { forare: j.forare || [], varningar: j.varningar || [] };
        }),
      ]);
      if (avbruten) return;

      const fel = ad.fel ?? logg.fel ?? underlag.fel ?? ledare.fel;
      const lon: Kalla<LonLage> = fel ? { data: null, fel }
        : {
            data: raknaLonLage({
              arbetsManad,
              medDagar: (ad.data || []).filter(d => d.datum.startsWith(arbetsManad)).map(d => d.medarbetare_id),
              foretagsledare: (ledare.data || []).filter(m => m.foretagsledare === true).map(m => m.id),
              underlag: underlag.data || [],
              skickade: (logg.data || []).filter(l => l.status === "skickat").map(l => l.medarbetare_id),
            }),
            fel: null,
          };

      setIndata({ kontroller, personer, maskiner, lon, vilobrott, avtal, arbetstid });
      setKlart(true);
    })();
    return () => { avbruten = true; };
  }, [omgang]);

  const leverans: Kalla<AttGoraIndata["leverans"]["data"]> = { data: dh.leverans.data ?? null, fel: dh.leverans.fel ?? null };
  const laddar = !klart || dh.leverans.laddar;

  const byggt = useMemo(() => {
    if (laddar) return { saker: [] as Sak[], arbetstid: [] as ArbetstidForare[], arbetstidVarningar: [] as string[] };
    return byggAttGora({ ...indata, leverans: leverans as AttGoraIndata["leverans"] }, ymdLokal(new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laddar, indata, dh.leverans.data, dh.leverans.fel]);

  return { laddar, saker: byggt.saker, arbetstid: byggt.arbetstid, arbetstidVarningar: byggt.arbetstidVarningar, vilobrott: indata.vilobrott.data ?? [], ladda };
}
