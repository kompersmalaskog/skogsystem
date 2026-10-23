/**
 * KONTROLLARKET — svaret i klartext, längd och diameter mätta på SAMMA sätt, stockraderna rot → topp och huvudet (när, hur stammen valdes, vädret).
 * Flyttat och omformat ur det gamla kontrollarket; talen är desamma (`stockFordelning`, `kontrollSumma`, `stockRadVarde`) — det nya är orden.
 *
 * REGLER (som i resten av vyn):
 *  - "klavad" = operatören har mätt. Ett värde som är NULL/0 har ingen avvikelse och räknas aldrig som "rätt".
 *  - Avvikelse = maskin − operatör. Positiv diameter = maskinen mäter för GROVT; positiv längd = maskinen mäter för LÅNGT.
 *  - En stock är "rätt" när dess avvikelse ligger inom toleransen (ur maskinens kravprofil, aldrig hårdkodad). Längd och diameter räknas
 *    likadant: stockar inom toleransen av stockar som klavats.
 *  - En kontroll är en stam. Domen bygger på fönstret (90 dagar), aldrig på en kontroll — det säger arket i klartext.
 */
import type { KontrollResponse, StockRow } from '@/app/api/kalibrering/kontroll/route';
import { type ToneToken } from './bedomning';
import { dagMedVeckodag, mattTid, urvalText, vaderKort } from './kontrollLista';
import { dec, fmtAvvikelse } from './format';
import { kontrollSumma, stockFordelning, stockRadVarde } from './kontroll';
import { cap, stockText } from './text';

// === Huvudet ===
export type KontrollHuvud = {
  /** "ons 21 okt · 14:13" — när stammen klavades (svensk tid). */
  dagTid: string;
  /** "Gran · Förvald · 5 stockar" */
  rad: string;
  /** Vädret kort, eller "Väder saknas". */
  vader: string;
  vaderSaknas: boolean;
  /** "Mätt av Martin" — bara när filen anger vem. */
  matare: string | null;
};

export const kontrollHuvud = (data: KontrollResponse): KontrollHuvud => {
  const k = data.kontroll;
  const tid = mattTid(data.stockar);
  const dag = tid.sista?.dag ?? k.datum.slice(0, 10);
  const urval = urvalText(Array.from(new Set(data.stockar.map(s => s.stem_selection).filter((x): x is string => !!x))));
  const vader = vaderKort(k.weather_at_harvest);
  const matare = data.stockar.find(s => s.measurer_name)?.measurer_name ?? null;
  return {
    dagTid: `${dagMedVeckodag(dag)}${tid.sista ? ` · ${tid.sista.klockslag}` : ''}`,
    rad: [cap(k.tradslag ?? ''), urval, stockText(k.antal_kontrollstockar ?? data.stockar.length)].filter((x): x is string => !!x).join(' · '),
    vader: vader ?? 'Väder saknas',
    vaderSaknas: vader == null,
    matare: matare ? `Mätt av ${matare}` : null,
  };
};

// === Svaret ===
export type MattRad = {
  /** "Längd" / "Diameter" */
  rubrik: string;
  /** "5 av 5 rätt" — eller "Ej klavad". */
  ratt: string;
  /** Snittet som dämpad text bredvid: "snitt +1 mm". null när det inte finns. */
  snitt: string | null;
  /** Antal klavade stockar, antal inom toleransen. */
  n: number;
  inom: number;
  /** Något utanför toleransen: pricken framför. */
  ton: ToneToken;
};

export type KontrollSvar = {
  rubrik: string;
  /** Något utanför toleransen — rubriken får varningsikonen. */
  avvikelse: boolean;
  langd: MattRad;
  diameter: MattRad;
  /** "En stam säger lite. Domen bygger på 90 dagar." */
  fotnot: string;
};

const FONSTER_DAGAR_STANDARD = 90;

/** Åt vilket håll de stockar som ligger utanför avviker: bara positiva, bara negativa eller båda. */
const hall = (utanfor: number[]): 'plus' | 'minus' | 'bada' | null => {
  const plus = utanfor.some(v => v > 0), minus = utanfor.some(v => v < 0);
  return plus && minus ? 'bada' : plus ? 'plus' : minus ? 'minus' : null;
};

