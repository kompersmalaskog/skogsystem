'use client';

// Skotarens lassrapportering: kopplar detektorn (lib/skotarLass/lossning), lassmodellen och den lokala kön till skotarkörvyn.
// Appen vet att maskinen lossar, aldrig VAD: lassen förifylls som förra lasset men INGET bekräftas av sig självt — föraren trycker Stämmer
// (Daniels 14 självbekräftade lass blev kopior av "Timmer Vislanda 20 m³"). Lämnar han avlägget utan svar väntar lasset i "N lass väntar på dig".
//
// Alla ändringar sparas lokalt FÖRST (kön) — täckning behövs aldrig för att rapportera. Inget fel visas för föraren på grund av nätet.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { serverNu } from '@/lib/serverKlocka';
import { lokaltDatumStockholm } from '@/lib/hyttspar';
import { hamtaAltNummer, hogarObjektIds } from '@/lib/objektNummer';
import { supabase } from '@/lib/supabase';
import { AVLAGG, byggAvlagg, nastaEgnaNummer, type EgenMarkering, type VidaPunkt } from '@/lib/skotarLass/avlagg';
import { avlaggFlytt, stoppMitt } from '@/lib/skotarLass/lossaHar';
import { avstand, avstandTillLinje } from '@/lib/skotarLass/geo';
import {
  avvisaFraga, lossningManuell, lossningVidNyttAvlagg, nyDetektor, sattSenasteAvlagg, slutaOppenLossning, stegaDetektor,
  type DetektorState, type Handelse, type SlutHandelse,
} from '@/lib/skotarLass/lossning';
import {
  andraRad as andraRadModell, bekrafta, bytAvlagg, forraLass, kanBekrafta, laggTillDel, nastaLassNummer, skapaLass, stryk,
  type LassKontext,
} from '@/lib/skotarLass/lassModell';
import { beraknaKvar, idagText, kvarSammanfattning, skalningsfaktorer, type Kvar, type KvarSammanfattning } from '@/lib/skotarLass/kvar';
import { hamtaLassKo, begarFardigskotad, lasAvslut, lasLassForObjekt, lasOptiLass, lasSkordat, lasSkotningAvslutad, prenumereraLassKo, sparaLass } from '@/lib/skotarLass/koKopplad';
import { optiForAvslut, type OptiLass } from '@/lib/skotarLass/opti';
import type { Avslut } from '@/lib/skotarLass/server';
import { tunnaSpar, vagTider, type RaFix, type VagLinje } from '@/lib/skotarLass/spar';
import { forslagTillVantande } from '@/lib/skotarLass/lassModell';
import { valbaraSortiment, VED_MARKAGARE_NYCKEL, type SkordatSortiment } from '@/lib/skotarLass/sortiment';
import type { Avlagg, Lass, SortimentRad } from '@/lib/skotarLass/typer';

export type KortFas =
  | 'lossar'        // lossningen pågår: "Lossar → Avlägg 01-1" med löpande tid + frågan (Samma som förra … Stämmer / Ändra / ✕, eller Fyll i). Står kvar tills svar eller tills maskinen lämnat avlägget.
  | 'klar'          // föraren svarade Stämmer: ett kvitto en kort stund
  | 'avlagg_val';   // två avlägg nära varandra: stora knappar

/** Kvittot "✓ Lass 7 lossat" efter Stämmer står så här länge (ms). Lasset är redan bekräftat — det är ingen timer att vänta på. */
export const KVITTO_MS = 6_000;

/** `andrad`: föraren har ändrat sortimenten (då står det inte längre "Samma som förra"). */
export interface LossningsKort { lassId: string; delNr: number; fas: KortFas; start: number; andrad?: boolean }
/** `via`: frågan kom av ett tryck på "Lossa här" — avlägget märks då och flyttas senare mot snittet av lossningarna. */
export interface NyttAvlaggFraga { lat: number; lng: number; ts: number; via?: 'lossa_har' }

