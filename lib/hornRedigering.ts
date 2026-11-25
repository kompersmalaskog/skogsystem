// "Redigera hörn" — pekar-logiken (Pointer Events: varje tryck räknas EN gång, med finger och mus lika).
//
// Förut lyssnade kartan på både touchstart och mousedown. Ett finger skickar BÅDA för samma tryck (webbläsarens emulerade mus kommer ~300 ms efter
// touchend), så ett tryck på en kantmittpunkt lade till ett hörn — och musen ovanpå grep det nya hörnet. Dessutom lade ETT tryck inom 18 px från en
// mittpunkt till ett hörn, så den som bara försökte panorera nära gränsen fick nya hörn av misstag.
//
// Reglerna nu (Martin 2026-11-25):
//   • Ett hörn flyttas genom att DRA det (minst `DRA_HORN_PX`). Ett tryck på ett hörn markerar det ("Ta bort hörn" visas vid det).
//   • Ett nytt hörn skapas bara genom att DRA en kantmittpunkt (minst `DRA_MITT_PX`). Ett tryck på en mittpunkt gör ingenting.
//   • På touch ritas hörnet `LYFT_PX` ovanför fingret medan man drar, så fingret inte skymmer det.
//   • Ett drag som börjar utanför alla handtag panorerar kartan som vanligt.
// Ren logik (valjHandtag) och en tunn koppling mot kartan (kopplaHornRedigering). Testas i lib/hornRedigering.test.ts och i riktig Chromium (hornRedigering.hytt.test.ts).

import { flyttaHorn, kantMittpunkter, laggTillHorn, type Punkt } from './ringEdit';

export const HORN_REGLER = {
  /** Hur nära ett handtag (px) ett tryck ska vara för att ta det. Finger är trubbigare än mus. */
  traffTouch: { horn: 22, mitt: 16 },
  traffMus: { horn: 14, mitt: 11 },
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

export interface HornKarta {
  getCanvas(): HTMLCanvasElement;
  project(ll: [number, number]): Px;
  unproject(p: [number, number]): { lng: number; lat: number };
  dragPan: { enable(): void; disable(): void };
}

export interface HornKoppling {
  hamtaRing(): Punkt[];
  /** Ersätter ringen och ritar om. */
  sattRing(ring: Punkt[]): void;
  /** Anropas EN gång innan en ändring görs (ångra-steget tas här). */
  fore(): void;
  /** Hörn markerat (tryck) / avmarkerat (null). */
  valj(index: number | null): void;
  hamtaValt(): number | null;
  /** Under ett drag: vilket hörn som dras och var fingret är (null = inget finger, t.ex. mus). null = draget slut. */
  drag(d: { index: number; finger: [number, number] | null } | null): void;
}

interface Gest { id: number; handtag: Handtag; index: number; start: Px; pekare: string; drar: boolean }

export function kopplaHornRedigering(map: HornKarta, k: HornKoppling): () => void {
  const canvas = map.getCanvas();
  const behallare = canvas.parentElement as HTMLElement | null;
  const gammalTouchAction = [canvas.style.touchAction, behallare?.style.touchAction ?? ''];
  canvas.style.touchAction = 'none';
  if (behallare) behallare.style.touchAction = 'none';

  let gest: Gest | null = null;
  let tom: { id: number; start: Px; t: number } | null = null;

  const tillCanvas = (e: PointerEvent): Px => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const slutaGest = () => { if (gest) { gest = null; k.drag(null); try { map.dragPan.enable(); } catch { /* */ } } };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gest || tom) {   // ett andra finger: släpp greppet och låt kartan ta nypet
      slutaGest(); tom = null;
      return;
    }
    const { x, y } = tillCanvas(e);
    const ring = k.hamtaRing();
    const horn = ring.map((p) => map.project([p[0], p[1]]));
    const mitt = kantMittpunkter(ring).map((m) => map.project([m.pt[0], m.pt[1]]));
    const traff = e.pointerType === 'mouse' ? HORN_REGLER.traffMus : HORN_REGLER.traffTouch;
    const h = valjHandtag(horn, mitt, x, y, traff);
    if (!h) { tom = { id: e.pointerId, start: { x, y }, t: Date.now() }; return; }   // utanför handtagen: kartan panorerar
    gest = { id: e.pointerId, handtag: h, index: h.typ === 'horn' ? h.index : -1, start: { x, y }, pekare: e.pointerType, drar: false };
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
        const ring = k.hamtaRing();
        const m = kantMittpunkter(ring)[gest.handtag.kant];
        if (!m) { slutaGest(); return; }
        k.sattRing(laggTillHorn(ring, gest.handtag.kant, m.pt));
        gest.index = gest.handtag.kant + 1;
      }
      k.valj(null);
    }
    const lyft = e.pointerType === 'touch' ? HORN_REGLER.LYFT_PX : 0;
    const ll = map.unproject([x, y - lyft]);
    k.sattRing(flyttaHorn(k.hamtaRing(), gest.index, [ll.lng, ll.lat]));
    const f = lyft ? map.unproject([x, y]) : null;
    k.drag({ index: gest.index, finger: f ? [f.lng, f.lat] : null });
    e.preventDefault();
  };

  const onUp = (e: PointerEvent) => {
    if (gest && e.pointerId === gest.id) {
      if (!gest.drar && gest.handtag.typ === 'horn') k.valj(k.hamtaValt() === gest.index ? null : gest.index);   // tryck på ett hörn = markera det (mittpunkt: inget)
      slutaGest();
      return;
    }
    if (tom && e.pointerId === tom.id) {
      const { x, y } = tillCanvas(e);
      if (Math.hypot(x - tom.start.x, y - tom.start.y) < HORN_REGLER.TRYCK_PX && Date.now() - tom.t < HORN_REGLER.TRYCK_MS) k.valj(null);   // tryck på tom yta = avmarkera
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
