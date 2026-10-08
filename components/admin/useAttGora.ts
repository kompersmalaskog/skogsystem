"use client";
// Läser det Översikten och menyns siffra behöver, en källa i taget — en källa som fallerar blir en egen rad
// ("Kunde inte kontrollera …"), aldrig en tyst nolla. Uppbyggnaden av raderna är ren (lib/admin/attGora).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ymdLokal } from "@/lib/datumLokal";
import { franGolv } from "@/lib/skarpStart";
import { useDatahalsa } from "@/app/datahalsa/useDatahalsa";
import { laddaVilobrottLista } from "@/lib/admin/vilobrottLista";
import {
  byggAttGora, type AttGoraIndata, type Kalla, type Sak, type StammerRad,
  type Person, type MaskinRad, type ObekraftadDag, type LonLage, type AvtalRad,
} from "@/lib/admin/attGora";
import type { MedarbetarKontroller } from "@/lib/medarbetarKontroll";

const tom = <T,>(): Kalla<T> => ({ data: null, fel: null });
const felText = (e: any) => String(e?.message || e);

async function las<T>(f: () => Promise<T>): Promise<Kalla<T>> {
  try { return { data: await f(), fel: null }; } catch (e) { return { data: null, fel: felText(e) }; }
}

export type AttGora = { laddar: boolean; saker: Sak[]; stammer: StammerRad[]; ladda: () => void };

export function useAttGora(): AttGora {
  const dh = useDatahalsa();
  const [indata, setIndata] = useState<Omit<AttGoraIndata, "leverans">>({
    kontroller: tom(), personer: tom(), maskiner: tom(), obekraftade: tom(), lon: tom(), vilobrott: tom(), avtal: tom(),
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

      // En läsning av arbetsdag räcker för både "väntar på bekräftelse" och "är lönen klar" (samma månadsfönster).
      const arbetsdagar = las(async () => {
        const r = await supabase.from("arbetsdag").select("medarbetare_id, datum, start_tid, slut_tid, bekraftad").gte("datum", fran).lte("datum", igar);
        if (r.error) throw r.error;
        return (r.data || []) as { medarbetare_id: string; datum: string; start_tid: string | null; slut_tid: string | null; bekraftad: boolean | null }[];
      });

      const [kontroller, personer, maskiner, ad, logg, vilobrott, avtal] = await Promise.all([
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
        las(() => laddaVilobrottLista(nu)),
        las<AvtalRad | null>(async () => {
          const r = await supabase.from("gs_avtal").select("giltigt_till").order("giltigt_fran", { ascending: false }).limit(1).maybeSingle();
          if (r.error) throw r.error;
          return (r.data as AvtalRad | null) ?? null;
        }),
      ]);
      if (avbruten) return;

      // Dagar som väntar på bekräftelse: samma regel som förarens kö (Arbetsrapport.vantandeDagar), men över
      // hela den månad som granskas + innevarande: inte idag, inte bekräftad, och med klockslag.
      const obekraftade: Kalla<ObekraftadDag[]> = ad.fel ? { data: null, fel: ad.fel }
        : { data: (ad.data || []).filter(d => d.datum < idag && !d.bekraftad && (d.start_tid || d.slut_tid)).map(d => ({ medarbetare_id: d.medarbetare_id, datum: d.datum })), fel: null };

      const lon: Kalla<LonLage> = ad.fel ? { data: null, fel: ad.fel } : logg.fel ? { data: null, fel: logg.fel }
        : (() => {
            const medDagar = new Set((ad.data || []).filter(d => d.datum.startsWith(arbetsManad)).map(d => d.medarbetare_id));
            const skickade = new Set((logg.data || []).filter(l => l.status === "skickat" && medDagar.has(l.medarbetare_id)).map(l => l.medarbetare_id));
            return { data: { arbetsManad, antalMedDagar: medDagar.size, antalSkickade: skickade.size }, fel: null };
          })();

      setIndata({ kontroller, personer, maskiner, obekraftade, lon, vilobrott, avtal });
      setKlart(true);
    })();
    return () => { avbruten = true; };
  }, [omgang]);

  const leverans: Kalla<AttGoraIndata["leverans"]["data"]> = { data: dh.leverans.data ?? null, fel: dh.leverans.fel ?? null };
  const laddar = !klart || dh.leverans.laddar;

  const byggt = useMemo(() => {
    if (laddar) return { saker: [] as Sak[], stammer: [] as StammerRad[] };
    return byggAttGora({ ...indata, leverans: leverans as AttGoraIndata["leverans"] }, ymdLokal(new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laddar, indata, dh.leverans.data, dh.leverans.fel]);

  return { laddar, saker: byggt.saker, stammer: byggt.stammer, ladda };
}
