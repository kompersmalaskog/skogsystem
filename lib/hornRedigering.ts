// "Redigera hörn" — pekar-logiken (Pointer Events: varje tryck räknas EN gång, med finger och mus lika).
//
// Förut lyssnade kartan på både touchstart och mousedown. Ett finger skickar BÅDA för samma tryck (webbläsarens emulerade mus kommer ~300 ms efter
// touchend), så ett tryck på en kantmittpunkt lade till ett hörn — och musen ovanpå grep det nya hörnet. Dessutom lade ETT tryck inom 18 px från en
// mittpunkt till ett hörn, så den som bara försökte panorera nära gränsen fick nya hörn av misstag.
//
// Reglerna nu (Martin 2026-11-25):
//   • Ett hörn flyttas genom att DRA det (minst `DRA_HORN_PX`). Ett tryck på ett hörn markerar det ("Ta bort hörn" visas vid det).
//   • Ett nytt hörn skapas på två sätt: (1) TRYCK på gränslinjen (kort och stilla, inom `traffKant` px från linjen) — hörnet hamnar på linjen där man tryckte,
//     markeras direkt och går att dra; (2) DRA en kantmittpunkt (minst `DRA_MITT_PX`). Ett tryck som bara panorerar (drag utanför handtagen) lägger inget.
//     Handtag går före linjen: ett tryck på ett hörn markerar det, ett tryck på en mittpunkt lägger hörnet där man tryckte.
//   • På touch ritas hörnet `LYFT_PX` ovanför fingret medan man drar, så fingret inte skymmer det.
//   • Ett drag som börjar utanför alla handtag panorerar kartan som vanligt.
// Ren logik (valjHandtag) och en tunn koppling mot kartan (kopplaHornRedigering). Testas i lib/hornRedigering.test.ts och i riktig Chromium (hornRedigering.hytt.test.ts).

import type { Punkt } from './ringEdit';

export const HORN_REGLER = {
  /** Hur nära ett handtag (px) ett tryck ska vara för att ta det. Finger är trubbigare än mus. */
  traffTouch: { horn: 22, mitt: 16 },
  traffMus: { horn: 14, mitt: 11 },
  /** Hur nära själva gränslinjen (px) ett tryck ska vara för att lägga ett nytt hörn där. */
  traffKant: { touch: 20, mus: 10 },
  /** Minsta rörelse (px) innan ett tryck blir ett drag. */
  DRA_HORN_PX: 5,
  DRA_MITT_PX: 8,
  /** På touch: hörnet ritas så här långt ovanför fingret medan man drar. */
  LYFT_PX: 40,
  /** Ett tryck på tom yta räknas bara som tryck om det är kort och stilla. */
  TRYCK_MS: 600,
  TRYCK_PX: 6,
} as const;

export interface Px { x: number; y: number }
export type Handtag = { typ: 'horn'; index: number } | { typ: 'mitt'; kant: number };

/**
 * Vilket handtag ligger närmast trycket (och inom träffytan)? Hörn och mittpunkter jämförs på avståndet — ligger en mittpunkt närmare än ett hörn vinner den
 * (förut vann alltid hörnen inom 22 px, så en mittpunkt intill ett hörn gick aldrig att ta). Lika avstånd: hörnet.
 */
export function valjHandtag(horn: Px[], mitt: Px[], x: number, y: number, traff: { horn: number; mitt: number }): Handtag | null {
  let basta: Handtag | null = null;
  let bd = Infinity;
  horn.forEach((p, index) => { const d = Math.hypot(p.x - x, p.y - y); if (d <= traff.horn && d < bd) { bd = d; basta = { typ: 'horn', index }; } });
  mitt.forEach((p, kant) => { const d = Math.hypot(p.x - x, p.y - y); if (d <= traff.mitt && d < bd) { bd = d; basta = { typ: 'mitt', kant }; } });
  return basta;
}

export interface KantPx { id: string; a: Px; b: Px }

/**
 * Närmaste punkt på någon gränslinje (kant) inom `maxPx` från trycket, i skärmpixlar. Punkten ligger PÅ linjen (inte i trycket), så hörnet hamnar exakt på gränsen
 * och inget snedsteg uppstår när fingret är några pixlar bredvid. Kortaste avståndet vinner; en kant utan längd räknas inte.
 */
