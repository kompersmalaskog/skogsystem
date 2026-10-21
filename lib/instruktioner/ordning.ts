// VEM FÅR PLATSEN: ett kort åt gången där föraren tittar (nertill/upptill vid avlägget). Ordning:
//
//   1. lossningskortet (skotarläget, #863: "Lossar → Avlägg", Ändra-arket, "Nytt avlägg här?", Kvar/Färdigskotad/Väntar-arken)
//   2. larm (lib/larm)
//   3. instruktion (lib/instruktioner) — väntar tills 1 och 2 är borta
//   4. avläggsraden med målbilden (#871, AvlaggForstaLasset) — väntar tills instruktionen fått Sett
//
// Larmkortet och lossningskortet ändras inte av det här: ett larm (fara) får aldrig vänta på något annat kort. Det är instruktionen och avläggsraden som viker sig.
// Sidan och testerna använder SAMMA två funktioner, så ordningen står på ett ställe.

/** Instruktionskortet får inte visas medan lossningsflödet eller ett larmkort har platsen. */
export const instruktionBlockerad = (a: { larmVisas: boolean; lossningVisas: boolean }): boolean => a.larmVisas || a.lossningVisas;

/**
 * Avläggsraden (målbilden) är ledig bara när inget annat nertill-läge pågår (`ledigtUtanInstruktion`: som förut) OCH ingen instruktion väntar på Sett.
 * `instruktionVantar` gäller också medan instruktionen själv väntar på larm/lossning — då har den redan företräde framför avläggsraden.
 */
export const avlaggsradLedig = (a: { ledigtUtanInstruktion: boolean; instruktionVantar: boolean }): boolean => a.ledigtUtanInstruktion && !a.instruktionVantar;
