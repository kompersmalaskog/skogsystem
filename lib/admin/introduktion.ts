// Introduktionen av en ny medarbetare: fyra steg. Vilka som är klara HÄRLEDS ur det som är sparat (inget
// "steg 3 klart"-fält att hålla i synk), så flödet kan avbrytas, laddas om och tas upp igen var som helst.

export const INTRO_STEG = [
  { nr: 1, namn: "Namn och e-post" },
  { nr: 2, namn: "Hemadress" },
  { nr: 3, namn: "Maskin och operatör" },
  { nr: 4, namn: "Anställningsnummer" },
] as const;

export type IntroPerson = { namn: string | null; epost: string | null; hem_lat: number | null; maskin_id: string | null };

/** Klar eller inte, per steg (index 0 = steg 1). Hempunkten räknas som klar först när punkten finns. */
export function introKlara(p: IntroPerson | null, anstallningsnummer: string | null): boolean[] {
  if (!p) return [false, false, false, false];
  return [
    !!(p.namn || "").trim() && !!(p.epost || "").trim(),
    p.hem_lat != null,
    !!p.maskin_id,
    !!(anstallningsnummer || "").trim(),
  ];
}

/** Första steget som inte är klart (1-indexerat), eller 4 om allt är klart. */
export function forstaOgjorda(klara: boolean[]): number {
  const i = klara.findIndex(k => !k);
  return i === -1 ? 4 : i + 1;
}

/** Det som saknas, i ord: ["hempunkt", "maskin"]. */
export function introSaknas(klara: boolean[]): string[] {
  const ord = ["namn och e-post", "hempunkt", "maskin", "anställningsnummer"];
  return ord.filter((_, i) => !klara[i]);
}

export function ochLista(delar: string[]): string {
  return delar.length <= 1 ? delar.join("") : `${delar.slice(0, -1).join(", ")} och ${delar[delar.length - 1]}`;
}
