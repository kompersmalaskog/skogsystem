// "Var låg virket?" — hur traktens volym fördelar sig på avstånd från avlägget.
//
// VARFÖR DEN FINNS: skotningstillägget är ETT tal för hela trakten, och ett
// snitt säger inget om spridningen. Låg allt virke på 400 m, eller låg hälften
// på 200 och hälften på 600? Den frågan ställer en inköpare, och utan svaret
// är avståndet bara en siffra att tvivla på.
//
// MÅTTET ÄR FÅGELVÄG, och det sägs rakt ut i rapporten. Det är kortare än den
// körda vägen — tabellen visar var virket LÅG, inte hur långt maskinen körde.
// Priset räknas på lassens egna mätningar (lib/faktura/lassAvstand), aldrig
// på den här fördelningen.
//
// RUTOR, INTE STAMMAR: 2 842 stammar på Skälviken skulle ge 2 842 avstånd att
// vikta. Stammarna läggs i 20 m-rutor först — samma upplösning som skotaren
// arbetar i — och varje rutas volym får rutans eget avstånd.

/** En stam med plats och volym. Stammar utan båda hör inte hit. */
export type Stam = { lat: number; lng: number; volym: number };

/** En avståndsklass i tabellen. */
export type Avstandsklass = {
  /** "200–300 m" — med tankstreck, som appen skriver intervall. */
  etikett: string;
  /** Nedre gränsen i meter; sorteringen bygger på den. */
  fran: number;
  m3fub: number;
  /** Hela procent av traktens volym. Summerar alltid till 100. */
  andel: number;
};

export type Virkesfordelning = {
  klasser: Avstandsklass[];
  /** Summan av klasserna — traktens skördade volym, ur stammarna. */
  summaM3fub: number;
  /** Rutor bakom talen. Säger hur grov bilden är. */
  rutor: number;
  /** Stammar utan plats eller volym; de räknas inte och sägs i rapporten. */
  utan: number;
};

/** Rutans sida i meter. Samma upplösning som skotaren arbetar i. */
export const RUTA_M = 20;

/** Klassernas bredd i meter. */
const KLASS_M = 100;

/** Längsta klassen med egen rad; allt över hamnar i "N m och längre". */
const SISTA_FRAN = 900;

const M_PER_GRAD_LAT = 111320;
const mPerGradLng = (lat: number) => M_PER_GRAD_LAT * Math.cos((lat * Math.PI) / 180);

/**
 * Fördelningen av volym på avstånd från NÄRMASTE avlägg.
 *
 * Närmaste, inte det första: en trakt kan ha flera avlägg, och virket körs
 * till det som ligger närmast. Räknar vi mot ett enda får halva trakten ett
 * avstånd ingen kört.
 *
 * Utan avlägg eller utan stammar med volym finns ingen fördelning (null) —
 * aldrig en tabell av nollor.
 */
export function virkesfordelning(
  stammar: Stam[],
  avlagg: { lat: number; lng: number }[],
): Virkesfordelning | null {
  if (avlagg.length === 0) return null;

  const giltiga = stammar.filter(
    s => Number.isFinite(s.lat) && Number.isFinite(s.lng) && Number.isFinite(s.volym) && s.volym > 0,
  );
  const utan = stammar.length - giltiga.length;
  if (giltiga.length === 0) return null;

  // Rutnätet läggs i grader, så en ruta är ~20 m i båda led på traktens
  // latitud. Nyckeln är rutans index; mitten räknas ur indexet, aldrig som
  // medelvärdet av stammarna i den (då flyttar rutan sig med virket).
  const latMitt = giltiga.reduce((s, p) => s + p.lat, 0) / giltiga.length;
  const stegLat = RUTA_M / M_PER_GRAD_LAT;
  const stegLng = RUTA_M / mPerGradLng(latMitt);

  const rutor = new Map<string, number>();
  for (const s of giltiga) {
    const iy = Math.floor(s.lat / stegLat);
    const ix = Math.floor(s.lng / stegLng);
    const nyckel = `${iy}:${ix}`;
    rutor.set(nyckel, (rutor.get(nyckel) ?? 0) + s.volym);
  }

  const perKlass = new Map<number, number>();
  let summa = 0;
  for (const [nyckel, vol] of rutor) {
    const [iy, ix] = nyckel.split(':').map(Number);
    const lat = (iy + 0.5) * stegLat;
    const lng = (ix + 0.5) * stegLng;
    let narmast = Infinity;
    for (const a of avlagg) {
      const dy = (lat - a.lat) * M_PER_GRAD_LAT;
      const dx = (lng - a.lng) * mPerGradLng(lat);
      const m = Math.sqrt(dy * dy + dx * dx);
      if (m < narmast) narmast = m;
    }
    const fran = Math.min(SISTA_FRAN, Math.floor(narmast / KLASS_M) * KLASS_M);
    perKlass.set(fran, (perKlass.get(fran) ?? 0) + vol);
    summa += vol;
  }
  if (summa <= 0) return null;

  // Andelarna avrundas med största resten, så de summerar till 100 — en
  // tabell vars procent slutar på 99 läses som ett räknefel.
  const poster = [...perKlass.entries()].sort((a, b) => a[0] - b[0]);
  const andelar = heltalTill100(poster.map(([, v]) => (v / summa) * 100));

  const klasser: Avstandsklass[] = poster.map(([fran, vol], i) => ({
    etikett: fran === 0 ? `under ${KLASS_M} m`
      : fran >= SISTA_FRAN ? `${fran} m och längre`
      : `${fran}–${fran + KLASS_M} m`,
    fran,
    m3fub: Math.round(vol),
    andel: andelar[i],
  }));

  return { klasser, summaM3fub: Math.round(summa), rutor: rutor.size, utan };
}

/** Procent som summerar till 100 (största resten). */
function heltalTill100(tal: number[]): number[] {
  const golv = tal.map(t => Math.floor(t));
  let kvar = 100 - golv.reduce((a, b) => a + b, 0);
  const ordning = tal
    .map((t, i) => ({ i, rest: t - Math.floor(t) }))
    .sort((a, b) => b.rest - a.rest);
  const ut = [...golv];
  for (const { i } of ordning) {
    if (kvar <= 0) break;
    ut[i] += 1;
    kvar -= 1;
  }
  return ut;
}