export interface SkotarLassIn {
  /** skotarKorvy + valt objekt + maskin vald (enhetens eller testlägets). */
  aktiv: boolean;
  /** Testläget (admin: /maskin?som=): lassen bor bara i minnet — inget skickas, ingen riktig kö rörs, Färdigskotad skrivs aldrig. */
  torr?: boolean;
  objekt: { id: string; vo: string | null; namn: string } | null;
  maskinId: string | null;
  medarbetareId: string | null;
  /** Senaste GPS-fix (rå, inte hyttspåret). */
  position: { lat: number; lon: number } | null;
  vida: readonly VidaPunkt[];
  egna: readonly EgenMarkering[];
  /** Skördarens stråk som linjer (för "Nytt avlägg här?" och tid per väg). Läses vid behov. */
  hamtaVagar: () => VagLinje[];
  /** Skapar en egen avläggsmarkering på platsen (synlig för alla direkt via markeringssynken). Ger markeringens id. */
  skapaEgetAvlagg: (lat: number, lng: number, nummer: string, via?: 'lossa_har') => string | null;
  /** Flyttar ett avlägg som skapats via Lossa här (markeringens id). Rör aldrig något annat avlägg. */
  flyttaEgetAvlagg?: (markerId: string, lat: number, lng: number) => void;
  /** Ändras när trakten fått nya extra nummer (skördarens objekt kopplat): skördat och Opti-lass läses om. */
  omlasning?: number;
}

const KO_MAX_FIXAR = 3000;
const SENASTE_LOSSNING_MAX_MS = 2 * 3_600_000;

