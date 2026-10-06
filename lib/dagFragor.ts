// Frågor föraren ska svara på innan Stämmer (kvällsvyn i Dag). Ren logik, ingen I/O.
//
// EN regel (Martin 2026-10-06): dagskortet är bara information. Allt man ska svara på står
// samlat under "Saker att svara på", ovanför Stämmer. Tidsfrågorna (rast, lång dag, negativ
// tid) var förut en ruta som kom upp först när man tryckt Stämmer; här är de rader i listan.

import { passOrimlighet, RAST_FRAGA_MIN, ARBETSDAG_MAX_MINUTER } from "@/lib/arbetsdagRegler";

export type TidsFraga = {
  id: "negativ" | "lang" | "rast";
  /** Radens rubrik: "Rast 95 min". */
  titel: string;
  /** Rubrik och text i svarsarket (samma ord som den gamla frågan vid Stämmer). */
  rubrik: string;
  text: string;
};

/** Frågor om passets tider: rast över gränsen, ett pass över 16 tim, eller negativ tid. */
export function tidsFragor(rastMin: number, passMin: number | null | undefined): TidsFraga[] {
  const ut: TidsFraga[] = [];
  const orim = passOrimlighet(passMin);
  if (orim === "negativ") {
    ut.push({
      id: "negativ",
      titel: "Rasten är längre än passet",
      rubrik: "Rasten är längre än passet — stämmer det?",
      text: `Passet blir ${passMin} minuter. Tiden räknas som negativ tills den rättas.`,
    });
  } else if (orim === "lang") {
    const tim = (Math.round((passMin || 0) / 6) / 10).toLocaleString("sv-SE");
    ut.push({
      id: "lang",
      titel: `Passet är ${tim} tim`,
      rubrik: `Passet är ${tim} tim — stämmer det?`,
      text: `Längre än ${ARBETSDAG_MAX_MINUTER / 60} timmar. En felskriven sluttid ger samma bild — kontrollera start och slut.`,
    });
  }
  if (rastMin > RAST_FRAGA_MIN) {
    ut.push({
      id: "rast",
      titel: `Rast ${rastMin} min`,
      rubrik: `Rast ${rastMin} min — stämmer det?`,
      text: "Maskinen räknar allt som bokförts som Meal break. Stod maskinen still av annan orsak — flytt, väntan, service — är det arbetstid, inte rast. Avtalet räknar med högst 75 minuters rast per pass.",
    });
  }
  return ut;
}

export type VilaOrsak = "oforutsedd" | "akut_jour" | "planerad_avtal" | "annat";

export const VILA_ORSAKER: { key: VilaOrsak; label: string; sub: string; kort: string }[] = [
  { key: "oforutsedd", label: "Oförutsedd händelse", sub: "Trafik, väder, oväntat fel", kort: "Oförutsedd händelse" },
  { key: "akut_jour", label: "Akut situation eller jour", sub: "Brådskande arbete som krävde min närvaro", kort: "Akut situation" },
  { key: "planerad_avtal", label: "Planerat undantag enligt avtal", sub: "Förhandlat med chef i förväg", kort: "Planerat enligt avtal" },
  { key: "annat", label: "Annat", sub: "Skriv en kort beskrivning", kort: "Annat" },
];

/** Förarens svar på ett vilobrott som kort text ("Akut situation"). */
export function vilaSvarText(orsak: string | null | undefined, fritext?: string | null): string {
  const o = VILA_ORSAKER.find(x => x.key === orsak);
  if (!o) return "Besvarat";
  return o.key === "annat" && fritext?.trim() ? `Annat: ${fritext.trim()}` : o.kort;
}
