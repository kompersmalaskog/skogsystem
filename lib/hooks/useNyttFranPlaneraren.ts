'use client';

// "Nytt från …" i körvyn (lib/nyttFranPlaneraren): tar emot markeringarna efter varje färsk hämtning och kommentarerna när de ändras, jämför med baslinjen och håller EN rad.
// En hook så att sidan och testerna kör exakt samma kod.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NYTT_RAD_MS, kommentarBaslinje, kommentarPost, laggIPoster, markeringPost, markeringsBaslinje, nyaKommentarer, nyaMarkeringar, osedda, radText, toneFor,
  type KommentarRadIn, type NyttPlats, type NyttPost, type NyttTon,
} from '@/lib/nyttFranPlaneraren';

export interface NyttFranIn {
  /** Objektet raden gäller (en ny baslinje per objekt). */
  objektId: string | undefined;
  /** Raden visas bara när körvyn är öppen. Utanför den samlas baslinjen ändå, så inget "gammalt" dyker upp när körvyn öppnas. */
  aktiv: boolean;
  /** Den inloggades medarbetar-id: det man själv ändrar är aldrig "nytt". */
  minId: string | null;
  /** Kommentarerna för objektet (server + väntande) och om första läsningen är klar. */
  kommentarer: readonly KommentarRadIn[];
  kommentarerLaddad: boolean;
  /** Platsen för en markering / en kommentars nyckel (`marker:<id>`, `hansyn:3` …). Null = okänd. */
  markeringPlats: (m: any) => NyttPlats | null;
  nyckelPlats: (nyckel: string) => NyttPlats | null;
  /** Maskinens position (för avståndet i texten). */
  pos: { lat: number; lon: number } | null;
  /** Ett tryck på raden: visa ändringen (flyg dit och pulsa). */
  onVisa: (post: NyttPost) => void;
  nu?: () => number;
}

export interface NyttRadUt { text: string; ton: NyttTon; antal: number }

export function useNyttFranPlaneraren(i: NyttFranIn) {
  const inRef = useRef(i); inRef.current = i;
  const nu = () => (inRef.current.nu ? inRef.current.nu() : Date.now());
  const [poster, setPoster] = useState<NyttPost[]>([]);
  const [synlig, setSynlig] = useState(false);
  const [, tick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postRef = useRef<NyttPost[]>([]); postRef.current = poster;
  const markBas = useRef<{ objekt: string | undefined; bas: Map<string, number> | null }>({ objekt: undefined, bas: null });
  // `vantaFalse`: efter ett objektbyte visar kommentar-hooken först kvar det GAMLA objektets rader med laddad = true; baslinjen tas först när den har gått via false.
  const kommBas = useRef<{ objekt: string | undefined; bas: Map<string, string> | null; vantaFalse: boolean }>({ objekt: undefined, bas: null, vantaFalse: false });
  const forstaObjekt = useRef(true);

  const armaTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; setSynlig(false); }, NYTT_RAD_MS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const lagg = useCallback((nya: NyttPost[]) => {
    if (!nya.length || !inRef.current.aktiv) return;
    const t = nu();
    setPoster(laggIPoster(postRef.current, nya, t));
    setSynlig(true);
    armaTimer();
  }, [armaTimer]);

  // Objektbyte: ny baslinje, ingen rad från förra objektet.
  useEffect(() => {
    markBas.current = { objekt: i.objektId, bas: null };
    kommBas.current = { objekt: i.objektId, bas: null, vantaFalse: !forstaObjekt.current };
    forstaObjekt.current = false;
    setPoster([]); setSynlig(false);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, [i.objektId]);

  // Körvyn stängs: raden försvinner.
  useEffect(() => { if (!i.aktiv) { setSynlig(false); if (timer.current) { clearTimeout(timer.current); timer.current = null; } } }, [i.aktiv]);

  /** Anropas efter varje hämtning av markeringarna (`farsk` = serverns rader lästes nu; den sparade bilden är ingen baslinje). */
  const hamtadMarkeringar = useCallback((markers: readonly any[], farsk: boolean) => {
    if (!farsk) return;
    const s = markBas.current;
    if (!s.bas) { s.bas = markeringsBaslinje(markers); return; }   // första färska bilden: tyst baslinje
    const { nya, bas } = nyaMarkeringar(s.bas, markers, inRef.current.minId);
    s.bas = bas;
    const t = nu();
    lagg(nya.map((m) => markeringPost(m, inRef.current.markeringPlats(m), t)));
  }, [lagg]);

  // Kommentarerna: första läsningen är baslinjen, därefter nya eller ändrade från någon annan.
  useEffect(() => {
    const s = kommBas.current;
    if (!i.kommentarerLaddad) { s.vantaFalse = false; return; }
    if (s.vantaFalse) return;
    if (!s.bas) { s.bas = kommentarBaslinje(i.kommentarer); return; }
    const { nya, bas } = nyaKommentarer(s.bas, i.kommentarer, i.minId);
    s.bas = bas;
    const t = nu();
    lagg(nya.map((r) => kommentarPost(r, inRef.current.nyckelPlats(r.yta_nyckel), t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i.kommentarer, i.kommentarerLaddad]);

  const synliga = useMemo(() => osedda(poster, nu()), [poster, synlig, i.aktiv]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Tryck på raden: den första osedda visas (och blir sedd); fler kvar → raden stannar, annars försvinner den. */
  const tryck = useCallback(() => {
    const kvar = osedda(postRef.current, nu());
    const forsta = kvar[0];
    if (!forsta) { setSynlig(false); return; }
    const nasta = postRef.current.map((p) => (p.nyckel === forsta.nyckel ? { ...p, sedd: true } : p));
    postRef.current = nasta;
    setPoster(nasta);
    if (kvar.length <= 1) { setSynlig(false); if (timer.current) { clearTimeout(timer.current); timer.current = null; } } else { armaTimer(); tick((x) => x + 1); }
    try { inRef.current.onVisa(forsta); } catch { /* kartan är borta */ }
  }, [armaTimer]);

  const pos = i.pos;
  const posNyckel = pos ? `${Math.round(pos.lat * 5000)}:${Math.round(pos.lon * 2500)}` : '';
  const rad: NyttRadUt | null = useMemo(() => {
    if (!synlig || !i.aktiv || !synliga.length) return null;
    return { text: radText(synliga, pos), ton: toneFor(synliga), antal: synliga.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synlig, i.aktiv, synliga, posNyckel]);

  return { rad, tryck, hamtadMarkeringar };
}
