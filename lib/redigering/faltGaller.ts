// Vilka fält som GÄLLER ett objekt i Redigering. Ett fält som inte gäller visas inte och räknas aldrig som "saknas".
//
// Bakgrund (prod 2026-10-23, 142 objekt): "Åtgärd saknas" stod på 80 objekt — 71 av dem slutavverkningar, där frågan
// är avtalsform, inte åtgärd. "Inköpare saknas" på 46 — 26 av dem privata jobb, där det inte finns någon inköpare.
// Det var inga luckor, det var fel frågor.
//
// Avtalsform (Au/Rp/LRK/VF/Bark) är hur en virkesköpare har avtalat trakten. Ett privat jobb har ingen sådan avtalsform
// (Martin 2026-10-23: "allt som är säkert" — ändra här om ett privat jobb ska kunna ha det).

import { arRisjobb } from '@/lib/objekt/typ';

export type FaltSomKanSakna = 'atgard' | 'avtalsform' | 'inkopare';

export interface FaltObjekt {
  huvudtyp?: string | null;
  bolag?: string | null;
  risskotning?: boolean | null;
  /** Special-objekt (vindfälle, storm, special vid hus …): har ingen avtalsform att fråga om. */
  special?: boolean | null;
}

/** Bolaget säger att jobbet är privat (ingen virkesköpare). Skiftläge och mellanslag spelar ingen roll. */
export function arPrivat(bolag: string | null | undefined): boolean {
  return typeof bolag === 'string' && bolag.trim().toLowerCase() === 'privat';
}

/** Gäller fältet det här objektet? Okänd typ (huvudtyp saknas) = vi vet inte än, då gäller inget av dem. */
export function faltGaller(falt: FaltSomKanSakna, obj: FaltObjekt | null | undefined): boolean {
  if (!obj) return false;
  switch (falt) {
    case 'atgard':
      return !arRisjobb(obj) && obj.huvudtyp === 'Gallring';
    case 'avtalsform':
      return !arRisjobb(obj) && obj.huvudtyp === 'Slutavverkning' && !arPrivat(obj.bolag) && obj.special !== true;
    case 'inkopare':
      return !arPrivat(obj.bolag);
  }
}
