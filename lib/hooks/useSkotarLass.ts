'use client';

// Skotarens lassrapportering: kopplar avläggszonen, lassmodellen och den lokala kön till skotarkörvyn.
//
// FÖRAREN REGISTRERAR SJÄLV — APPEN FRÅGAR ALDRIG (Martin 2026-10-26, efter Elefanten i Mölleryd: kortet kom upp 13 gånger, 2 var riktiga lass). Ett lass skapas
// bara av ett tryck: knappen "Lossa · Avlägg 2" (syns bara medan maskinen står i ett avläggs zon) eller + › Registrera lass (där inget avlägg finns). Zonen
// (lib/skotarLass/zon) avgör bara NÄR knappen syns och VILKET avlägg — den skapar aldrig ett lass, ingen kort kommer upp av sig självt, ingen nedräkning, ingen
// "N lass väntar på dig". Trycket öppnar lasskortet med sortimenten ifyllda som förra lasset; lasset är ett UTKAST i minnet tills föraren trycker Klar
// (då bekräftas och sparas det) — Avbryt kastar utkastet, så ett felaktigt tryck lämnar inget spår i databasen.
//
// Alla ändringar sparas lokalt FÖRST (kön) — täckning behövs aldrig för att rapportera. Inget fel visas för föraren på grund av nätet.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { serverNu } from '@/lib/serverKlocka';
import { lokaltDatumStockholm } from '@/lib/hyttspar';
import { hamtaAltNummer, hogarObjektIds } from '@/lib/objektNummer';
import { supabase } from '@/lib/supabase';
import { AVLAGG, byggAvlagg, nastaEgnaNummer, type EgenMarkering, type VidaPunkt } from '@/lib/skotarLass/avlagg';
import { avlaggFlytt, stoppMitt } from '@/lib/skotarLass/lossaHar';
import { avstand } from '@/lib/skotarLass/geo';
import { avlaggIZon, ZON, type ZonTraff } from '@/lib/skotarLass/zon';
import {
  andraRad as andraRadModell, bekrafta, bytAvlagg, forraLass, kanBekrafta, nastaLassNummer, skapaLass, stryk,
  type LassKontext,
} from '@/lib/skotarLass/lassModell';
import { beraknaKvar, harSkordat, idagText, kvarSammanfattning, skalningsfaktorer, type Kvar, type KvarSammanfattning } from '@/lib/skotarLass/kvar';
import { hamtaLassKo, begarFardigskotad, lasAvslut, lasLassForObjekt, lasObjektSortiment, lasOptiLass, lasSkordat, lasSkotningAvslutad, lasSortimentHistorik, prenumereraLassKo, sparaLass } from '@/lib/skotarLass/koKopplad';
import { optiForAvslut, type OptiLass } from '@/lib/skotarLass/opti';
import type { Avslut } from '@/lib/skotarLass/server';
import { tunnaSpar, vagTider, type RaFix, type VagLinje } from '@/lib/skotarLass/spar';
import { sortimentVal, traktAnvandning, type HistorikSortiment, type SkordatSortiment } from '@/lib/skotarLass/sortiment';
import type { Avlagg, Lass, SortimentRad } from '@/lib/skotarLass/typer';