export const kontrollSvar = (data: KontrollResponse, tolDia: number, tolLen: number, fonsterDagar: number | null): KontrollSvar => {
  const k = data.kontroll;
  const dist = stockFordelning(data.stockar);
  const s = kontrollSumma(dist, tolDia, tolLen);

  const lenUt = s.lenKlavade.filter(e => Math.abs(e.sLen) > tolLen);
  const diaUt = s.diaKlavade.filter(e => Math.abs(e.sDia) > tolDia);
  const langd: MattRad = {
    rubrik: 'Längd', n: s.lenKlavade.length, inom: s.lenKlavade.length - lenUt.length,
    ratt: s.lenKlavade.length === 0 ? 'Ej klavad' : `${s.lenKlavade.length - lenUt.length} av ${s.lenKlavade.length} rätt`,
    snitt: s.lenKlavade.length > 0 && k.langd_avvikelse_snitt_cm != null ? `snitt ${fmtAvvikelse(k.langd_avvikelse_snitt_cm, 'cm')} cm` : null,
    ton: lenUt.length > 0 ? 'hot' : 'ok',
  };
  const diameter: MattRad = {
    rubrik: 'Diameter', n: s.diaKlavade.length, inom: s.diaKlavade.length - diaUt.length,
    ratt: s.diaKlavade.length === 0 ? 'Ej klavad' : `${s.diaKlavade.length - diaUt.length} av ${s.diaKlavade.length} rätt`,
    snitt: s.diaKlavade.length > 0 && k.dia_avvikelse_snitt_mm != null ? `snitt ${fmtAvvikelse(k.dia_avvikelse_snitt_mm, 'mm')} mm` : null,
    ton: diaUt.length > 0 ? 'hot' : 'ok',
  };

  const diaHall = hall(diaUt.map(e => e.sDia)), lenHall = hall(lenUt.map(e => e.sLen));
  const diaOrd = diaHall === 'plus' ? 'för grovt' : diaHall === 'minus' ? 'för klent' : diaHall === 'bada' ? 'ojämnt' : null;
  const lenOrd = lenHall === 'plus' ? 'för långt' : lenHall === 'minus' ? 'för kort' : lenHall === 'bada' ? 'ojämnt' : null;

  let rubrik: string;
  if (langd.n === 0 && diameter.n === 0) rubrik = 'Inget är klavat i den här kontrollen';
  else if (diaOrd && lenOrd) rubrik = `Diametern mäter ${diaOrd}, längden ${lenOrd}`;
  else if (diaOrd) rubrik = `Diametern mäter ${diaOrd}`;
  else if (lenOrd) rubrik = `Längden mäter ${lenOrd}`;
  else if (langd.n > 0 && diameter.n > 0) rubrik = 'Längd och diameter inom tolerans';
  else if (diameter.n > 0) rubrik = 'Diametern inom tolerans';
  else rubrik = 'Längden inom tolerans';

  const dagar = fonsterDagar ?? FONSTER_DAGAR_STANDARD;
  return {
    rubrik, avvikelse: !!(diaOrd || lenOrd), langd, diameter,
    fotnot: `${(k.antal_kontrollstammar ?? 1) <= 1 ? 'En stam' : 'En kontroll'} säger lite. Domen bygger på ${dagar} dagar.`,
  };
};

// === Stockraderna ===
export type KontrollStockRad = {
  id: number;
  stamNummer: number;
  stockNummer: number;
  /** "Timmer 6,1 m" — sortimentgruppen och längden i klartext, aldrig maskinkoden. */
  titel: string;
  /** "längd −2,0 cm · dia +10 mm" — båda avvikelserna med etikett. */
  under: string;
  /** Värsta måttets ton (kontrollarkets färg): pricken framför titeln. */
  ton: ToneToken;
};

export type KontrollStamGrupp = {
  stamNummer: number;
  /** "Stam 1 · 21,8 m · 5 stockar" */
  rubrik: string;
  rader: KontrollStockRad[];
};

const radUnder = (st: StockRow): { under: string; ton: ToneToken } => {
  const v = stockRadVarde(st);
  const langd = v.lenKl ? `${fmtAvvikelse(v.sLen, 'cm')} cm` : 'ej klavad';
  const dia = v.diaKl ? `${fmtAvvikelse(v.sDia, 'mm')} mm` : 'ej klavad';
  return { under: `längd ${langd} · dia ${dia}`, ton: v.worstTon };
};

/** Stockarna rot → topp, en grupp per stam (stam för stam, lägst nummer först). */
export const kontrollStammar = (stockar: StockRow[]): KontrollStamGrupp[] => {
  const perStam = new Map<number, StockRow[]>();
  for (const s of stockar) perStam.set(s.stam_nummer, [...(perStam.get(s.stam_nummer) ?? []), s]);
  return Array.from(perStam.entries()).sort((a, b) => a[0] - b[0]).map(([stamNummer, lista]) => {
    const sorterade = lista.slice().sort((a, b) => a.stock_nummer - b.stock_nummer);
    const totalCm = sorterade.reduce((m, s) => m + (s.maskin_langd_cm ?? 0), 0);
    return {
      stamNummer,
      rubrik: `Stam ${stamNummer} · ${dec(totalCm / 100, 1)} m · ${stockText(sorterade.length)}`,
      rader: sorterade.map(st => ({
        id: st.id, stamNummer, stockNummer: st.stock_nummer,
        titel: `${st.sortiment_grupp ?? 'Okänt sortiment'} ${st.maskin_langd_cm != null ? `${dec(st.maskin_langd_cm / 100, 1)} m` : '–'}`,
        ...radUnder(st),
      })),
    };
  });
};
