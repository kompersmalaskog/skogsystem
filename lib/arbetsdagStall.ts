// Stall-detektion för timvisa MOM-filer.
//
// Maskinen exporterar en fil ~var 60:e minut MEDAN DEN KÖR, och varje fil
// skjuter arbetsdagens slut_tid framåt till ungefär "nu". Filerna innehåller
// ingen "skiftet är avslutat"-markering (verifierat 2026-07-21 mot råfilerna:
// enda skillnaden i en slutrapport är förarens FRIVILLIGA utloggnings-
// kommentar, ShiftDescription — fanns 20 juli, saknades 18–19 juli).
// "Dagen är slut" är händelsen att filer SLUTAR komma — importen kan inte
// upptäcka att inget händer; bara den som vet vad klockan är kan det.
// Därför: dagen betraktas som avslutad när slut_tid inte växt på STALL_MIN
// minuter. Under arbete triggar det aldrig (nästa timfil hinner alltid före);
// efter sista filen slår det till av sig självt.

// 1,5 filintervall (~60 min) + synkmarginal (OneDrive). Justeras här om
// praktiken visar att filer fördröjs mer än så.
export const STALL_MIN = 90;

// Epoch-ms för en svensk väggklockstid ('YYYY-MM-DD', 'HH:MM[:SS]'),
// oberoende av klientens/serverns tidszon. Intl longOffset ger rätt
// sommar-/vintertid — toLocaleString+new Date-tricket parsas i lokal tz
// och gav fel på icke-UTC-servrar (samma läxa som kl17-hjälpen i mom-import).
export function svenskTidTillEpoch(datum: string, tid: string): number {
  const ref = new Date(`${datum}T12:00:00Z`);
  const offsetStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', timeZoneName: 'longOffset' })
    .formatToParts(ref).find(p => p.type === 'timeZoneName')?.value || 'GMT+02:00';
  const m = offsetStr.match(/([+-])(\d{2}):(\d{2})/);
  const offMin = m ? (m[1] === '-' ? -1 : 1) * (parseInt(m[2]) * 60 + parseInt(m[3])) : 120;
  const t = tid.length === 5 ? `${tid}:00` : tid;
  return new Date(`${datum}T${t}Z`).getTime() - offMin * 60_000;
}

// Dagens datum i svensk tid ('YYYY-MM-DD' — sv-SE-formatet är ISO).
export function svensktIdag(nu: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(nu);
}

// Ser dagen avslutad ut? Historiska dagar: alltid (slut_tid är slutgiltig).
// Dagens datum: bara när slut_tid stått stilla i STALL_MIN minuter.
// Utan slut_tid finns inget avslut att bedöma.
export function arDagAvslutad(datum: string, slutTid: string | null | undefined, nu: Date = new Date()): boolean {
  if (!slutTid) return false;
  if (datum !== svensktIdag(nu)) return true;
  return nu.getTime() > svenskTidTillEpoch(datum, slutTid) + STALL_MIN * 60_000;
}
