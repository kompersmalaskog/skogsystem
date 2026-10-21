// Rotpost eller avverkningsuppdrag: avtalsformen avgör om en stämplingslängd ska finnas — inte typen (Martin 2026-10-20).
//
//   Rp = rotpost: virket säljs på rot och måste stämplas → stämplingslängd ska finnas; saknas den är det en fråga.
//   Au = avverkningsuppdrag: inget säljs på rot, det finns inget att stämpla → frågan ställs aldrig.
//
// Verifierat i prod 2026-10-20 på de objekt där fältet fångats: Arvidstorp RP (Rp, har), Bågskyttebanan RP (Rp, har), N Rimshult gallring (Au, har ingen — korrekt).
// OBS: `avtalsform` fångas bara på 3 av 67 objekt (de tre nyimportade; den nuvarande importversionen läser fältet, de 64 äldre gjorde det inte).
// Därför kunde regeln inte ses förut: fältet som avgör var nästan alltid tomt. Saknas avtalsformen faller vi tillbaka på "RP" i objektnamnet.
// En gallring kan i princip vara rotpost, så typen är inte med i bedömningen.

// ANVÄND ALDRIG `objekt.atgard` för att avgöra om något är en rotpost (Martin 2026-10-20, kontrollerat mot prod). Fältet blandar två frågor —
// avtalsform (Au, Rp) och åtgärd (Gallring, Första gallring, Special, GROT) — och SÄGER EMOT avtalsform där båda finns: Bågskyttebanan har
// atgard='Au' men avtalsform='Rp'. Fem av de nio rotposterna har atgard='Au'; två (Göljahult RP, Uggleboda H-A RP -24) har varken atgard eller
// avtalsform och fångas bara av namnreserven nedan. Avtalsformen har egen kolumn sedan 20261014125836 (`objekt.atgard` ≠ `objekt.avtalsform`).
// Vakt: lib/objekt/rotpost.test.ts ("atgard används aldrig") — den faller om fältet läses här eller i frågorna som bygger på regeln.

/**
 * "RP" som ett eget ord i objektnamnet ("Bågskyttebanan RP J-Hus- 25", "Göljahult RP"). Ordgräns med Unicode-bokstäver, inte \b: JavaScripts \b
 * är ASCII-bundet och skulle behandla å/ä/ö som icke-ordtecken. Versaler bara — "Åkarp", "Karstorp" och "Rapp" innehåller rp/Rp men är inte RP.
 * Mot alla 69 objektnamn i prod 2026-10-20 träffar den exakt de nio rotposterna (lib/objekt/rotpost.test.ts).
 */
export const RP_I_NAMN = /(?<![\p{L}\p{N}])RP(?![\p{L}\p{N}])/u;

/**
 * Är objektet en rotpost? Avtalsformen avgör när den finns (Rp → ja; Au, LRK, VF/Bark → nej). Saknas den: "RP" i namnet. Varken eller → nej
 * (frågan ställs inte och raden visas inte).
 */
export function arRotpost(o: { avtalsform?: string | null; namn?: string | null }): boolean {
  const form = (o.avtalsform ?? '').trim();
  if (form !== '') return form.toLowerCase() === 'rp';
  return RP_I_NAMN.test(o.namn ?? '');
}
