import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravInloggad } from "@/lib/auth/server";
import { summera, tolkaDaily, vaderUrl, type VaderSvar } from "@/app/uppfoljning/lib/vader";

/**
 * GET /api/uppfoljning/vader?vo=11277905&fran=2026-10-28&till=2026-11-21
 * Vädret på traktens punkt (objekt.lat/lng) under perioden: regn och kallaste/varmaste dag.
 * Alla inloggade. Källan är Open-Meteo (modell för punkten, fram till idag).
 * Ett svar sparas 6 h per serverinstans; ett fel sparas aldrig.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 6 * 3600e3;
const cache = new Map<string, { at: number; svar: VaderSvar }>();
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function svenskIdag(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

export async function GET(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  const sp = new URL(req.url).searchParams;
  const vo = sp.get("vo")?.trim();
  const fran = sp.get("fran") ?? "";
  const idag = svenskIdag();
  const till = (sp.get("till") ?? "") > idag ? idag : (sp.get("till") ?? "");
  if (!vo) return NextResponse.json({ ok: false, orsak: "saknar_plats" } satisfies VaderSvar);
  if (!DATUM.test(fran) || !DATUM.test(till) || fran > till) {
    return NextResponse.json({ ok: false, orsak: "saknar_datum" } satisfies VaderSvar);
  }

  const nyckel = `${vo}|${fran}|${till}`;
  const sparat = cache.get(nyckel);
  if (sparat && Date.now() - sparat.at < CACHE_MS) return NextResponse.json(sparat.svar);

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await sb.from("objekt").select("lat, lng").eq("vo_nummer", vo).not("lat", "is", null).limit(1);
  if (error) return NextResponse.json({ ok: false, orsak: "las", fel: error.message } satisfies VaderSvar, { status: 500 });
  const lat = Number(data?.[0]?.lat), lng = Number(data?.[0]?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: false, orsak: "saknar_plats" } satisfies VaderSvar);
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(vaderUrl(lat, lng, fran, till, idag), { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) throw new Error(`Open-Meteo svarade ${res.status}`);
    const svar: VaderSvar = { ok: true, summa: summera(tolkaDaily(await res.json()), fran, till) };
    cache.set(nyckel, { at: Date.now(), svar });
    return NextResponse.json(svar);
  } catch (e) {
    return NextResponse.json({ ok: false, orsak: "las", fel: (e as Error).message } satisfies VaderSvar, { status: 502 });
  }
}
