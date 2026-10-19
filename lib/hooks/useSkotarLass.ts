'use client';

// Skotarens lassrapportering: kopplar detektorn (lib/skotarLass/lossning), lassmodellen och den lokala kön till skotarkörvyn.
// Appen gör det den säkert vet (lossning vid avlägg → ett förifyllt lass som bekräftar sig självt), föraren bara det bara han vet
// (första lasset, två avlägg nära varandra, inget avlägg, hur ett lass delades på två avlägg).
//
// Alla ändringar sparas lokalt FÖRST (kön) — täckning behövs aldrig för att rapportera. Inget fel visas för föraren på grund av nätet.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { serverNu } from '@/lib/serverKlocka';
import { lokaltDatumStockholm } from '@/lib/hyttspar';
import { hamtaAltNummer, hogarObjektIds } from '@/lib/objektNummer';
import { supabase } from '@/lib/supabase';
import { byggAvlagg, nastaEgnaNummer, type EgenMarkering, type VidaPunkt } from '@/lib/skotarLass/avlagg';
import { avstand, avstandTillLinje } from '@/lib/skotarLass/geo';
import { avvisaFraga, lossningVidNyttAvlagg, nyDetektor, sattSenasteAvlagg, stegaDetektor, type DetektorState, type Handelse } from '@/lib/skotarLass/lossning';
import {
  AUTO_BEKRAFTA_MS, andraRad as andraRadModell, bekrafta, bytAvlagg, forraLass, kanBekrafta, laggTillDel, nastaLassNummer, skapaLass, stryk,
  type LassKontext,
} from '@/lib/skotarLass/lassModell';
import { beraknaKvar, idagText, kvarSammanfattning, type Kvar, type KvarSammanfattning } from '@/lib/skotarLass/kvar';
import { hamtaLassKo, begarFardigskotad, lasAvslut, lasLassForObjekt, lasOptiLass, lasSkordat, lasSkotningAvslutad, prenumereraLassKo, sparaLass } from '@/lib/skotarLass/koKopplad';
import type { OptiLass } from '@/lib/skotarLass/opti';
import type { Avslut } from '@/lib/skotarLass/server';
import { tunnaSpar, vagTider, type RaFix, type VagLinje } from '@/lib/skotarLass/spar';
import { bekraftaForslagVidStart } from '@/lib/skotarLass/lassModell';
import { valbaraSortiment, VED_MARKAGARE_NYCKEL, type SkordatSortiment } from '@/lib/skotarLass/sortiment';
import type { Avlagg, Lass, SortimentRad } from '@/lib/skotarLass/typer';

export type KortFas =
  | 'auto'          // förslag: linjen fylls och lasset bekräftar sig självt
  | 'forare'        // föraren måste fylla i (första lasset, del 2, tomt)
  | 'avlagg_val';   // två avlägg nära varandra: stora knappar