export function useSkotarLass(i: SkotarLassIn) {
  const { aktiv, objekt, maskinId, medarbetareId, position } = i;
  const torr = !!i.torr;
  const [lass, setLass] = useState<Lass[]>([]);
  const [skordat, setSkordat] = useState<SkordatSortiment[] | null>(null);
  const [skordatLaddat, setSkordatLaddat] = useState(false);
  // Opti-lassen (fakt_lass) och om skotningen redan är avslutad på trakten. null = ej läst / kunde inte läsas — då visas ingen kvar (aldrig en gissning).
  const [opti, setOpti] = useState<OptiLass[] | null>(null);
  const [skotningAvslutad, setSkotningAvslutad] = useState<boolean | null>(null);
  const [avslut, setAvslut] = useState<Avslut | null>(null);
  const [kort, setKort] = useState<LossningsKort | null>(null);
  const [nyttAvlagg, setNyttAvlagg] = useState<NyttAvlaggFraga | null>(null);
  const [andra, setAndra] = useState<{ lassId: string; delNr: number } | null>(null);
  const [vantande, setVantande] = useState(0);
  // Lossningen som pågår just nu (lasset och delen som skapades när maskinen stått still 3 min eller föraren tryckte "Lossa här").
  const [oppen, setOppen] = useState<{ lassId: string; delNr: number } | null>(null);
  const oppenRef = useRef<{ lassId: string; delNr: number } | null>(null);
  oppenRef.current = oppen;
  const andradeRef = useRef<Set<string>>(new Set());   // lass vars sortiment föraren ändrat (kortet säger då inte "Samma som förra")
  const ursprungRef = useRef<Lass | null>(null);   // lasset som det var när Ändra öppnades (Avbryt återställer)

  const lassRef = useRef<Lass[]>([]);
  lassRef.current = lass;
  const inRef = useRef(i);
  inRef.current = i;
  const detRef = useRef<DetektorState>(nyDetektor());
  const fixarRef = useRef<RaFix[]>([]);
  const senastePosRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const avlagg = useMemo<Avlagg[]>(() => byggAvlagg(i.vida, i.egna), [i.vida, i.egna]);
  const avlaggRef = useRef(avlagg);
  avlaggRef.current = avlagg;

  const objektId = objekt?.id ?? null;

  // ── Läs in: lokalt först, sedan servern ──────────────────────────────────────────────────────────────
  const ladda = useCallback(async () => {
    if (!objektId) return;
    const ut = await lasLassForObjekt(objektId, torr);
    if (inRef.current.objekt?.id === objektId) setLass(ut.lass);
  }, [objektId, torr]);

  useEffect(() => {
    if (!aktiv || !objektId) { setLass([]); setSkordat(null); setSkordatLaddat(false); setOpti(null); setSkotningAvslutad(null); setAvslut(null); setKort(null); setOppen(null); setNyttAvlagg(null); setAndra(null); return; }
    let avbruten = false;
    (async () => {
      const k = await hamtaLassKo(torr);
      // Lokalt visas direkt (även utan nät). Ett förslag vars lossning aldrig tog slut (appen stängdes) bekräftar inte sig självt: det väntar på föraren.
      const lokalt = await k.lassForObjekt(objektId);
      const nu = serverNu();
      for (const l of lokalt) { const b = forslagTillVantande(l, nu); if (b !== l) await sparaLass(b, torr); }
      if (avbruten) return;
      const efter = await k.lassForObjekt(objektId);
      setLass(efter);
      // Detektorn börjar där förra lossningen skedde (omladdning vid avlägget ger inte ett nytt lass).
      const mitt = efter.filter((l) => l.maskinId === inRef.current.maskinId && l.status !== 'struket');
      const sista = mitt.sort((a, b) => b.lassNummer - a.lassNummer)[0];
      const del = sista?.delar[sista.delar.length - 1];
      // Bara en färsk lossning (≤ 2 h) minns detektorn: en lossning från i går är ingen "förra lossning" — att stå vid ett annat avlägg i dag är ett nytt lass, inte del 2.
      const farsk = del && nu - Date.parse(del.lossadTid) <= SENASTE_LOSSNING_MAX_MS;
      detRef.current = nyDetektor(del && farsk ? { lat: del.lat, lng: del.lng, ts: Date.parse(del.lossadTid), avlaggId: del.avlaggId } : null);
      fixarRef.current = [];
      setOppen(null);
      void ladda().then(() => { if (!avbruten) void k.antalVantande().then((n) => setVantande(n)); });
    })();
    return () => { avbruten = true; };
  }, [aktiv, objektId, ladda, torr]);

  // Servern: lass från alla skotare på trakten, jämnt (en annan maskin kan ha kört lass) och när kön ändrats.
  useEffect(() => {
    if (!aktiv || !objektId) return;
    const iv = window.setInterval(() => { if (document.visibilityState === 'visible') void ladda(); }, 60_000);
    const av = prenumereraLassKo(() => {
      void (async () => {
        const k = await hamtaLassKo(torr);
        const ls = await k.lassForObjekt(objektId);
        setLass(ls);
        setVantande(await k.antalVantande());
      })();
    });
    return () => { window.clearInterval(iv); av(); };
  }, [aktiv, objektId, ladda, torr]);

  // Skördat och avslut: en gång per trakt (skördat ändras bara när nya filer kommer; avslut när föraren avslutar).
  useEffect(() => {
    if (!aktiv || !objekt?.id) return;
    let avbruten = false;
    (async () => {
      const vo = objekt.vo;
      if (vo) {
        const alt = await hamtaAltNummer(supabase, objekt.id);
        const ids = hogarObjektIds(vo, alt);
        const [s, o, sa] = await Promise.all([lasSkordat(vo, ids), lasOptiLass(vo, ids), lasSkotningAvslutad(vo, ids)]);
        if (!avbruten) { setSkordat(s); setOpti(o); setSkotningAvslutad(sa); setSkordatLaddat(true); }
      } else if (!avbruten) { setSkordat(null); setOpti(null); setSkotningAvslutad(null); setSkordatLaddat(true); }
      const a = await lasAvslut(objekt.id);
      if (!avbruten) setAvslut(a);
    })();
    return () => { avbruten = true; };
  }, [aktiv, objekt?.id, objekt?.vo, i.omlasning]);

  // ── Spara ett lass (lokalt först) och uppdatera vyn direkt ───────────────────────────────────────────
  const spara = useCallback((l: Lass) => {
    setLass((prev) => (prev.some((x) => x.id === l.id) ? prev.map((x) => (x.id === l.id ? l : x)) : [...prev, l]));
    lassRef.current = lassRef.current.some((x) => x.id === l.id) ? lassRef.current.map((x) => (x.id === l.id ? l : x)) : [...lassRef.current, l];
    void sparaLass(l, inRef.current.torr);
  }, []);

  const kontext = useCallback((): LassKontext | null => {
    const o = inRef.current.objekt; const m = inRef.current.maskinId;
    return o && m ? { objektId: o.id, voNummer: o.vo, maskinId: m, medarbetareId: inRef.current.medarbetareId } : null;
  }, []);

  // ── Lossning upptäckt ────────────────────────────────────────────────────────────────────────────────
  const hamtaLass = (id: string) => lassRef.current.find((x) => x.id === id) ?? null;

  /** Lossningen tog slut (maskinen lämnade avlägget). Är lasset inte bekräftat av föraren väntar det på honom ("N lass väntar på dig") — ingenting bekräftar sig självt. */
  const hanteraSlut = useCallback((_h: SlutHandelse) => {
    const o = oppenRef.current;
    oppenRef.current = null;
    setOppen(null);
    if (!o) return;
    const l = hamtaLass(o.lassId);
    if (!l || l.status === 'struket') { setKort((k) => (k && k.lassId === o.lassId ? null : k)); return; }
    if (l.status === 'bekraftat') return;   // föraren svarade redan (kvittot har sin egen timer)
    if (l.status === 'foreslaget') spara({ ...l, status: 'vantar_forare', andrad: new Date(serverNu()).toISOString() });
    setKort((k) => (k && k.lassId === l.id && k.fas !== 'klar' ? null : k));   // lämnade avlägget utan svar: kortet försvinner, lasset ligger i väntelistan
  }, [spara]);

  const hanteraHandelse = useCallback((h: Handelse) => {
    const ctx = kontext();
    if (!ctx) return;
    const nu = serverNu();
    if (h.typ === 'lossning_slut') { hanteraSlut(h); return; }
    if (h.typ === 'nytt_avlagg_fraga') { setNyttAvlagg({ lat: h.lat, lng: h.lng, ts: h.ts }); return; }
    if (h.lossning === 'upprepning') return;

    const fixar = fixarRef.current.filter((f) => f.ts <= h.ts + 1000);
    // Lossningen pågår: kortet säger "Lossar → Avlägg X" med löpande tid (start = när maskinen stannade) och står kvar tills maskinen lämnat avlägget.
    const oppnaKort = (lassId: string, delNr: number, tvetydigt: boolean) => {
      setOppen({ lassId, delNr });
      oppenRef.current = { lassId, delNr };
      setKort({ lassId, delNr, fas: tvetydigt ? 'avlagg_val' : 'lossar', start: h.ts });
    };
    const nyttLassFran = (traff = h.traff) => {
      const forra = forraLass(lassRef.current, ctx.maskinId, ctx.objektId);
      const l = skapaLass({
        ctx, lassNummer: nastaLassNummer(lassRef.current, ctx.maskinId, ctx.objektId), ts: h.ts, lat: h.lat, lng: h.lng, traff, forra,
        sparPunkter: tunnaSpar(fixar), vagar: vagTider(fixar, inRef.current.hamtaVagar()), nu,
      });
      fixarRef.current = fixarRef.current.filter((f) => f.ts >= h.ts);
      spara(l);
      oppnaKort(l.id, 1, traff.tvetydigt);
    };

    if (h.lossning === 'ny_del') {
      const forra = forraLass(lassRef.current, ctx.maskinId, ctx.objektId);
      if (!forra) { nyttLassFran(); return; }
      const l = laggTillDel(forra, { ts: h.ts, lat: h.lat, lng: h.lng, traff: h.traff, nu });
      spara(l);
      oppnaKort(l.id, l.delar[l.delar.length - 1].delNr, h.traff.tvetydigt);
      return;
    }
    nyttLassFran();
  }, [kontext, spara, hanteraSlut]);

  // ── Matning: varje GPS-fix + en puls (stillastående ger inga nya fixar som skiljer sig) ──────────────────
  const stega = useCallback((pos: { lat: number; lng: number }, ts: number) => {
    const linjer = inRef.current.hamtaVagar();
    let avstSpar: number | undefined;
    if (linjer.length) { avstSpar = Infinity; for (const v of linjer) avstSpar = Math.min(avstSpar, avstandTillLinje(pos, v.linje)); }
    const r = stegaDetektor(detRef.current, { lat: pos.lat, lng: pos.lng, ts }, { avlagg: avlaggRef.current, avstandTillSpar: avstSpar });
    detRef.current = r.state;
    if (r.handelse) hanteraHandelse(r.handelse);
  }, [hanteraHandelse]);

  useEffect(() => {
    if (!aktiv || !objektId || !maskinId || !position) return;
    const ts = serverNu();
    senastePosRef.current = { lat: position.lat, lng: position.lon, at: Date.now() };
    const buf = fixarRef.current;
    buf.push({ lat: position.lat, lng: position.lon, ts });
    if (buf.length > KO_MAX_FIXAR) buf.splice(0, buf.length - KO_MAX_FIXAR);
    stega({ lat: position.lat, lng: position.lon }, ts);
  }, [aktiv, objektId, maskinId, position, stega]);

  useEffect(() => {
    if (!aktiv || !objektId || !maskinId) return;
    const iv = window.setInterval(() => {
      const p = senastePosRef.current;
      // Bara en färsk fix (≤ 10 s): ingen position = ingen lossning, och vi hittar aldrig på stillastående.
      if (p && Date.now() - p.at <= 10_000) stega({ lat: p.lat, lng: p.lng }, serverNu());
    }, 2000);
    return () => window.clearInterval(iv);
  }, [aktiv, objektId, maskinId, stega]);

  // ── Kortet: kvittot "✓ Lass 7 lossat" försvinner av sig självt (lasset är redan bekräftat). Inget annat kort har någon timer. ──────────────────
  useEffect(() => {
    if (!kort || kort.fas !== 'klar') return;
    const t = window.setTimeout(() => setKort((k) => (k && k.lassId === kort.lassId && k.fas === 'klar' ? null : k)), KVITTO_MS);
    return () => window.clearTimeout(t);
  }, [kort]);

  // ── Föraren ──────────────────────────────────────────────────────────────────────────────────────────
  const oppnaAndra = useCallback((lassId: string, delNr?: number) => {
    const l = hamtaLass(lassId);
    if (!l) return;
    setKort(null);   // Ändra tar över kortet
    ursprungRef.current = l;
    setAndra({ lassId, delNr: delNr ?? l.delar[l.delar.length - 1].delNr });
  }, []);

  /** Pågår lossningen fortfarande när Ändra stängs står kortet "Lossar → …" kvar. */
  const aterLossarKort = useCallback((lassId: string) => {
    const o = oppenRef.current;
    if (!o || o.lassId !== lassId) return;
    const del = hamtaLass(lassId)?.delar.find((d) => d.delNr === o.delNr);
    if (del) setKort({ lassId, delNr: o.delNr, fas: 'lossar', start: Date.parse(del.lossadTid), andrad: andradeRef.current.has(lassId) });
  }, []);

  const stangAndra = useCallback((klar: boolean) => {
    if (andra && klar) {
      const l = hamtaLass(andra.lassId);
      if (l && kanBekrafta(l)) spara(bekrafta(l, 'forare', serverNu()));
    }
    if (andra) aterLossarKort(andra.lassId);
    setAndra(null);
  }, [andra, spara, aterLossarKort]);

  /** Avbryt: lasset återställs till hur det var när Ändra öppnades (ändringarna sparas live, så de måste tas tillbaka). */
  const avbrytAndra = useCallback(() => {
    const u = ursprungRef.current;
    if (u && andra && u.id === andra.lassId) {
      const nu = serverNu();
      const tillbaka = { ...u, andrad: new Date(nu).toISOString() };
      // Avbryt bekräftar ingenting. Hann lossningen ta slut medan Ändra var öppet väntar lasset på föraren (inte kvar som ett förslag).
      spara(oppenRef.current?.lassId === u.id ? tillbaka : forslagTillVantande(tillbaka, nu));
      andradeRef.current.delete(u.id);
    }
    ursprungRef.current = null;
    if (andra) aterLossarKort(andra.lassId);
    setAndra(null);
  }, [andra, spara, aterLossarKort]);

  const andraRad = useCallback((delNr: number, rad: Pick<SortimentRad, 'nyckel' | 'namn'>, delta: number) => {
    if (!andra) return;
    const l = hamtaLass(andra.lassId);
    if (l) { spara(andraRadModell(l, delNr, rad, delta, serverNu())); andradeRef.current.add(l.id); }
  }, [andra, spara]);

  const valjAvlagg = useCallback((lassId: string, delNr: number, a: Avlagg) => {
    const l = hamtaLass(lassId);
    if (!l) return;
    const ny = bytAvlagg(l, delNr, a, serverNu());
    spara(ny);
    detRef.current = sattSenasteAvlagg(detRef.current, a.id);
    // Efter valet: pågår lossningen står kortet "Lossar → …" kvar, annars väntar lasset på ett tryck (Stämmer) eller på att föraren fyller i.
    const del = ny.delar.find((d) => d.delNr === delNr);
    const pagar = oppenRef.current?.lassId === lassId && oppenRef.current.delNr === delNr;
    setKort((k) => (k && k.lassId === lassId
      ? (pagar ? { ...k, fas: 'lossar' as const, start: del ? Date.parse(del.lossadTid) : serverNu() } : null)
      : k));
    if (!pagar && ny.status === 'foreslaget') spara(forslagTillVantande(ny, serverNu()));
  }, [spara]);

  const strykLass = useCallback((lassId: string) => {
    const l = hamtaLass(lassId);
    if (l) spara(stryk(l, serverNu()));
    // Det var ingen lossning: detektorn slutar räkna den som pågående (en senare, äkta lossning ska inte spärras av cykelregeln).
    if (oppenRef.current?.lassId === lassId) {
      detRef.current = { ...detRef.current, oppen: null, slut: null };
      oppenRef.current = null; setOppen(null);
    }
    setKort(null); setAndra(null);
  }, [spara]);

  /** "Stämmer" — det enda sättet ett lass blir bekräftat (utom Klar i Ändra): på kortet medan han lossar, eller på raden i "N lass väntar på dig". */
  const stammer = useCallback((lassId: string) => {
    const l = hamtaLass(lassId);
    if (!l || !kanBekrafta(l)) return;
    const nu = serverNu();
    spara(bekrafta(l, 'forare', nu));
    andradeRef.current.delete(lassId);
    setKort((k) => (k && k.lassId === lassId ? { ...k, fas: 'klar', start: nu } : k));
  }, [spara]);

  /** "Nytt avlägg här?" — Ja: ett eget avlägg på platsen (synligt för alla direkt) och lossningen räknas dit. */
  const svaraNyttAvlagg = useCallback((ja: boolean) => {
    const f = nyttAvlagg;
    setNyttAvlagg(null);
    if (!f) return;
    if (!ja) { detRef.current = avvisaFraga(detRef.current, f); return; }
    const ctx = kontext();
    if (!ctx) return;
    const nummer = nastaEgnaNummer(avlaggRef.current);
    const markerId = inRef.current.skapaEgetAvlagg(f.lat, f.lng, nummer, f.via);
    if (!markerId) return;
    const nytt: Avlagg = { id: `egen:${markerId}`, nummer, kalla: 'egen', lat: f.lat, lng: f.lng, ...(f.via === 'lossa_har' ? { viaLossaHar: true } : {}) };
    avlaggRef.current = [...avlaggRef.current, nytt];
    const r = lossningVidNyttAvlagg(detRef.current, { lat: f.lat, lng: f.lng, ts: f.ts }, nytt.id);
    detRef.current = r.state;
    hanteraHandelse({
      typ: 'lossning', lossning: r.lossning, ts: f.ts, lat: f.lat, lng: f.lng,
      traff: { narmaste: nytt, avstandM: 0, kandidater: [nytt], tvetydigt: false },
    });
  }, [nyttAvlagg, kontext, hanteraHandelse]);

  // ── Avlägg som skapats via Lossa här flyttas mot snittet av lossningarna ──────────────────────────────────────────────────────────────────────
  // Efter ≥ 3 bekräftade lass vid avlägget (lib/skotarLass/lossaHar). Aldrig medan en lossning pågår vid det (zonen ska inte flytta sig under maskinen),
  // aldrig i torrkörningen, aldrig Vidas, planerarens eller handsatta avlägg. Ett lass räknas en gång: efter flytten ligger snittet på avlägget.
  useEffect(() => {
    if (!aktiv || torr) return;
    for (const a of avlagg) {
      const f = avlaggFlytt(a, lass);
      if (!f || detRef.current.oppen?.avlaggId === a.id) continue;
      inRef.current.flyttaEgetAvlagg?.(a.id.replace(/^egen:/, ''), f.lat, f.lng);
    }
  }, [aktiv, torr, avlagg, lass, oppen]);

  // ── Kvar, klar-dag, idag ─────────────────────────────────────────────────────────────────────────────
  const idagIso = lokaltDatumStockholm(serverNu());
  // Kvar kräver BÅDE skördat och Opti-lassen (skotat före appens start): kan någon inte läsas finns ingen kvar att visa.
  // En trakt där skotningen redan är avslutad (skotning_avslutad satt, hur den än sattes) visar ingen kvar.
  const kvar = useMemo<Kvar | null>(() => (skordat && opti && skotningAvslutad !== true ? beraknaKvar(skordat, lass, opti) : null), [skordat, opti, lass, skotningAvslutad]);
  const sammanfattning = useMemo<KvarSammanfattning | null>(() => (kvar ? kvarSammanfattning(kvar, lass, idagIso, opti ?? []) : null), [kvar, lass, idagIso, opti]);
  const idag = useMemo(() => idagText(lass, idagIso, maskinId ?? ''), [lass, idagIso, maskinId]);
  const valbara = useMemo(() => (skordat ? valbaraSortiment(skordat, skordat.some((s) => s.nyckel === VED_MARKAGARE_NYCKEL)) : []), [skordat]);

  const fardigskotad = useCallback(async () => {
    // Utan skördat och Opti-lassen går det inte att räkna rätt (appens lass skalas mot skördat MINUS Opti före appens start): då skickas inget.
    if (!objektId || !skordat || !opti) return;
    const optiAv = optiForAvslut(skordat, opti, lassRef.current);
    await begarFardigskotad(objektId, torr, optiAv);
    const sk = skalningsfaktorer(skordat, lassRef.current, optiAv);
    setAvslut({ faktorer: sk.faktorer, tillagg: sk.tillagg, skillnadM3: 0, avslutadTid: new Date(serverNu()).toISOString() });
  }, [objektId, torr, skordat, opti]);

  /** Bara torrkörningen (testläget): låtsas att maskinen lossat vid avlägget `avlaggId` (annars det närmaste/första) — så hela flödet går att se vid skrivbordet,
   *  där ingen GPS rör sig. Första trycket börjar en lossning, nästa låtsas att maskinen kört ut ur zonen efter 10 min stilla (ett obesvarat lass går till väntelistan).
   *  Samma väg som en riktig lossning (kort, förifyllning, Ändra, kvar), men lagras bara i minnet. */
  const provkorLossning = useCallback((avlaggId: string | null) => {
    if (!inRef.current.torr) return;
    if (detRef.current.oppen) {
      const r = slutaOppenLossning(detRef.current, serverNu(), 600);
      detRef.current = r.state;
      if (r.handelse) hanteraHandelse(r.handelse);
      return;
    }
    const lista = avlaggRef.current;
    const p = senastePosRef.current;
    const a = lista.find((x) => x.id === avlaggId)
      ?? (p ? [...lista].sort((x, y) => avstand(p, x) - avstand(p, y))[0] : lista[0]);
    if (!a) return;
    const ts = serverNu();
    detRef.current = lossningVidNyttAvlagg({ ...detRef.current, slut: null }, { lat: a.lat, lng: a.lng, ts }, a.id).state;
    hanteraHandelse({ typ: 'lossning', lossning: 'nytt_lass', ts, lat: a.lat, lng: a.lng, traff: { narmaste: a, avstandM: 0, kandidater: [a], tvetydigt: false } });
  }, [hanteraHandelse]);

  /** "Lossa här" — reservknappen när upptäckten missar: ett nytt lass vid närmaste avlägg (cykelregeln gäller inte: föraren vet) med samma kort som en upptäckt
   *  lossning. Finns inget avlägg inom zonen (50 m) frågas "Nytt avlägg här?" — då läggs avlägget MITT PÅ STOPPET och märks (viaLossaHar). */
  const lossaHar = useCallback(() => {
    const ctx = kontext();
    if (!ctx) return;
    if (detRef.current.oppen) return;   // en lossning pågår redan: kortet har svaret
    const nu = serverNu();
    const p = senastePosRef.current;
    const farsk = p && Date.now() - p.at <= 120_000 ? p : null;
    // Där han står: mitten på stoppet (medelvärdet av de senaste fixarna om han stått still), inte där fingret råkade vara.
    const mitt = farsk ? stoppMitt(fixarRef.current, nu, farsk) : null;
    const lista = avlaggRef.current;
    const narmaste = mitt ? [...lista].sort((x, y) => avstand(mitt, x) - avstand(mitt, y))[0] : null;
    // Inget avlägg inom zonen: ett nytt avlägg MITT PÅ STOPPET (frågan "Nytt avlägg här?"), märkt så att det kan flyttas mot snittet av lossningarna.
    // Ett lass kopplat till ett avlägg 200 m bort vore fel.
    if (mitt && (!narmaste || avstand(mitt, narmaste) > AVLAGG.RADIE_M)) { setNyttAvlagg({ lat: mitt.lat, lng: mitt.lng, ts: nu, via: 'lossa_har' }); return; }
    if (lista.length === 0) return;
    const fran = mitt ?? { lat: lista[0].lat, lng: lista[0].lng };
    const a = [...lista].sort((x, y) => avstand(fran, x) - avstand(fran, y))[0];
    const lat = mitt?.lat ?? a.lat, lng = mitt?.lng ?? a.lng;
    detRef.current = lossningManuell(detRef.current, { lat, lng, ts: nu }, a.id);
    hanteraHandelse({ typ: 'lossning', lossning: 'nytt_lass', ts: nu, lat, lng, traff: { narmaste: a, avstandM: avstand({ lat, lng }, a), kandidater: [a], tvetydigt: false } });
  }, [kontext, hanteraHandelse]);

  /** Lass som väntar på föraren (inte det som kortet visar eller som lossas just nu): "N lass väntar på dig" med Stämmer / Fyll i / Stryk. */
  const vantarPaDig = useMemo(
    () => lass.filter((l) => l.maskinId === maskinId && l.status === 'vantar_forare' && l.id !== kort?.lassId && l.id !== oppen?.lassId)
      .sort((a, b) => a.lassNummer - b.lassNummer),
    [lass, maskinId, kort?.lassId, oppen?.lassId],
  );

  return {
    provkorLossning, lossaHar, stammer, vantarPaDig, oppen,
    lass, avlagg, kort, nyttAvlagg, andra, vantande, skordat, skordatLaddat, kvar, sammanfattning, idag, valbara, avslut, skotningAvslutad,
    oppnaAndra, stangAndra, avbrytAndra, andraRad, valjAvlagg, strykLass, svaraNyttAvlagg, fardigskotad, laddaOm: ladda,
    avbrytKort: () => setKort(null),
  };
}

export type SkotarLassVy = ReturnType<typeof useSkotarLass>;