export function narmastaKant(kanter: KantPx[], x: number, y: number, maxPx: number): { id: string; pt: Px; d: number } | null {
  let basta: { id: string; pt: Px; d: number } | null = null;
  for (const k of kanter) {
    const dx = k.b.x - k.a.x, dy = k.b.y - k.a.y;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - k.a.x) * dx + (y - k.a.y) * dy) / l2));
    const pt = { x: k.a.x + t * dx, y: k.a.y + t * dy };
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d <= maxPx && (!basta || d < basta.d)) basta = { id: k.id, pt, d };
  }
  return basta;
}

export interface HornKarta {
  getCanvas(): HTMLCanvasElement;
  project(ll: [number, number]): Px;
  unproject(p: [number, number]): { lng: number; lat: number };
  dragPan: { enable(): void; disable(): void };
}

export interface HornKoppling {
  /** Unika hörn (ett hörn som flera delar delar finns EN gång) i lng/lat. */
  horn(): { id: number; pt: Punkt }[];
  /** Unika kantmittpunkter (en gemensam kant EN gång). Id är kantens id i topologin. */
  mitt(): { id: string; pt: Punkt }[];
  /** Flytta ett hörn (i alla delar som har det) och rita om. */
  flytta(id: number, pt: Punkt): void;
  /** Alla unika kanter (en gemensam kant EN gång) med ändpunkterna i lng/lat. */
  kanter(): { id: string; a: Punkt; b: Punkt }[];
  /** Lägg ett nytt hörn på kanten (i alla delar som har kanten) och rita om — vid `pt` om den anges, annars vid kantens mitt. Returnerar nya hörnets id. */
  laggTill(kantId: string, pt?: Punkt): number | null;
  /** Anropas EN gång innan en ändring görs (ångra-steget tas här). */
  fore(): void;
  /** Hörn markerat (tryck) / avmarkerat (null). */
  valj(id: number | null): void;
  hamtaValt(): number | null;
  /** Under ett drag: vilket hörn som dras och var fingret är (null = inget finger, t.ex. mus). null = draget slut. */
  drag(d: { id: number; finger: [number, number] | null } | null): void;
}

type GestHandtag = { typ: 'horn'; id: number } | { typ: 'mitt'; id: string };
interface Gest { id: number; handtag: GestHandtag; hornId: number; start: Px; pekare: string; drar: boolean; t: number }