export interface LossningsKort { lassId: string; delNr: number; fas: KortFas; start: number }
export interface NyttAvlaggFraga { lat: number; lng: number; ts: number }

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
  skapaEgetAvlagg: (lat: number, lng: number, nummer: string) => string | null;
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
    if (!aktiv || !objektId) { setLass([]); setSkordat(null); setSkordatLaddat(false); setOpti(null); setSkotningAvslutad(null); setAvslut(null); setKort(null); setNyttAvlagg(null); setAndra(null); return; }
    let avbruten = false;
    (async () => {
      const k = await hamtaLassKo(torr);
      // Lokalt visas direkt (även utan nät); förslag som aldrig hann bekräfta sig bekräftas nu.
      const lokalt = await k.lassForObjekt(objektId);
      const nu = serverNu();
      for (const l of lokalt) { const b = bekraftaForslagVidStart(l, nu); if (b !== l) await sparaLass(b, torr); }
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
  }, [aktiv, objekt?.id, objekt?.vo]);

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
  const hanteraHandelse = useCallback((h: Handelse) => {
    const ctx = kontext();
    if (!ctx) return;
    const nu = serverNu();
    if (h.typ === 'nytt_avlagg_fraga') { setNyttAvlagg({ lat: h.lat, lng: h.lng, ts: h.ts }); return; }
    if (h.lossning === 'upprepning') return;

    const fixar = fixarRef.current.filter((f) => f.ts <= h.ts + 1000);
    const nyttLassFran = (traff = h.traff) => {
      const forra = forraLass(lassRef.current, ctx.maskinId, ctx.objektId);
      const l = skapaLass({
        ctx, lassNummer: nastaLassNummer(lassRef.current, ctx.maskinId, ctx.objektId), ts: h.ts, lat: h.lat, lng: h.lng, traff, forra,
        sparPunkter: tunnaSpar(fixar), vagar: vagTider(fixar, inRef.current.hamtaVagar()), nu,
      });
      fixarRef.current = fixarRef.current.filter((f) => f.ts >= h.ts);
      spara(l);
      setKort({ lassId: l.id, delNr: 1, fas: traff.tvetydigt ? 'avlagg_val' : l.status === 'foreslaget' ? 'auto' : 'forare', start: nu });
    };

    if (h.lossning === 'ny_del') {
      const forra = forraLass(lassRef.current, ctx.maskinId, ctx.objektId);
      if (!forra) { nyttLassFran(); return; }
      const l = laggTillDel(forra, { ts: h.ts, lat: h.lat, lng: h.lng, traff: h.traff, nu });
      spara(l);
      setKort({ lassId: l.id, delNr: l.delar[l.delar.length - 1].delNr, fas: h.traff.tvetydigt ? 'avlagg_val' : 'forare', start: nu });
      return;
    }
    nyttLassFran();
  }, [kontext, spara]);

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

  // ── Kortet: linjen fylls (10 s) och lasset bekräftar sig självt ──────────────────────────────────────────
  useEffect(() => {
    if (!kort || kort.fas !== 'auto') return;
    const t = window.setTimeout(() => {
      const l = lassRef.current.find((x) => x.id === kort.lassId);
      if (l) spara(bekrafta(l, 'auto', serverNu()));
      setKort(null);
    }, AUTO_BEKRAFTA_MS);
    return () => window.clearTimeout(t);
  }, [kort, spara]);

  // ── Föraren ──────────────────────────────────────────────────────────────────────────────────────────
  const hamtaLass = (id: string) => lassRef.current.find((x) => x.id === id) ?? null;

  const oppnaAndra = useCallback((lassId: string, delNr?: number) => {
    const l = hamtaLass(lassId);
    if (!l) return;
    setKort(null);   // Ändra tar över: kortet bekräftar sig inte längre självt
    ursprungRef.current = l;
    setAndra({ lassId, delNr: delNr ?? l.delar[l.delar.length - 1].delNr });
  }, []);

  const stangAndra = useCallback((klar: boolean) => {
    if (andra && klar) {
      const l = hamtaLass(andra.lassId);
      if (l && kanBekrafta(l)) spara(bekrafta(l, 'forare', serverNu()));
    }
    setAndra(null);
  }, [andra, spara]);

  /** Avbryt: lasset återställs till hur det var när Ändra öppnades (ändringarna sparas live, så de måste tas tillbaka). */
  const avbrytAndra = useCallback(() => {
    const u = ursprungRef.current;
    if (u && andra && u.id === andra.lassId) {
      const nu = serverNu();
      const tillbaka = { ...u, andrad: new Date(nu).toISOString() };
      // Ett förslag som föraren tittade på och lämnade orört är bekräftat (som om linjen fyllts).
      spara(u.status === 'foreslaget' ? bekrafta(tillbaka, 'auto', nu) : tillbaka);
    }
    ursprungRef.current = null;
    setAndra(null);
  }, [andra, spara]);

  const andraRad = useCallback((delNr: number, rad: Pick<SortimentRad, 'nyckel' | 'namn'>, delta: number) => {
    if (!andra) return;
    const l = hamtaLass(andra.lassId);
    if (l) spara(andraRadModell(l, delNr, rad, delta, serverNu()));
  }, [andra, spara]);

  const valjAvlagg = useCallback((lassId: string, delNr: number, a: Avlagg) => {
    const l = hamtaLass(lassId);
    if (!l) return;
    const ny = bytAvlagg(l, delNr, a, serverNu());
    spara(ny);
    detRef.current = sattSenasteAvlagg(detRef.current, a.id);
    // Efter valet: ett lass med sortiment bekräftar sig självt (förifyllt), annars fyller föraren i.
    setKort((k) => (k && k.lassId === lassId ? { ...k, fas: kanBekrafta(ny) && ny.status !== 'vantar_forare' ? 'auto' : 'forare', start: serverNu() } : k));
  }, [spara]);

  const strykLass = useCallback((lassId: string) => {
    const l = hamtaLass(lassId);
    if (l) spara(stryk(l, serverNu()));
    setKort(null); setAndra(null);
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
    const markerId = inRef.current.skapaEgetAvlagg(f.lat, f.lng, nummer);
    if (!markerId) return;
    const nytt: Avlagg = { id: `egen:${markerId}`, nummer, kalla: 'egen', lat: f.lat, lng: f.lng };
    avlaggRef.current = [...avlaggRef.current, nytt];
    const r = lossningVidNyttAvlagg(detRef.current, { lat: f.lat, lng: f.lng, ts: f.ts }, nytt.id);
    detRef.current = r.state;
    hanteraHandelse({
      typ: 'lossning', lossning: r.lossning, ts: f.ts, lat: f.lat, lng: f.lng,
      traff: { narmaste: nytt, avstandM: 0, kandidater: [nytt], tvetydigt: false },
    });
  }, [nyttAvlagg, kontext, hanteraHandelse]);

  // ── Kvar, klar-dag, idag ─────────────────────────────────────────────────────────────────────────────
  const idagIso = lokaltDatumStockholm(serverNu());
  // Kvar kräver BÅDE skördat och Opti-lassen (skotat före appens start): kan någon inte läsas finns ingen kvar att visa.
  // En trakt där skotningen redan är avslutad (skotning_avslutad satt, hur den än sattes) visar ingen kvar.
  const kvar = useMemo<Kvar | null>(() => (skordat && opti && skotningAvslutad !== true ? beraknaKvar(skordat, lass, opti) : null), [skordat, opti, lass, skotningAvslutad]);
  const sammanfattning = useMemo<KvarSammanfattning | null>(() => (kvar ? kvarSammanfattning(kvar, lass, idagIso, opti ?? []) : null), [kvar, lass, idagIso, opti]);
  const idag = useMemo(() => idagText(lass, idagIso, maskinId ?? ''), [lass, idagIso, maskinId]);
  const valbara = useMemo(() => (skordat ? valbaraSortiment(skordat, skordat.some((s) => s.nyckel === VED_MARKAGARE_NYCKEL)) : []), [skordat]);

  const fardigskotad = useCallback(async () => {
    if (!objektId) return;
    await begarFardigskotad(objektId, torr);
    setAvslut({ faktorer: {}, tillagg: {}, skillnadM3: 0, avslutadTid: new Date(serverNu()).toISOString() });
  }, [objektId, torr]);

  /** Bara torrkörningen (testläget): låtsas att maskinen lossat vid avlägget `avlaggId` (annars det närmaste/första) — så hela flödet går att se vid skrivbordet,
   *  där ingen GPS rör sig. Samma väg som en riktig lossning (kort, förifyllning, Ändra, kvar), men lagras bara i minnet. */
  const provkorLossning = useCallback((avlaggId: string | null) => {
    if (!inRef.current.torr) return;
    const lista = avlaggRef.current;
    const p = senastePosRef.current;
    const a = lista.find((x) => x.id === avlaggId)
      ?? (p ? [...lista].sort((x, y) => avstand(p, x) - avstand(p, y))[0] : lista[0]);
    if (!a) return;
    const ts = serverNu();
    detRef.current = { ...detRef.current, senaste: { lat: a.lat, lng: a.lng, ts, avlaggId: a.id }, lastat: false, lamnat: false };
    hanteraHandelse({ typ: 'lossning', lossning: 'nytt_lass', ts, lat: a.lat, lng: a.lng, traff: { narmaste: a, avstandM: 0, kandidater: [a], tvetydigt: false } });
  }, [hanteraHandelse]);

  return {
    provkorLossning,
    lass, avlagg, kort, nyttAvlagg, andra, vantande, skordat, skordatLaddat, kvar, sammanfattning, idag, valbara, avslut, skotningAvslutad,
    oppnaAndra, stangAndra, avbrytAndra, andraRad, valjAvlagg, strykLass, svaraNyttAvlagg, fardigskotad, laddaOm: ladda,
    avbrytKort: () => setKort(null),
    gorForare: (lassId: string) => setKort((k) => (k && k.lassId === lassId ? { ...k, fas: 'forare' } : k)),
  };
}

export type SkotarLassVy = ReturnType<typeof useSkotarLass>;
