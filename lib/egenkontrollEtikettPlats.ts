// Var en etikett hamnar pa kartan i rapporten, utan att doldja en annan etikett, en kontrollpunkt eller sin egen notering.
//
// RENT och deterministiskt: samma indata ger samma plats. Etiketterna placeras i den ordning de ges (aldst forst); en etikett som
// redan ligger kvar nar en ny tillkommer flyttas aldrig. Atta lagen runt ankaret provas i fast ordning (uppat-hoger forst: det
// ar dar en lasare letar), och det forsta som ar helt innanfor ytan och fritt fran hinder vinner.
//
// FINNS INGET FRITT LAGE placeras etiketten dar den doljer minst (minsta overlappande yta) - en notering som doljs helt vore en
// notering man inte ser, och det ar varre an en som ligger ovanpa en annan.

export type Rektangel = { x0: number; y0: number; x1: number; y1: number };
export type EtikettPost = { id: string; ankare: { x: number; y: number }; bredd: number; hojd: number };

/** Mellanrum mellan ankaret och etikettens narmaste kant, i samma enhet som resten (pt). */
export const ETIKETT_LUCKA = 5;

export function skar(a: Rektangel, b: Rektangel): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function overlapp(a: Rektangel, b: Rektangel): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** De atta lagen, i den ordning de provas. y vaxer nedat (toppbaserade koordinater). */
function lagen(p: EtikettPost, g: number): Rektangel[] {
  const { x, y } = p.ankare;
  const { bredd: b, hojd: h } = p;
  const rakt = (x0: number, y0: number): Rektangel => ({ x0, y0, x1: x0 + b, y1: y0 + h });
  return [
    rakt(x + g, y - g - h),            // uppat hoger
    rakt(x + g, y + g),                // nedat hoger
    rakt(x - g - b, y - g - h),        // uppat vanster
    rakt(x - g - b, y + g),            // nedat vanster
    rakt(x - b / 2, y - g - h),        // rakt over
    rakt(x - b / 2, y + g),            // rakt under
    rakt(x + g, y - h / 2),            // rakt at hoger
    rakt(x - g - b, y - h / 2),        // rakt at vanster
  ];
}

const innanfor = (r: Rektangel, yta: Rektangel) => r.x0 >= yta.x0 && r.x1 <= yta.x1 && r.y0 >= yta.y0 && r.y1 <= yta.y1;

/** Flyttar in en rektangel i ytan (blir den storre an ytan hamnar den vid ytans overkant/vansterkant). */
function klam(r: Rektangel, yta: Rektangel): Rektangel {
  const b = r.x1 - r.x0, h = r.y1 - r.y0;
  const x0 = Math.max(yta.x0, Math.min(r.x0, yta.x1 - b));
  const y0 = Math.max(yta.y0, Math.min(r.y0, yta.y1 - h));
  return { x0, y0, x1: x0 + b, y1: y0 + h };
}

/**
 * @param hinder rektanglar som ALDRIG ska doljas fran borjan (kontrollpunkternas pinnar, noteringarnas egna ankarmarken)
 * @param yta kartans ruta; etiketterna ligger helt innanfor den
 */
export function placeraEtiketter(poster: EtikettPost[], hinder: Rektangel[], yta: Rektangel): Map<string, Rektangel> {
  const ut = new Map<string, Rektangel>();
  const upptaget: Rektangel[] = [...hinder];
  for (const p of poster) {
    const kandidater = lagen(p, ETIKETT_LUCKA).map((r) => klam(r, yta));
    let valt: Rektangel | null = null;
    for (const r of kandidater) {
      if (innanfor(r, yta) && !upptaget.some((u) => skar(r, u))) { valt = r; break; }
    }
    if (!valt) {
      // Inget fritt lage: det som doljer minst (forsta vid lika).
      let basta = Infinity;
      for (const r of kandidater) {
        const o = upptaget.reduce((s, u) => s + overlapp(r, u), 0);
        if (o < basta) { basta = o; valt = r; }
      }
    }
    const r = valt as Rektangel;
    ut.set(p.id, r);
    upptaget.push(r);
  }
  return ut;
}
