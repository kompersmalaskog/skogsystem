// VEM FÅR PLATSEN: ett kort åt gången där föraren tittar (nertill/upptill vid avlägget). Ordning:
//
//   1. lossningskortet (skotarläget, #863: "Lossar → Avlägg", Ändra-arket, "Nytt avlägg här?", Kvar/Färdigskotad/Väntar-arken)
//   2. larm (lib/larm)
//   3. instruktion (lib/instruktioner) — väntar tills 1 och 2 är borta
//   4. avläggsraden med målbilden (#871, AvlaggForstaLasset) — väntar tills instruktionen fått Sett
//
// Larmkortet och lossningskortet ändras inte av det här: ett larm (fara) får aldrig vänta på något annat kort. Det är instruktionen och avläggsraden som viker sig.
// Sidan och testerna använder SAMMA två funktioner, så ordningen står på ett ställe.

/**
 * Har larmet platsen — alltså ska instruktionen vänta? Ett larm har platsen medan det väntar på "Sett" (`vantarPaSett`: Sett-raden visas), och ALLTID om det är en Fara (Röd):
 * en fara får aldrig skymmas. En Röd har ingen Sett-rad (Martin 2026-10-22) — den håller platsen så länge den larmar, alltså tills man passerat; `arFara` gäller både det stora
 * kortet och en Röd i "+"-raden under ett annat stort kort (annars tog instruktionen platsen medan en El-ledning fortfarande larmade). Efter Sett står larmkortet kvar så länge man är inne i en förbjuden yta (lib/larm: "kvitterad men inte tystad") — då har föraren sett det, och
 * instruktionen för just den ytan får platsen (larmkortet göms medan instruktionen visas och kommer tillbaka efter dess Sett). Utan den regeln kunde instruktionen på en
 * hänsynsyta aldrig visas inne i ytan: larmkortet står kvar tills man kört ut.
 */
export const larmHallerPlatsen = (a: { harKort: boolean; vantarPaSett: boolean; arFara: boolean }): boolean => a.harKort && (a.vantarPaSett || a.arFara);

/** Instruktionskortet får inte visas medan lossningsflödet eller ett larm har platsen (`larmVisas` = `larmHallerPlatsen`). */
export const instruktionBlockerad = (a: { larmVisas: boolean; lossningVisas: boolean }): boolean => a.larmVisas || a.lossningVisas;

/**
 * Avläggsraden (målbilden) är ledig bara när inget annat nertill-läge pågår (`ledigtUtanInstruktion`: som förut) OCH ingen instruktion väntar på Sett.
 * `instruktionVantar` gäller också medan instruktionen själv väntar på larm/lossning — då har den redan företräde framför avläggsraden.
 */
export const avlaggsradLedig = (a: { ledigtUtanInstruktion: boolean; instruktionVantar: boolean }): boolean => a.ledigtUtanInstruktion && !a.instruktionVantar;