export function kopplaHornRedigering(map: HornKarta, k: HornKoppling): () => void {
  const canvas = map.getCanvas();
  const behallare = canvas.parentElement as HTMLElement | null;
  const gammalTouchAction = [canvas.style.touchAction, behallare?.style.touchAction ?? ''];
  canvas.style.touchAction = 'none';
  if (behallare) behallare.style.touchAction = 'none';

  let gest: Gest | null = null;
  let tom: { id: number; start: Px; t: number; pekare: string } | null = null;

  const tillCanvas = (e: PointerEvent): Px => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const slutaGest = () => { if (gest) { gest = null; k.drag(null); try { map.dragPan.enable(); } catch { /* */ } } };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gest || tom) {   // ett andra finger: släpp greppet och låt kartan ta nypet
      slutaGest(); tom = null;
      return;
    }
    const { x, y } = tillCanvas(e);
    const horn = k.horn(), mitt = k.mitt();
    const traff = e.pointerType === 'mouse' ? HORN_REGLER.traffMus : HORN_REGLER.traffTouch;
    const h = valjHandtag(horn.map((p) => map.project([p.pt[0], p.pt[1]])), mitt.map((p) => map.project([p.pt[0], p.pt[1]])), x, y, traff);
    if (!h) { tom = { id: e.pointerId, start: { x, y }, t: Date.now(), pekare: e.pointerType }; return; }   // utanför handtagen: kartan panorerar
    const handtag: GestHandtag = h.typ === 'horn' ? { typ: 'horn', id: horn[h.index].id } : { typ: 'mitt', id: mitt[h.kant].id };
    gest = { id: e.pointerId, handtag, hornId: handtag.typ === 'horn' ? handtag.id : -1, start: { x, y }, pekare: e.pointerType, drar: false, t: Date.now() };
    map.dragPan.disable();
    e.preventDefault();
  };

  const onMove = (e: PointerEvent) => {
    if (!gest || e.pointerId !== gest.id) return;
    const { x, y } = tillCanvas(e);
    if (!gest.drar) {
      const min = gest.handtag.typ === 'mitt' ? HORN_REGLER.DRA_MITT_PX : HORN_REGLER.DRA_HORN_PX;
      if (Math.hypot(x - gest.start.x, y - gest.start.y) < min) return;
      gest.drar = true;
      k.fore();   // ångra-steget FÖRE ändringen: ett drag (också ett nytt hörn som dras ut) = ett steg
      if (gest.handtag.typ === 'mitt') {
        const nytt = k.laggTill(gest.handtag.id);
        if (nytt == null) { slutaGest(); return; }
        gest.hornId = nytt;
      }
      k.valj(null);
    }
    const lyft = e.pointerType === 'touch' ? HORN_REGLER.LYFT_PX : 0;
    const ll = map.unproject([x, y - lyft]);
    k.flytta(gest.hornId, [ll.lng, ll.lat]);
    const f = lyft ? map.unproject([x, y]) : null;
    k.drag({ id: gest.hornId, finger: f ? [f.lng, f.lat] : null });
    e.preventDefault();
  };

  /** Tryck på gränslinjen: nytt hörn där man tryckte (på linjen), markerat direkt. Ångra-steget tas FÖRE ändringen. Returnerar true om ett hörn lades. */
  const laggHornPaLinjen = (x: number, y: number, pekare: string, helaKanten?: string): boolean => {
    const kanter = k.kanter().map((q) => ({ id: q.id, a: map.project([q.a[0], q.a[1]]), b: map.project([q.b[0], q.b[1]]) }));
    const maxPx = helaKanten ? Infinity : (pekare === 'mouse' ? HORN_REGLER.traffKant.mus : HORN_REGLER.traffKant.touch);
    const traff = narmastaKant(helaKanten ? kanter.filter((q) => q.id === helaKanten) : kanter, x, y, maxPx);
    if (!traff) return false;
    const ll = map.unproject([traff.pt.x, traff.pt.y]);
    k.fore();
    const nytt = k.laggTill(traff.id, [ll.lng, ll.lat]);
    if (nytt == null) return false;
    k.valj(nytt);
    return true;
  };

  const onUp = (e: PointerEvent) => {
    if (gest && e.pointerId === gest.id) {
      if (!gest.drar) {
        if (gest.handtag.typ === 'horn') k.valj(k.hamtaValt() === gest.handtag.id ? null : gest.handtag.id);   // tryck på ett hörn = markera det
        else if (Date.now() - gest.t < HORN_REGLER.TRYCK_MS) {   // tryck på en mittpunkt = nytt hörn där man tryckte (på just den kanten)
          const { x, y } = tillCanvas(e);
          laggHornPaLinjen(x, y, gest.pekare, gest.handtag.id);
        }
      }
      slutaGest();
      return;
    }
    if (tom && e.pointerId === tom.id) {
      const { x, y } = tillCanvas(e);
      if (Math.hypot(x - tom.start.x, y - tom.start.y) < HORN_REGLER.TRYCK_PX && Date.now() - tom.t < HORN_REGLER.TRYCK_MS) {
        if (!laggHornPaLinjen(x, y, tom.pekare)) k.valj(null);   // tryck på linjen = nytt hörn, annars tryck på tom yta = avmarkera
      }
      tom = null;
    }
  };
  const onAvbrutet = (e: PointerEvent) => {
    if (gest && e.pointerId === gest.id) slutaGest();
    if (tom && e.pointerId === tom.id) tom = null;
  };
  const ingenMeny = (e: Event) => e.preventDefault();   // långt tryck ska inte öppna webbläsarens meny mitt i ett drag

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('contextmenu', ingenMeny);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onAvbrutet);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('contextmenu', ingenMeny);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onAvbrutet);
    slutaGest();
    canvas.style.touchAction = gammalTouchAction[0];
    if (behallare) behallare.style.touchAction = gammalTouchAction[1];
  };
}
