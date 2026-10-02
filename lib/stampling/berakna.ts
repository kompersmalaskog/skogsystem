// STÄMPLINGSVYN — räknelogiken. Ren funktion, ingen I/O.
//
// Frågan: jag har en stämplingslängd (diameterklass, trädslag, antal träd)
// på en post jag ska bjuda på. Vad får jag ut i timmer, kubb och massaved
// enligt vår egen avverkade skog?
//
// Modellen (stamplings_klass, förberäknad efter import) har per trädslag
// och 5 cm-klass medelvolymen per stam och sortimentandelarna, i tre rader:
// 'alla' (datans egen blandning), 'ja' (stammar med massaved i rotändan —
// rotbiten föraren kapade bort) och 'nej'. Användarens rötandel blandar
// ja/nej i klasser från 20 cm; under det är första stocken massaved av
// dimension, inte av röta. Där ja/nej har färre än MIN_STAMMAR används
// 'alla'. Trädslagen hålls isär — tall ger 8–9 procentenheter mer timmer
// än gran i grova dimensioner. Övrigt barr räknas som gran.
//
// Klasser över 55 cm extrapoleras från 50–55 och märks. Under 10 cm finns
// en egen klass (5) i datan och används när den har underlag.
//
// Verifierat mot Jeppshoka 1:14 (2026-10-02): på skördarens egen
// diameterfördelning −2,7 % i volym, timmerandel 58,6 mot 57,8 %. På
// förrättarens stämplingslängd −12 % i volym: klaven hade 350 färre träd i
// 32–46 cm än skördaren mätte. Andelarna håller, volymen hänger på klavningen.

export type Slag = 'tall' | 'gran' | 'ovrigt_barr';
export type Rad = { slag: Slag; cm: number; antal: number };
export type Cell = {
  slag: string; klass: number; rot: 'alla' | 'ja' | 'nej';
  stammar: number; objekt: number; m3_per_stam: number;
  timmer_pct: number; kubb_pct: number; massa_pct: number; ovrigt_pct: number;
};
export type Meta = Record<string, number | null>;

export const MIN_STAMMAR = 50;     // krav per klass och trädslag
export const ROT_FRAN_KLASS = 20;  // rötandelen blandar bara klasser från 20 cm
export const EXTRAPOLERAD_FRAN_CM = 55;

export type Volymer = { vol: number; timmer: number; kubb: number; massa: number; ovrigt: number };
export type RadUtbyte = Volymer & {
  rad: Rad; klass: number; extrapolerad: boolean; tunt: boolean; saknas: boolean; rotBlandad: boolean;
};
export type Spann = { timmer: [number, number]; kubb: [number, number]; massa: [number, number]; rot: [number, number] };
export type Resultat = {
  trad: number;
  total: Volymer;
  perSlag: Record<'tall' | 'gran', Volymer & { trad: number }>;
  rader: RadUtbyte[];
  rot: number | null;          // rötandelen som användes (0–1), null = ingen rotblandning möjlig
  rotStandard: boolean;        // true = medianen ur datan, inget eget val
  spann: Spann | null;         // utfallet vid datans kvartiler i rötandel
  extrapoleradeTrad: number;   // träd över 55 cm
  tuntTrad: number;            // träd i klasser med < MIN_STAMMAR i datan
  saknadeTrad: number;         // träd i klasser utan data alls
};

export const SLAG_NAMN: Record<Slag, string> = { tall: 'Tall', gran: 'Gran', ovrigt_barr: 'Övrigt barr' };

export function modellSlag(s: Slag): 'tall' | 'gran' { return s === 'tall' ? 'tall' : 'gran'; }

/** Stämplingslängdens 2 cm-klass (klassmitt, jämna cm) → modellens 5 cm-klass. */
export function klassFor(cm: number): { klass: number; extrapolerad: boolean } {
  if (cm >= EXTRAPOLERAD_FRAN_CM) return { klass: 50, extrapolerad: true };
  if (cm < 10) return { klass: 5, extrapolerad: false };
  return { klass: Math.floor(cm / 5) * 5, extrapolerad: false };
}

const tom = (): Volymer => ({ vol: 0, timmer: 0, kubb: 0, massa: 0, ovrigt: 0 });
const addera = (a: Volymer, b: Volymer): Volymer =>
  ({ vol: a.vol + b.vol, timmer: a.timmer + b.timmer, kubb: a.kubb + b.kubb, massa: a.massa + b.massa, ovrigt: a.ovrigt + b.ovrigt });

/** En cells volymer för ETT träd. */
function perTrad(c: Cell): Volymer {
  const v = c.m3_per_stam;
  return { vol: v, timmer: v * c.timmer_pct / 100, kubb: v * c.kubb_pct / 100,
           massa: v * c.massa_pct / 100, ovrigt: v * c.ovrigt_pct / 100 };
}
const skala = (v: Volymer, k: number): Volymer =>
  ({ vol: v.vol * k, timmer: v.timmer * k, kubb: v.kubb * k, massa: v.massa * k, ovrigt: v.ovrigt * k });

function hitta(celler: Cell[], slag: string, klass: number, rot: Cell['rot']) {
  return celler.find(c => c.slag === slag && c.klass === klass && c.rot === rot) ?? null;
}