/** `via`: frågan kom av ett tryck på Registrera lass — avlägget märks då och flyttas senare mot snittet av lossningarna. */
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
  // Sortimentlistan i Ändra får aldrig vara tom (skördaren kan ha lämnat ingenting än, privata jobb har inget Vida-underlag): objektets egna sortiment
  // och de vi använt senaste 12 månaderna är reserven. null = ej läst / kunde inte läsas.
  const [objektSortiment, setObjektSortiment] = useState<string[] | null>(null);
  const [historik, setHistorik] = useState<HistorikSortiment[] | null>(null);
  const [sortimentOm, setSortimentOm] = useState(0);
  // Opti-lassen (fakt_lass) och om skotningen redan är avslutad på trakten. null = ej läst / kunde inte läsas — då visas ingen kvar (aldrig en gissning).
  const [opti, setOpti] = useState<OptiLass[] | null>(null);
  const [skotningAvslutad, setSkotningAvslutad] = useState<boolean | null>(null);
  const [avslut, setAvslut] = useState<Avslut | null>(null);
  const [nyttAvlagg, setNyttAvlagg] = useState<NyttAvlaggFraga | null>(null);
  const [andra, setAndra] = useState<{ lassId: string; delNr: number } | null>(null);
  const [vantande, setVantande] = useState(0);
  // UTKASTET: lasset föraren håller på att registrera. Bor bara i minnet tills Klar (då bekräftas det och sparas); Avbryt kastar det. Räknas aldrig som skotat.
  const [utkast, setUtkast] = useState<Lass | null>(null);
  const utkastRef = useRef<Lass | null>(null);
  utkastRef.current = utkast;
  const utkastFranRef = useRef<number | null>(null);   // tiden fixarna ska klippas från när utkastet blir ett lass (spåret sedan förra lossningen)
  // Avläggszonen maskinen står i just nu (bara knappens text och mål) och avlägget som redan registrerats under det här besöket (knappen göms tills maskinen lämnat zonen).
  const [iZon, setIZon] = useState<ZonTraff | null>(null);
  const iZonRef = useRef<ZonTraff | null>(null);
  const registreratIZonRef = useRef<string | null>(null);
  const [registreratVersion, setRegistreratVersion] = useState(0);
  const ursprungRef = useRef<Lass | null>(null);   // lasset som det var när Ändra öppnades (Avbryt återställer) — gäller sparade lass, aldrig ett utkast

  const lassRef = useRef<Lass[]>([]);
  lassRef.current = lass;
  const inRef = useRef(i);
  inRef.current = i;
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
    if (!aktiv || !objektId) { setLass([]); setSkordat(null); setSkordatLaddat(false); setOpti(null); setSkotningAvslutad(null); setAvslut(null); setUtkast(null); utkastRef.current = null; setIZon(null); iZonRef.current = null; registreratIZonRef.current = null; setNyttAvlagg(null); setAndra(null); return; }
    let avbruten = false;
    (async () => {
      const k = await hamtaLassKo(torr);
      // Lokalt visas direkt (även utan nät). Gamla lass rörs inte: obesvarade lass från den gamla automatiken ligger kvar som de är (granskningen gäller 'auto').
      const efter = await k.lassForObjekt(objektId);
      if (avbruten) return;
      setLass(efter);
      fixarRef.current = [];
      setUtkast(null); utkastRef.current = null;
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

  // Reserven för sortimentlistan. Objektets sortiment per trakt; historiken en gång (sparad på enheten, så den finns även utan täckning).
  useEffect(() => {
    if (!aktiv || !objekt?.id) { setObjektSortiment(null); return; }
    let avbruten = false;
    void lasObjektSortiment(objekt.id).then((l) => { if (!avbruten) setObjektSortiment(l); });
    return () => { avbruten = true; };
  }, [aktiv, objekt?.id, sortimentOm]);
  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    void lasSortimentHistorik(sortimentOm > 0).then((h) => { if (!avbruten) setHistorik(h); });
    return () => { avbruten = true; };
  }, [aktiv, sortimentOm]);

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
  // Utkastet sparas aldrig här: det ändras bara i minnet tills föraren trycker Klar.
  const spara = useCallback((l: Lass) => {
    if (utkastRef.current?.id === l.id) { utkastRef.current = l; setUtkast(l); return; }
    setLass((prev) => (prev.some((x) => x.id === l.id) ? prev.map((x) => (x.id === l.id ? l : x)) : [...prev, l]));
    lassRef.current = lassRef.current.some((x) => x.id === l.id) ? lassRef.current.map((x) => (x.id === l.id ? l : x)) : [...lassRef.current, l];
    void sparaLass(l, inRef.current.torr);
  }, []);

  const kontext = useCallback((): LassKontext | null => {
    const o = inRef.current.objekt; const m = inRef.current.maskinId;
    return o && m ? { objektId: o.id, voNummer: o.vo, maskinId: m, medarbetareId: inRef.current.medarbetareId } : null;
  }, []);

  const hamtaLass = (id: string) => (utkastRef.current?.id === id ? utkastRef.current : lassRef.current.find((x) => x.id === id) ?? null);

  // ── Avläggszonen: bara när knappen syns och vilket avlägg. Skapar aldrig ett lass. ────────────────────────────────────────────
  const raknaZon = useCallback(() => {
    const p = senastePosRef.current;
    const fersk = !!p && Date.now() - p.at <= ZON.FERSK_FIX_MS;
    const z = fersk ? avlaggIZon({ lat: p!.lat, lng: p!.lng }, avlaggRef.current, !!iZonRef.current) : null;
    // Lämnat zonen (eller stått vid ett annat avlägg): knappen får komma tillbaka nästa gång maskinen kommer in.
    if (registreratIZonRef.current && z?.avlagg.id !== registreratIZonRef.current) { registreratIZonRef.current = null; setRegistreratVersion((v) => v + 1); }
    const forra = iZonRef.current;
    if (forra?.avlagg.id === z?.avlagg.id && forra?.tvetydigt === z?.tvetydigt) return;
    iZonRef.current = z;
    setIZon(z);
  }, []);

  useEffect(() => {
    if (!aktiv || !objektId || !maskinId || !position) return;
    const ts = serverNu();
    senastePosRef.current = { lat: position.lat, lng: position.lon, at: Date.now() };
    const buf = fixarRef.current;
    buf.push({ lat: position.lat, lng: position.lon, ts });
    if (buf.length > KO_MAX_FIXAR) buf.splice(0, buf.length - KO_MAX_FIXAR);
    raknaZon();
  }, [aktiv, objektId, maskinId, position, raknaZon]);

  // Pulsen: en fix som blivit gammal släpper knappen (ingen position = ingen knapp).
  useEffect(() => {
    if (!aktiv || !objektId || !maskinId) return;
    const iv = window.setInterval(raknaZon, 2000);
    return () => window.clearInterval(iv);
  }, [aktiv, objektId, maskinId, raknaZon]);

  // ── Utkastet: ett lass som föraren håller på att registrera ──────────────────────────────────────────────────────────────────
  /** Börjar ett utkast vid avlägget `a` (eller utan avlägg) och öppnar lasskortet. Sortimenten fylls i som förra lasset; inget sparas förrän Klar. */
  const startaUtkast = useCallback((a: Avlagg | null, plats: { lat: number; lng: number }, tvetydigt = false) => {
    const ctx = kontext();
    if (!ctx || utkastRef.current) return;
    const nu = serverNu();
    const fixar = fixarRef.current.filter((f) => f.ts <= nu + 1000);
    const forra = forraLass(lassRef.current, ctx.maskinId, ctx.objektId);
    const traff = { narmaste: a, avstandM: a ? avstand(plats, a) : 0, kandidater: a ? [a] : [], tvetydigt };
    const l = skapaLass({
      ctx, lassNummer: nastaLassNummer(lassRef.current, ctx.maskinId, ctx.objektId), ts: nu, lat: plats.lat, lng: plats.lng, traff, forra,
      sparPunkter: tunnaSpar(fixar), vagar: vagTider(fixar, inRef.current.hamtaVagar()), nu,
    });
    utkastFranRef.current = nu;
    utkastRef.current = l;
    setUtkast(l);
    ursprungRef.current = null;
    setAndra({ lassId: l.id, delNr: 1 });
  }, [kontext]);

  /** Knappen "Lossa · Avlägg 2": utkast vid avlägget maskinen står vid. */
  const lossaVidAvlagg = useCallback(() => {
    const z = iZonRef.current;
    const p = senastePosRef.current;
    if (!z || utkastRef.current) return;
    registreratIZonRef.current = z.avlagg.id;
    setRegistreratVersion((v) => v + 1);
    startaUtkast(z.avlagg, p ? { lat: p.lat, lng: p.lng } : { lat: z.avlagg.lat, lng: z.avlagg.lng });   // närmaste avlägg förvalt; två nära varandra → Byt avlägg i kortet
  }, [startaUtkast]);

  // ── Föraren ──────────────────────────────────────────────────────────────────────────────────────────
  const oppnaAndra = useCallback((lassId: string, delNr?: number) => {
    const l = hamtaLass(lassId);
    if (!l) return;
    ursprungRef.current = l;
    setAndra({ lassId, delNr: delNr ?? l.delar[l.delar.length - 1].delNr });
  }, []);

  /** Klar: ett utkast bekräftas och sparas (nu finns lasset), ett sparat lass bekräftas. */
  const stangAndra = useCallback((klar: boolean) => {
    if (andra && klar) {
      const l = hamtaLass(andra.lassId);
      if (!l || !kanBekrafta(l)) return;   // ett lass utan avlägg eller sortiment kan inte bekräftas: kortet står kvar
      const b = bekrafta(l, 'forare', serverNu());
      if (utkastRef.current?.id === l.id) {
        utkastRef.current = null;
        setUtkast(null);
        // Spåret räknas från NÄSTA lass: fixarna före den här lossningen tillhör det här lasset.
        if (utkastFranRef.current != null) { const fran = utkastFranRef.current; fixarRef.current = fixarRef.current.filter((f) => f.ts >= fran); }
      }
      spara(b);
    }
    setAndra(null);
  }, [andra, spara]);

  /** Avbryt: ett utkast kastas (inget har sparats); ett sparat lass återställs till hur det var när Ändra öppnades (ändringarna sparas live, så de måste tas tillbaka). */
  const avbrytAndra = useCallback(() => {
    if (andra && utkastRef.current?.id === andra.lassId) { utkastRef.current = null; setUtkast(null); registreratIZonRef.current = null; setRegistreratVersion((v) => v + 1); setAndra(null); return; }
    const u = ursprungRef.current;
    if (u && andra && u.id === andra.lassId) spara({ ...u, andrad: new Date(serverNu()).toISOString() });
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
    if (l) spara(bytAvlagg(l, delNr, a, serverNu()));
  }, [spara]);

  /** Ta bort: ett utkast kastas; ett sparat lass stryks (det var ingen lossning). */
  const strykLass = useCallback((lassId: string) => {
    if (utkastRef.current?.id === lassId) { utkastRef.current = null; setUtkast(null); setAndra(null); return; }
    const l = hamtaLass(lassId);
    if (l) spara(stryk(l, serverNu()));
    setAndra(null);
  }, [spara]);

  /** "Nytt avlägg här?" (bara efter + › Registrera lass där inget avlägg finns) — Ja: ett eget avlägg på platsen (synligt för alla direkt) och utkastet börjar där. */
  const svaraNyttAvlagg = useCallback((ja: boolean) => {
    const f = nyttAvlagg;
    setNyttAvlagg(null);
    if (!f || !ja) return;
    const ctx = kontext();
    if (!ctx) return;
    const nummer = nastaEgnaNummer(avlaggRef.current);
    const markerId = inRef.current.skapaEgetAvlagg(f.lat, f.lng, nummer, f.via);
    if (!markerId) return;
    const nytt: Avlagg = { id: `egen:${markerId}`, nummer, kalla: 'egen', lat: f.lat, lng: f.lng, ...(f.via === 'lossa_har' ? { viaLossaHar: true } : {}) };
    avlaggRef.current = [...avlaggRef.current, nytt];
    startaUtkast(nytt, { lat: f.lat, lng: f.lng });
  }, [nyttAvlagg, kontext, startaUtkast]);

  // ── Avlägg som skapats via Lossa här flyttas mot snittet av lossningarna ──────────────────────────────────────────────────────────────────────
  // Efter ≥ 3 bekräftade lass vid avlägget (lib/skotarLass/lossaHar). Aldrig medan maskinen står i avläggets zon eller ett lass registreras vid det (zonen ska inte
  // flytta sig under maskinen), aldrig i torrkörningen, aldrig Vidas, planerarens eller handsatta avlägg. Ett lass räknas en gång: efter flytten ligger snittet på avlägget.
  useEffect(() => {
    if (!aktiv || torr) return;
    for (const a of avlagg) {
      const f = avlaggFlytt(a, lass);
      if (!f || iZonRef.current?.avlagg.id === a.id || utkastRef.current?.delar.some((d) => d.avlaggId === a.id)) continue;
      inRef.current.flyttaEgetAvlagg?.(a.id.replace(/^egen:/, ''), f.lat, f.lng);
    }
  }, [aktiv, torr, avlagg, lass, iZon, utkast]);

  // ── Kvar, klar-dag, idag ─────────────────────────────────────────────────────────────────────────────
  const idagIso = lokaltDatumStockholm(serverNu());
  // Kvar kräver BÅDE skördat och Opti-lassen (skotat före appens start): kan någon inte läsas finns ingen kvar att visa.
  // En trakt där skotningen redan är avslutad (skotning_avslutad satt, hur den än sattes) visar ingen kvar.
  const kvar = useMemo<Kvar | null>(() => (skordat && opti && skotningAvslutad !== true && harSkordat(skordat) ? beraknaKvar(skordat, lass, opti) : null), [skordat, opti, lass, skotningAvslutad]);
  /** Skördaren är läst men har inget skördat på trakten (inte påbörjad): Kvar visas inte, och Färdigskotad går inte att trycka. */
  const ingetSkordat = !!skordat && !harSkordat(skordat);
  const sammanfattning = useMemo<KvarSammanfattning | null>(() => (kvar ? kvarSammanfattning(kvar, lass, idagIso, opti ?? []) : null), [kvar, lass, idagIso, opti]);
  const idag = useMemo(() => idagText(lass, idagIso, maskinId ?? ''), [lass, idagIso, maskinId]);
  // Mest använda först: hur ofta sortimentet använts på trakten (appens lass + Opti-lassen), annars senaste 12 månaderna.
  // Lasset som ändras just nu räknas inte med: knapparna under "Lägg till" får aldrig byta plats medan föraren trycker på dem.
  const andraId = andra?.lassId ?? null;
  const sortimentval = useMemo(
    () => sortimentVal({
      skordat, objekt: objektSortiment, historik,
      traktAnvandning: traktAnvandning(lass.filter((l) => l.id !== andraId), (opti ?? []).flatMap((o) => o.rader.map((r) => r.namn))),
    }),
    [skordat, objektSortiment, historik, lass, opti, andraId],
  );
  const valbara = sortimentval.primara;
  const lasOmSortiment = useCallback(() => setSortimentOm((n) => n + 1), []);

  const fardigskotad = useCallback(async () => {
    // Utan skördat och Opti-lassen går det inte att räkna rätt (appens lass skalas mot skördat MINUS Opti före appens start): då skickas inget.
    if (!objektId || !skordat || !opti || !harSkordat(skordat)) return;
    const optiAv = optiForAvslut(skordat, opti, lassRef.current);
    await begarFardigskotad(objektId, torr, optiAv);
    const sk = skalningsfaktorer(skordat, lassRef.current, optiAv);
    setAvslut({ faktorer: sk.faktorer, tillagg: sk.tillagg, skillnadM3: 0, avslutadTid: new Date(serverNu()).toISOString() });
  }, [objektId, torr, skordat, opti]);

  /** Bara torrkörningen (testläget): låtsas att maskinen står vid avlägget `avlaggId` (annars det närmaste/första) och trycker Lossa — så hela flödet går att se vid skrivbordet,
   *  där ingen GPS rör sig. Samma väg som ett riktigt tryck (utkast, lasskort, förifyllning), men lasset lagras bara i minnet. */
  const provkorLossning = useCallback((avlaggId: string | null) => {
    if (!inRef.current.torr || utkastRef.current) return;
    const lista = avlaggRef.current;
    const p = senastePosRef.current;
    const a = lista.find((x) => x.id === avlaggId)
      ?? (p ? [...lista].sort((x, y) => avstand(p, x) - avstand(p, y))[0] : lista[0]);
    if (!a) return;
    startaUtkast(a, { lat: a.lat, lng: a.lng });
  }, [startaUtkast]);

  /** + › Registrera lass — där inget avlägg finns (eller knappen inte syns): ett utkast vid närmaste avlägg, och finns inget avlägg inom zonen (50 m) frågas "Nytt avlägg här?" —
   *  då läggs avlägget MITT PÅ STOPPET och märks (viaLossaHar). Ett lass kopplat till ett avlägg 200 m bort vore fel. */
  const registreraLass = useCallback(() => {
    const ctx = kontext();
    if (!ctx || utkastRef.current) return;
    const nu = serverNu();
    const p = senastePosRef.current;
    const farsk = p && Date.now() - p.at <= 120_000 ? p : null;
    // Där han står: mitten på stoppet (medelvärdet av de senaste fixarna om han stått still), inte där fingret råkade vara.
    const mitt = farsk ? stoppMitt(fixarRef.current, nu, farsk) : null;
    const lista = avlaggRef.current;
    const narmaste = mitt ? [...lista].sort((x, y) => avstand(mitt, x) - avstand(mitt, y))[0] : null;
    if (mitt && (!narmaste || avstand(mitt, narmaste) > AVLAGG.RADIE_M)) { setNyttAvlagg({ lat: mitt.lat, lng: mitt.lng, ts: nu, via: 'lossa_har' }); return; }
    if (lista.length === 0) return;
    const fran = mitt ?? { lat: lista[0].lat, lng: lista[0].lng };
    const a = [...lista].sort((x, y) => avstand(fran, x) - avstand(fran, y))[0];
    startaUtkast(a, { lat: mitt?.lat ?? a.lat, lng: mitt?.lng ?? a.lng });
  }, [kontext, startaUtkast]);

  /** Knappen "Lossa · Avlägg 2": bara medan maskinen står i ett avläggs zon, och göms efter ett tryck tills maskinen lämnat zonen (ingen dubbelregistrering). */
  const lossaKnapp = useMemo(
    () => (iZon && registreratIZonRef.current !== iZon.avlagg.id && !utkast ? iZon.avlagg : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [iZon, utkast, registreratVersion],
  );

  /** Lasset i lasskortet: utkastet eller ett sparat lass. */
  const andraLass = andra ? hamtaLass(andra.lassId) : null;

  return {
    provkorLossning, registreraLass, lossaVidAvlagg, lossaKnapp, iZon, utkast, andraLass,
    lass, avlagg, nyttAvlagg, andra, vantande, skordat, skordatLaddat, ingetSkordat, kvar, sammanfattning, idag, valbara, allaSortiment: sortimentval.alla, sortimentKalla: sortimentval.kalla, lasOmSortiment, avslut, skotningAvslutad,
    oppnaAndra, stangAndra, avbrytAndra, andraRad, valjAvlagg, strykLass, svaraNyttAvlagg, fardigskotad, laddaOm: ladda,
  };
}

export type SkotarLassVy = ReturnType<typeof useSkotarLass>;
