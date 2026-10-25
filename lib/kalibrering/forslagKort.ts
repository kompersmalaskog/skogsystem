/**
 * "GÖR SÅ HÄR" — kortet överst i Läget: ETT nästa steg, aldrig en lista. Appen säger vad som ska göras i maskinen; föraren behöver aldrig se reglerna.
 *
 * Fyra sorters steg, i den ordning appen själv håller (föraren bestämmer inte ordningen):
 *   1. KOLLA   — knivar och valsar. Greppet har släppt tydligt oftare än förra månaden, eller en punkt har stor spridning mellan stammar (trycket kan
 *                inte höjas om knivarna är slitna). Svaret är "Klart, allt såg bra ut" eller "Bytte något".
 *   2. TRYCK   — höj trycket på knivar och hjul (spridning över 4,5 mm mellan stammar). Före kurvan: en tryckändring flyttar kurvan.
 *   3. KURVA   — ändra diameterkurvan för ett trädslag ("Sänk tall 3 mm", punkterna som ska ändras). Aldrig samma vecka som en tryckändring.
 *   4. KLAVA   — en punkt har för få stammar för att kunna ändras: "Klava en tall 250 mm".
 * Inget av de senare visas medan ett tidigare steg väntar: klavar man eller kalibrerar före en tryckändring eller ett bladbyte blir det fel efteråt.
 *
 * "10 stammar", "en veckas väntan" och "grepp/tryck före kurva" ligger här och i forslag.ts, inte i vyn. Rent — rutten hämtar, vyn ritar.
 */
import { greppRutnat, type GreppRad } from './greppTid';
import { FORSLAG, klassIOrd, type PunktBesked } from './forslag';
import { senasteTryck, type Andring } from './forslagMarkorer';
import { stegManad } from './datum';

/**
 * Greppandelen måste ha stigit så här många procentenheter mot föregående månad (samma trädslag) för att kortet ska säga "Kolla knivar och valsar".
 *
 * Vald mot historiken (prod 2026-10-24, alla tre skördare, trädslag × månad med minst 20 stammar båda månaderna, månader i följd): 43 par, medel +0,6 och
 * spridning 4,0 procentenheter mellan en månad och nästa. Antal par som skulle ge ett steg vid olika trösklar: ≥3 pe 14 (33 %), ≥4 9 (21 %), ≥5 7 (16 %),
 * ≥6 4 (9 %), ≥7 3, ≥8 1. 6 pe är drygt 1,5 gånger den vanliga månadsvariationen och ger ett steg i ungefär var elfte trädslagsmånad; 3–4 pe hade
 * larmat i en av tre och blivit en rutin som ingen läser. Fyra träffar: tall oktober (Scorpionen +7,2 och R64428 +7,2), övrigt löv september (Scorpionen
 * +6,5) och björk juni (R64428 +9,1). Gran oktober på Scorpionen (+2,7) ger inget. Samma ökning för tall på båda maskinerna i oktober (olika märken) tyder på att
 * en del av ökningen är trädslag/säsong, inte slitage — kontrollen tar två minuter och svaret sparas, så en falsk signal kostar lite.
 */
export const GREPP_STEG_PP = 6;

export type GreppSteg = { tradslag: string; manad: string; forra: string; fran: number; till: number; pp: number };

/**
 * Trädslag vars grepp stigit tydligt: senaste månaden mot månaden före, båda med nog stammar (GREPP_MIN_STAMMAR) och månaderna i följd. Bara en
 * månad som är innevarande eller förra räknas — en ökning för tre månader sedan är inget att kolla idag.
 */
export function greppSteg(rader: GreppRad[], idag: string): GreppSteg[] {
  const rutnat = greppRutnat(rader, 'manad');
  const nyast = stegManad(idag.slice(0, 7), -1);
  const ut: GreppSteg[] = [];
  for (const rad of rutnat.rader) {
    if (rad.id.endsWith('+')) continue; // raden för grova stammar är alla trädslag ihop
    let i = rad.celler.length - 1;
    while (i >= 0 && (rad.celler[i] == null || rad.celler[i]!.tunn)) i--;
    if (i < 1) continue;
    const nu = rad.celler[i]!;
    const forra = rad.celler[i - 1];
    if (!forra || forra.tunn || rutnat.perioder[i - 1] !== stegManad(rutnat.perioder[i], -1)) continue;
    if (rutnat.perioder[i] < nyast) continue;
    const pp = nu.pct - forra.pct;
    if (Math.round(pp) < GREPP_STEG_PP) continue; // dömt på det avrundade tal som visas
    ut.push({ tradslag: rad.etikett, manad: rutnat.perioder[i], forra: rutnat.perioder[i - 1], fran: forra.pct, till: nu.pct, pp });
  }
  return ut;
}