/** Utbytet för en rad i stämplingslängden vid rötandelen r (0–1, eller null = datans blandning). */
export function radUtbyte(rad: Rad, celler: Cell[], r: number | null): RadUtbyte {
  const slag = modellSlag(rad.slag);
  const { klass, extrapolerad } = klassFor(rad.cm);
  let alla = hitta(celler, slag, klass, 'alla');
  let anvandKlass = klass;
  // Under 10 cm utan underlag: närmaste klass med data (10).
  if ((!alla || alla.stammar < MIN_STAMMAR) && klass === 5) {
    const tio = hitta(celler, slag, 10, 'alla');
    if (tio) { alla = tio; anvandKlass = 10; }
  }
  if (!alla) {
    return { ...tom(), rad, klass, extrapolerad, tunt: false, saknas: true, rotBlandad: false };
  }
  const tunt = alla.stammar < MIN_STAMMAR;
  let ett = perTrad(alla);
  let rotBlandad = false;
  if (r != null && anvandKlass >= ROT_FRAN_KLASS) {
    const ja = hitta(celler, slag, anvandKlass, 'ja');
    const nej = hitta(celler, slag, anvandKlass, 'nej');
    if (ja && nej && ja.stammar >= MIN_STAMMAR && nej.stammar >= MIN_STAMMAR) {
      ett = addera(skala(perTrad(ja), r), skala(perTrad(nej), 1 - r));
      rotBlandad = true;
    }
  }
  return { ...skala(ett, rad.antal), rad, klass, extrapolerad, tunt, saknas: false, rotBlandad };
}

function summera(rader: Rad[], celler: Cell[], r: number | null) {
  const ut = rader.filter(x => x.antal > 0).map(x => radUtbyte(x, celler, r));
  const total = ut.reduce((a, x) => addera(a, x), tom());
  return { ut, total };
}

/** Hela stämplingslängden. rotVal = användarens rötandel (0–1) eller null för medianen ur datan. */
export function berakna(rader: Rad[], celler: Cell[], meta: Meta, rotVal: number | null): Resultat {
  const median = meta.rot20_median ?? null;
  const r = rotVal ?? median;
  const { ut, total } = summera(rader, celler, r);
  const perSlag: Resultat['perSlag'] = { tall: { ...tom(), trad: 0 }, gran: { ...tom(), trad: 0 } };
  for (const x of ut) {
    const s = modellSlag(x.rad.slag);
    perSlag[s] = { ...addera(perSlag[s], x), trad: perSlag[s].trad + x.rad.antal };
  }
  const q1 = meta.rot20_q1, q3 = meta.rot20_q3;
  let spann: Spann | null = null;
  if (q1 != null && q3 != null && r != null && ut.some(x => x.rotBlandad)) {
    const lag = summera(rader, celler, q3).total;   // mer röta → mindre timmer
    const hog = summera(rader, celler, q1).total;
    const ordna = (a: number, b: number): [number, number] => (a <= b ? [a, b] : [b, a]);
    spann = { timmer: ordna(lag.timmer, hog.timmer), kubb: ordna(lag.kubb, hog.kubb),
              massa: ordna(lag.massa, hog.massa), rot: [q1, q3] };
  }
  return {
    trad: ut.reduce((a, x) => a + x.rad.antal, 0),
    total, perSlag, rader: ut, rot: r, rotStandard: rotVal == null, spann,
    extrapoleradeTrad: ut.filter(x => x.extrapolerad && !x.saknas).reduce((a, x) => a + x.rad.antal, 0),
    tuntTrad: ut.filter(x => x.tunt && !x.saknas).reduce((a, x) => a + x.rad.antal, 0),
    saknadeTrad: ut.filter(x => x.saknas).reduce((a, x) => a + x.rad.antal, 0),
  };
}

/** Klistrad text → rader. En rad per klass: "diameter antal", skiljetecken fritt.
 *  Rader utan två tal hoppas över; udda diametrar behålls som de är. */
export function tolkaLangd(text: string, slag: Slag): Rad[] {
  const rader: Rad[] = [];
  for (const rad of text.split(/\r?\n/)) {
    const tal = rad.replace(',', '.').match(/-?\d+(?:\.\d+)?/g);
    if (!tal || tal.length < 2) continue;
    const cm = Number(tal[0]);
    const antal = Math.round(Number(tal[tal.length - 1]));
    if (!Number.isFinite(cm) || !Number.isFinite(antal) || cm < 4 || cm > 120 || antal <= 0) continue;
    rader.push({ slag, cm, antal });
  }
  return rader;
}

/** Rader → text för rutan (en rad per klass). */
export function langdTillText(rader: Rad[], slag: Slag): string {
  return rader.filter(r => r.slag === slag).sort((a, b) => a.cm - b.cm).map(r => `${r.cm} ${r.antal}`).join('\n');
}

/** Stämplingsrapportens egen utbyteskalkyl, för jämförelse. */
export type Rapport = { m3fub: number | null; timmerPct: number | null; massaPct: number | null };
export function jamforRapport(res: Resultat, rapport: Rapport) {
  if (rapport.m3fub == null || rapport.m3fub <= 0) return null;
  const timmer = rapport.timmerPct != null ? rapport.m3fub * rapport.timmerPct / 100 : null;
  const massa = rapport.massaPct != null ? rapport.m3fub * rapport.massaPct / 100 : null;
  return {
    rapportVol: rapport.m3fub, rapportTimmer: timmer, rapportMassa: massa,
    diffVol: res.total.vol - rapport.m3fub,
    diffTimmer: timmer != null ? res.total.timmer - timmer : null,
    diffTimmerPe: timmer != null && res.total.vol > 0 && rapport.timmerPct != null
      ? 100 * res.total.timmer / res.total.vol - rapport.timmerPct : null,
  };
}
