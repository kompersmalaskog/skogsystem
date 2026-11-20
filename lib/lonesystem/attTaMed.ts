// "Att ta med löneansvarig" (Lön → Löneunderlag): bara det som fortfarande är öppet.
//
// Kodrådet byggs ur vad som är kopplat just nu — en gjord sak står aldrig kvar. Det som redan stoppar sändningen (röda rader i
// kortet "Kan inte skickas än") nämns inte en andra gång. Frivilliga lönearter (premien) kräver ingen kod. Resten är frågor och
// beslut som ingen i appen kan se är besvarade; de ligger kvar tills de tagits bort härifrån. Det beslutade och byggda hör inte
// hit (helglönsregeln står i CLAUDE.md).
import { LONEARTER, type Loneartkopplingar } from "./loneart";
import type { BlockerandeLoneart } from "./loneartSaknas";

export type RadAttTaMed = { slag: string; rubrik: string; text: string };

const lista = (namn: string[]) => namn.length < 2 ? namn.join("") : `${namn.slice(0, -1).join(", ")} och ${namn[namn.length - 1]}`;

/** Rådet "Koppla koden för …", eller null när allt som behöver en kod har en. */
export function kodRadAttGora(kopplingar: Loneartkopplingar, blockerande: Pick<BlockerandeLoneart, "loneart">[]): RadAttTaMed | null {
  const saknas = LONEARTER.filter(a => !a.valfri && !kopplingar?.[a.key] && !(blockerande || []).some(b => b.loneart === a.key));
  if (saknas.length === 0) return null;
  return {
    slag: "Gör",
    rubrik: `Koppla ${saknas.length === 1 ? "koden" : "koderna"} för ${lista(saknas.map(a => a.label))}`,
    text: "under Lön → Lönearter. Utan kod skickas ingen rad.",
  };
}

/**
 * Frågor och beslut som fortfarande är öppna. Det som Martin redan beslutat tas bort härifrån (2026-10-21): ordinarie tid och övertid räknas per
 * kalendermånad (lib/lonesystem/manadsordinarie) — därmed är frågan om 16-veckorsperioder och fastställt schema besvarad — och Gävle-perioden är en
 * markerad utjämningsperiod. De visas under Admin → Avtal → Öppna frågor.
 */
export const oppnaFragor: RadAttTaMed[] = [
  { slag: "Fråga", rubrik: "Löneart för sjuklön, VAB och föräldraledig", text: "dagarna ur morgonkortet och godkänd ledighet syns i underlaget men skickas inte." },
  { slag: "Fråga", rubrik: "Levereras sjukfrånvaro i timmar per dag?", text: "§12 mom 3 räknar karens i timmar (20 % av veckoarbetstiden = 8 tim vid 40) och sjuklön per timme som skulle ha arbetats. En halv sjukdag är 3 tim, inte en dag. Räknar Fortnox karensavdraget och de 80 procenten själv när appen skickar timmarna?" },
  { slag: "Bekräfta", rubrik: "Komp räknas inte mot 250-taket", text: "§8 mom 3: övertid kan efter överenskommelse tas ut som ledighet, 1,4 tim per övertidstimme. §5 mom 5 anm 3: sådan tid är inte övertid enligt arbetstidslagen." },
  { slag: "Bekräfta", rubrik: "Bytesdag är skoftning", text: "§5 mom 4: ledig vardag mot inarbetning avtalas samtidigt, lön enligt ordinarie schema om totalen är lika. Ingen helglön flyttas." },
  { slag: "Martins beslut", rubrik: "Var komp-saldot bor", text: "i Fortnox (appen rapporterar bara intjänat/uttaget) eller i appen (appen räknar saldot). Appen räknar aldrig kronor — men ett saldo i timmar är en mängd." },
];