// === Stegen ===
export type Steg =
  | { slag: 'kolla'; id: 'kolla'; grepp: GreppSteg[]; spridning: PunktBesked[] }
  | { slag: 'tryck'; id: 'tryck'; punkter: PunktBesked[] }
  | { slag: 'kurva'; id: string; tradslag: string; punkter: (PunktBesked & { andringMm: number })[] }
  | { slag: 'klava'; id: string; tradslag: string; punkt: PunktBesked };

export type KortLage = 'steg' | 'inget' | 'vanta';
export type Kort = {
  lage: KortLage;
  steg: Steg[];
  /** Sista dagen av väntan efter en tryckändring (lage 'vanta'). */
  vantaTill: string | null;
};

const plusDagar = (datum: string, n: number): string => new Date(new Date(`${datum}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/**
 * Stegen i ordning. `kollat` = dagarna föraren svarat på knivar och valsar (Klart eller Bytte något). Ett Kolla-steg är gjort när varje orsak till det
 * har ett svar daterat på eller efter orsaken: greppets orsak daterad från första dagen i den månad ökningen syns, spridningens från fönstrets början.
 */
export function byggKort(args: { punkter: PunktBesked[]; grepp: GreppSteg[]; andringar: Andring[]; kollat: string[]; idag: string }): Kort {
  const { punkter, grepp, andringar, kollat, idag } = args;
  const svaratEfter = (datum: string) => kollat.some(k => k >= datum);

  const spridning = punkter.filter(p => (p.spak === 'tryck' || p.spak === 'bada') && !svaratEfter(p.fonsterFran));
  const greppAtt = grepp.filter(g => !svaratEfter(`${g.manad}-01`));
  const tryckPunkter = punkter.filter(p => p.spak === 'tryck' || p.spak === 'bada');

  // Stegen som gäller om varje steg före besvaras med "allt var bra": Kolla först; sedan antingen Höj trycket (som börjar om hela fönstret — då finns inget
  // att säga om kurvan förrän nya stammar klavats, så räkningen slutar där) eller Ändra kurvan och Klava. "Steg 1 av N" visar alltså det appen redan vet.
  const steg: Steg[] = [];
  if (greppAtt.length > 0 || spridning.length > 0) steg.push({ slag: 'kolla', id: 'kolla', grepp: greppAtt, spridning });
  if (tryckPunkter.length > 0) {
    steg.push({ slag: 'tryck', id: 'tryck', punkter: tryckPunkter });
    return { lage: 'steg', steg, vantaTill: null };
  }

  const tryck = senasteTryck(andringar);
  const vantaTill = tryck ? plusDagar(tryck.datum, FORSLAG.VECKA_DAGAR) : null;
  const veckaGar = !!vantaTill && idag < vantaTill;

  const kurvor = new Map<string, (PunktBesked & { andringMm: number })[]>();
  for (const p of punkter) {
    if (p.besked === 'justera' && p.spak === 'kurva' && p.andringMm != null) kurvor.set(p.tradslag, [...(kurvor.get(p.tradslag) ?? []), p as PunktBesked & { andringMm: number }]);
  }
  if (!veckaGar) for (const [tradslag, lista] of kurvor) steg.push({ slag: 'kurva', id: `kurva:${tradslag}`, tradslag, punkter: lista });
  // Klava: den punkt per trädslag som ligger närmast 10 stammar.
  const perArt = new Map<string, PunktBesked>();
  for (const p of punkter) {
    if (p.besked !== 'klava') continue;
    const nu = perArt.get(p.tradslag);
    if (!nu || p.stammar > nu.stammar) perArt.set(p.tradslag, p);
  }
  for (const [tradslag, punkt] of perArt) steg.push({ slag: 'klava', id: `klava:${tradslag}`, tradslag, punkt });

  if (steg.length === 0 && veckaGar && kurvor.size > 0) return { lage: 'vanta', steg: [], vantaTill };
  return { lage: steg.length > 0 ? 'steg' : 'inget', steg, vantaTill: null };
}

// === Texterna ===
export type StegText = {
  ikon: string;
  /** Den stora meningen. */
  rubrik: string;
  /** En rad under: varför. */
  varfor: string;
  /** Punkterna som ska ändras ("150 mm −3"), för Ändra-steg. */
  rader: string[];
};

const ART_SMA: Record<string, string> = { Gran: 'gran', Tall: 'tall', Björk: 'björk', 'Övrigt löv': 'löv' };
const ART_PLURAL: Record<string, string> = { Gran: 'granar', Tall: 'tallar', Björk: 'björkar', 'Övrigt löv': 'lövträd' };
export const artSmatt = (t: string): string => ART_SMA[t] ?? t.toLowerCase();
const artPlural = (t: string): string => ART_PLURAL[t] ?? `${t.toLowerCase()}`;
const MAN_NAMN = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const manadsOrd = (manad: string): string => MAN_NAMN[Number(manad.slice(5, 7)) - 1] ?? manad;
const minus = (mm: number): string => (mm < 0 ? `−${Math.abs(mm)}` : mm > 0 ? `+${mm}` : '0');
const lista = (delar: string[]): string => (delar.length <= 1 ? (delar[0] ?? '') : `${delar.slice(0, -1).join(', ')} och ${delar[delar.length - 1]}`);
const dagMan = (datum: string): string => `${Number(datum.slice(8, 10))} ${manadsOrd(datum.slice(0, 7)).slice(0, 3)}`;

/** Ett tal och dess enhet hålls ihop på raden: "150 och 200 mm" bryts aldrig så att "mm" blir ensamt. */
const nb = (t: string): string => t.replace(/ mm\b/g, '\u00a0mm');

export function stegText(s: Steg): StegText {
  const t = stegTextRå(s);
  return { ...t, rubrik: nb(t.rubrik), varfor: nb(t.varfor), rader: t.rader.map(nb) };
}

function stegTextRå(s: Steg): StegText {
  switch (s.slag) {
    case 'kolla': {
      // En kort rad, inga tal (siffrorna står i detaljen): vad som såg konstigt ut.
      const grepp = s.grepp.length > 0 ? [`Greppet har släppt oftare på ${lista(s.grepp.map(g => artSmatt(g.tradslag)))} i ${manadsOrd(s.grepp[0].manad)}.`] : [];
      const sprid = s.spridning.length > 0 ? [`Måtten hoppar ${grepp.length > 0 ? 'också ' : ''}mellan stammar på ${lista(s.spridning.map(p => `${artSmatt(p.tradslag)} ${p.punkt} mm`))}.`] : [];
      return { ikon: 'build', rubrik: 'Kolla knivar och valsar', varfor: [...grepp, ...sprid].join(' '), rader: [] };
    }
    case 'tryck':
      return {
        ikon: 'compress', rubrik: 'Höj trycket på knivar och hjul',
        varfor: `Måtten hoppar mellan stammar på ${lista(s.punkter.map(p => `${artSmatt(p.tradslag)} ${p.punkt} mm`))}. Kurvan kan inte rätta det.`,
        rader: [],
      };
    case 'kurva': {
      const alla = s.punkter.map(p => p.andringMm);
      const lika = alla.every(m => m === alla[0]);
      const art = artSmatt(s.tradslag);
      const rubrik = lika ? `${alla[0] < 0 ? 'Sänk' : 'Höj'} ${art} ${Math.abs(alla[0])} mm` : `Ändra kurvan för ${art}`;
      const grov = s.punkter.filter(p => p.snittMm > 0), klen = s.punkter.filter(p => p.snittMm < 0);
      const delar = [
        grov.length ? `Maskinen mäter för grovt på ${lista(grov.map(p => p.punkt))} mm` : '',
        klen.length ? `${grov.length ? 'och för klent' : 'Maskinen mäter för klent'} på ${lista(klen.map(p => p.punkt))} mm` : '',
      ].filter(Boolean).join(' ');
      return { ikon: 'show_chart', rubrik, varfor: `${delar}.`, rader: s.punkter.map(p => `${p.punkt} mm ${minus(p.andringMm)}`) };
    }
    case 'klava': {
      const p = s.punkt;
      const art = p.saknas === 1 ? `en ${artSmatt(p.tradslag)}` : `${p.saknas} ${artPlural(p.tradslag)}`;
      return {
        ikon: 'straighten',
        rubrik: `Klava ${art} ${p.punkt} mm`,
        varfor: `${p.tradslag} ${klassIOrd(p.klass)} har ${p.stammar} av ${FORSLAG.MIN_STAMMAR} stammar. Så många behövs för att kunna ändra kurvan.`,
        rader: [],
      };
    }
  }
}

export const INGET_RUBRIK = 'Inget att göra';
export const INGET_RAD = 'Fortsätt klava som vanligt.';
export const vantaText = (vantaTill: string): { rubrik: string; varfor: string } => ({
  rubrik: `Vänta till ${dagMan(vantaTill)}`,
  varfor: 'Du ändrade trycket nyligen. Ändra inte kurvan förrän en vecka gått.',
});
