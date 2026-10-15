// Perioden i Lastbilen: MÅNAD (förvald) eller ÅR — inget annat (Martin 2026-10-14: vecka,
// kvartal och datumval dör). En period skrivs i adressen som "2026-10" (månad) eller "2026" (år),
// så en länk från Hem eller en notis kan peka på rätt månad.
//
// Datum är LOKALA kalenderdatum (aldrig toISOString: TZ tappar sista dagen, #320). En "till" är
// EXKLUSIV: [fran, till).

export type Manad = { typ: 'man'; ar: number; man: number };
export type Period = Manad | { typ: 'ar'; ar: number };

/** Första månaden med lastbilsdata i flyttdag (24 juli 2026). Före den finns inget att visa. */
export const FORSTA_MANAD = { ar: 2026, man: 7 } as const;

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];

const tvasiffrig = (n: number) => String(n).padStart(2, '0');
const ymd = (ar: number, man: number, dag: number) => `${ar}-${tvasiffrig(man)}-${tvasiffrig(dag)}`;

export function periodNu(nu: Date = new Date()): Manad {
  return { typ: 'man', ar: nu.getFullYear(), man: nu.getMonth() + 1 };
}

/** "2026-10" eller "2026" → Period. Allt annat (eller en månad utanför datan/framtiden) → null. */
export function periodFranText(text: string | null | undefined, nu: Date = new Date()): Period | null {
  if (!text) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(text);
  if (m) {
    const p: Period = { typ: 'man', ar: Number(m[1]), man: Number(m[2]) };
    return p.man >= 1 && p.man <= 12 && arGiltig(p, nu) ? p : null;
  }
  const a = /^(\d{4})$/.exec(text);
  if (a) {
    const p: Period = { typ: 'ar', ar: Number(a[1]) };
    return arGiltig(p, nu) ? p : null;
  }
  return null;
}

export function periodTillText(p: Period): string {
  return p.typ === 'man' ? `${p.ar}-${tvasiffrig(p.man)}` : String(p.ar);
}

/** Inom [första månaden med data, innevarande period]. */
function arGiltig(p: Period, nu: Date): boolean {
  const nuAr = nu.getFullYear();
  const nuMan = nu.getMonth() + 1;
  if (p.typ === 'ar') return p.ar >= FORSTA_MANAD.ar && p.ar <= nuAr;
  const nr = p.ar * 12 + p.man;
  return nr >= FORSTA_MANAD.ar * 12 + FORSTA_MANAD.man && nr <= nuAr * 12 + nuMan;
}

export function kanGaBakat(p: Period, nu: Date = new Date()): boolean {
  return arGiltig(stegaPeriod(p, -1), nu);
}
export function kanGaFramat(p: Period, nu: Date = new Date()): boolean {
  return arGiltig(stegaPeriod(p, 1), nu);
}

/** En månad (eller ett år) bakåt/framåt. Ger alltid en period; `kanGa…` avgör om den får visas. */
export function stegaPeriod(p: Period, steg: number): Period {
  if (p.typ === 'ar') return { typ: 'ar', ar: p.ar + steg };
  const nr = p.ar * 12 + (p.man - 1) + steg;
  return { typ: 'man', ar: Math.floor(nr / 12), man: (nr % 12) + 1 };
}

/** Byt mellan Månad och År. År → Månad ger januari om året inte är innevarande, annars innevarande månad. */
export function bytTyp(p: Period, till: 'man' | 'ar', nu: Date = new Date()): Period {
  if (p.typ === till) return p;
  if (till === 'ar') return { typ: 'ar', ar: p.ar };
  const nuP = periodNu(nu);
  const ar = p.ar;
  const man = ar === nuP.ar ? nuP.man : ar === FORSTA_MANAD.ar ? FORSTA_MANAD.man : 1;
  return { typ: 'man', ar, man };
}

/** [fran, till) som lokala datum (YYYY-MM-DD) för en date-kolumn. */
export function periodIntervall(p: Period): { fran: string; till: string } {
  if (p.typ === 'ar') return { fran: ymd(p.ar, 1, 1), till: ymd(p.ar + 1, 1, 1) };
  const nasta = stegaPeriod(p, 1) as Manad;
  return { fran: ymd(p.ar, p.man, 1), till: ymd(nasta.ar, nasta.man, 1) };
}

/** "Oktober 2026" / "2026". */
export function periodEtikett(p: Period): string {
  return p.typ === 'ar' ? String(p.ar) : `${MANADER[p.man - 1]} ${p.ar}`;
}

/** Kort form till remsan: "oktober" / "2026" — innevarande år utelämnas på månad, annat år står med. */
export function periodKort(p: Period, nu: Date = new Date()): string {
  if (p.typ === 'ar') return String(p.ar);
  const namn = MANADER[p.man - 1].toLowerCase();
  return p.ar === nu.getFullYear() ? namn : `${namn} ${p.ar}`;
}
