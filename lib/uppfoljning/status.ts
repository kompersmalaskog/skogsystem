// Delad statuslogik för uppföljningen — EN sanning för listan
// (app/uppfoljning/page.tsx) och detaljvyns statusrad (UppfoljningVy).
//
// "Kör" kräver FAKTISK aktivitet (fakt_tid senaste 7 dagarna). Ett objekt
// med tilldelad maskin men utan aktivitet är "Pågående" — aldrig "kör".

export type UppfoljningStatusKey = 'skordare' | 'skotare' | 'vantar' | 'pagaende' | 'done';

// Statusfärger — samma prick i listan och i detaljvyns statusrad.
export const STATUS_FARG: Record<UppfoljningStatusKey, string> = {
  skordare: '#a8d582',
  skotare: '#f0b24c',
  vantar: '#ff9f0a',
  pagaende: '#8e8e93',
  done: '#30d158',
};

// Strukturell delmängd som både listans UppfoljningObjekt och detaljens
// UppfoljningData uppfyller. Volymfälten heter olika i de två typerna —
// anroparen mappar (volymSkordare→skordat, volymSkotare→skotat).
export interface StatusFalt {
  status?: string;
  externSkotning?: boolean;
  skordareStart?: string | null;
  skordareSlut?: string | null;
  skordareLastDate?: string | null;
  skotareStart?: string | null;
  skotareSlut?: string | null;
  skotareLastDate?: string | null;
  skordat: number;
  skotat: number;
}

export interface UppfoljningStatus {
  t: string;
  k: UppfoljningStatusKey;
  // Dag-räknare: tidigaste start → idag (→ senaste slut när avslutat). Dag 1 = första dagen.
  dagar: number | null;
  // m³ kvar att skota. null när kvar inte ska/kan visas — se visaKvar/kvarOkant.
  kvar: number | null;
  // ÄRLIGHET: skotat > 0 men skördat = 0 betyder att skördardatan saknas
  // (t.ex. OneDrive-synk-lucka) — då är kvar OKÄNT, inte 0. Visa aldrig
  // "0 m³ kvar" i det läget.
  kvarOkant: boolean;
  // false när ingen skotning väntas från oss (extern skotning, avslutat)
  // eller när skördardata saknas.
  visaKvar: boolean;
}

function dagarSedan(iso: string): number {
  return Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 864e5));
}
function dagarMellan(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5));
}

export function uppfoljningStatus(o: StatusFalt): UppfoljningStatus {
  const seven = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const skAct = !!(o.skordareLastDate && o.skordareLastDate >= seven);
  const stAct = !!(o.skotareLastDate && o.skotareLastDate >= seven);
  const skDone = !!o.skordareSlut;
  const avslutat = o.status === 'avslutat';

  let t: string;
  let k: UppfoljningStatusKey;
  if (avslutat) {
    t = 'Avslutat'; k = 'done';
  } else if (skAct && stAct) {
    // Båda kör — säg det. Nyckeln förblir 'skordare' så listans gruppering
    // och prickfärg inte ändras (skördaren vann även innan).
    t = 'Skördare + skotare kör'; k = 'skordare';
  } else if (skAct) {
    t = 'Skördare kör'; k = 'skordare';
  } else if (stAct) {
    t = 'Skotare kör'; k = 'skotare';
  } else if (skDone && o.externSkotning) {
    // Extern skotning: någon annan skotar — objektet ska inte fastna i
    // 'Väntar på skotning' (det kommer aldrig en skotarfil från oss).
    t = 'Skotas externt'; k = 'pagaende';
  } else if (skDone) {
    t = 'Väntar på skotning'; k = 'vantar';
  } else {
    t = 'Pågående'; k = 'pagaende';
  }

  const start = [o.skordareStart, o.skotareStart].filter(Boolean).sort()[0] || null;
  const slut = [o.skordareSlut, o.skotareSlut].filter(Boolean).sort().reverse()[0] || null;
  let dagar: number | null = null;
  if (start) dagar = avslutat && slut ? dagarMellan(start, slut) : dagarSedan(start);

  const kvarOkant = o.skordat <= 0 && o.skotat > 0;
  const visaKvar = !avslutat && !o.externSkotning && !kvarOkant && o.skordat > 0;
  const kvar = visaKvar ? Math.max(0, o.skordat - o.skotat) : null;

  return { t, k, dagar, kvar, kvarOkant, visaKvar };
}
