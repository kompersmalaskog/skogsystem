// SKOTNINGSRAPPORTEN — underlaget Martin skickar till Vidas inköpare.
//
// VARFÖR DEN FINNS (Martin 2026-11-25: "kan vi göra det till pdf så jag kan
// skicka det till inköparna")
//
// Avståndstillägget är den post på en ackordfaktura som flyttar mest pengar
// och är svårast att visa. Förut fanns inget underlag alls: Martin satt ett
// tal för hand, och inköparen fick lita på det. Nu mäter appen avståndet ur
// hyttspårets GPS, och då ska mätningen gå att SKICKA — inte bara stå i vår
// egen app.
//
// RAPPORTEN SVARAR PÅ EN FRÅGA: hur långt skotades virket, och vad ger det?
//
// Ordningen: svaret, kartan som visar det, de fyra måtten på samma körning,
// och vad det blir i kronor. Kartan är beviset — traktgränsen, var virket
// stod, och var skotaren körde.
//
// ÄRLIGHETEN ÄR POÄNGEN. De fyra måtten står alla i rapporten, inklusive de
// tre vi INTE fakturerar. Inköparen ser att vi tagit det lägsta
// transportmåttet (414 m där halva cykeln är 739), och att talet är mätt och
// inte påstått. Martins egen regel: "det ska vara verkligheten så det stämmer
// för alla både markägaren och entreprenören ingen ska bli lurad".
//
// REN FUNKTION. All text och alla tal här; ritaren (skotningsrapportPdf.ts)
// ritar bara. Talen kommer ur samma funktioner som fakturan (`avstandsTillagg`
// och `sammanstallCykel`) — rapporten räknar aldrig själv, så den kan inte
// säga ett annat tal än det vi fakturerar.

import type { Dokument, DokRad, DokSektion } from '@/lib/arbetsmiljo/dokument';
import { langtDatum } from '@/lib/arbetsmiljo/dokument';
import { SKAL_TEXT, type CykelSammanstallning } from './lassCykel';

export type SkotningsrapportIndata = {
  trakt: { namn: string; voNummer: string; kund: string | null; avtalsform: string | null };
  /** Skotarens namn (dim_maskin.visningsnamn). Tom lista = inget sägs. */
  skotare: string[];
  /** Första och sista lossningsdagen, 'YYYY-MM-DD'. null = okänt. */
  period: { fran: string; till: string } | null;
  /** Traktens skördade volym, m³fub — det fakturan räknas på. */
  volymM3fub: number;
  /** Avståndet priset räknas på, enkel väg. null = inget tal finns. */
  avstandM: number | null;
  /** true = satt för hand (då är lassen bara jämförelse). */
  handsatt: boolean;
  /** Lassens sammanställning. null = trakten har inga app-lass. */
  cykel: CykelSammanstallning | null;
  pris: {
    /** Meter som ingår utan tillägg. null = ingen sats gäller. */
    grundavstandM: number | null;
    krPer100m: number | null;
    /** Kronor på hela trakten. */
    kronor: number;
  };
};

const tal = (n: number, dec = 0) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const meter = (n: number) => `${tal(Math.round(n))} m`;
const vol = (n: number) => `${tal(n)} m³fub`;
const kr = (n: number) => `${tal(Math.round(n))} kr`;

/** Avstånd → kr/m³fub ur kronorna och volymen. Rapporten räknar inget pris. */
function krPerM3(kronor: number, volym: number): number | null {
  return volym > 0 ? kronor / volym : null;
}

/**
 * SVARET: avståndet, stort. Det är rapportens enda tal som står för sig själv.
 * Saknas det sägs det rakt ut — rapporten gissar aldrig ett avstånd.
 */
export function svarRad(d: SkotningsrapportIndata): { svar: string; ton?: 'bra' | 'brist' | 'dampad' } {
  if (d.avstandM == null) {
    return { svar: 'Skotningsavståndet är inte mätt på den här trakten.', ton: 'dampad' };
  }
  return { svar: `Skotningsavståndet var ${meter(d.avstandM)} enkel väg.` };
}

/**
 * Hur talet kom fram, i en mening under svaret. Handsatt och mätt är två
 * olika påståenden och ska aldrig låta lika.
 */
export function kallaMening(d: SkotningsrapportIndata): string {
  if (d.avstandM == null) {
    return d.cykel && d.cykel.lass > 0
      ? `Trakten har ${tal(d.cykel.lass)} lass, men inget av dem har ett mätt körspår.`
      : 'Trakten har inga lass med körspår, och inget avstånd är satt för hand.';
  }
  if (d.handsatt) {
    const jam = d.cykel?.ytterstM != null
      ? ` Lassens egen mätning säger ${meter(d.cykel.ytterstM)}.`
      : '';
    return `Avståndet är satt för hand och gäller hela trakten.${jam}`;
  }
  const c = d.cykel;
  if (!c) return 'Mätt ur skotarens körspår.';
  const andel = d.volymM3fub > 0 ? Math.round((c.volymMedCykel / d.volymM3fub) * 100) : null;
  const tackning = andel == null ? '' : ` — ${andel} % av traktens volym`;
  return `Snitt ur ${tal(c.medCykel)} av ${tal(c.lass)} lass med mätt körspår, `
    + `viktat på volym: ${vol(c.volymMedCykel)} av ${vol(d.volymM3fub)}${tackning}.`;
}

/**
 * SAMMA KÖRNING, FYRA MÅTT — med det vi fakturerar först och märkt.
 *
 * Det här är rapportens viktigaste del för en inköpare: den visar att samma
 * körning går att mäta på fyra sätt, att de skiljer sig kraftigt, och att vi
 * valt det lägsta transportmåttet. Tom lista när trakten inte har app-lass.
 */
export function mattRader(c: CykelSammanstallning | null, handsattM: number | null = null): DokRad[] {
  if (!c || c.enkelVagM == null) return [];
  const rader: DokRad[] = [];
  // ÄR AVSTÅNDET SATT FÖR HAND är det DET som faktureras — då får ingen mätt
  // rad märket "fakturerat". Annars läser inköparen 414 m som priset, medan
  // fakturan vilar på 450. Det vore att visa fel tal i ett underlag.
  if (handsattM != null) {
    rader.push({
      titel: 'Satt för hand',
      text: 'Avståndet för hela trakten, satt av oss.',
      status: `${meter(handsattM)} · fakturerat`,
      ton: 'bra',
    });
  }
  if (c.ytterstM != null) {
    rader.push({
      titel: 'Ut till virket',
      text: handsattM == null
        ? 'Från avlägget ut till virket. Det här räknas tillägget på.'
        : 'Från avlägget ut till virket, mätt ur körspåret.',
      status: handsattM == null ? `${meter(c.ytterstM)} · fakturerat` : meter(c.ytterstM),
      ton: handsattM == null ? 'bra' : 'dampad',
    });
  }
  rader.push({
    titel: 'Halva cykeln',
    text: 'Hela körningen delat på två. Räknar in sortering vid avlägget, som är betald i kubikpriset.',
    status: meter(c.enkelVagM),
    ton: 'dampad',
  });
  if (c.hemMedLassM != null) {
    rader.push({
      titel: 'Efter vändpunkten',
      text: 'Körningen efter den punkt som låg längst bort.',
      status: meter(c.hemMedLassM),
      ton: 'dampad',
    });
  }
  if (c.vidAvlaggetM != null) {
    rader.push({
      titel: 'Vid avlägget',
      text: 'Sortering inom 60 m från lossningen. Inte skotning.',
      status: meter(c.vidAvlaggetM),
      ton: 'dampad',
    });
  }
  return rader;
}

/** Vad som inte gick att mäta, och varför. null när allt är mätt. */
export function luckaRad(c: CykelSammanstallning | null): string | null {
  if (!c) return null;
  const poster = Object.entries(c.utan).filter(([, n]) => n > 0);
  if (poster.length === 0) return null;
  const delar = poster.map(([skal, n]) =>
    `${tal(n)} lass: ${SKAL_TEXT[skal as keyof typeof SKAL_TEXT] ?? skal}`);
  return `${tal(c.medCykel)} av ${tal(c.lass)} lass har mätt körspår. De andra `
    + `drar inte ner snittet — ${delar.join('; ')}.`;
}

/** Prislistan och kronorna, i ord. */
export function prisRader(d: SkotningsrapportIndata): DokRad[] {
  const rader: DokRad[] = [];
  const { grundavstandM, krPer100m, kronor } = d.pris;
  if (grundavstandM != null && krPer100m != null) {
    rader.push({
      titel: 'Ur prislistan',
      text: `${meter(grundavstandM)} ingår utan tillägg, sedan ${tal(krPer100m, 2)} kr per m³fub per påbörjad 100 m.`,
    });
  }
  const per = krPerM3(kronor, d.volymM3fub);
  rader.push({
    titel: 'Avståndstillägg',
    text: per == null
      ? 'Traktens volym är inte känd, så tillägget går inte att räkna per m³fub.'
      : `${tal(per, 2)} kr per m³fub × ${vol(d.volymM3fub)}.`,
    status: kr(kronor),
  });
  return rader;
}

/** "3–18 november 2026" eller null. */
export function periodText(p: { fran: string; till: string } | null): string | null {
  if (!p) return null;
  return p.fran === p.till ? langtDatum(p.fran) : `${langtDatum(p.fran)} – ${langtDatum(p.till)}`;
}

/** Teckenförklaringen under kartan, i ord. Färg är aldrig ensam bärare. */
export const KARTA_FORKLARING =
  'Traktgränsen streckad, virket som prickar, skotarens körspår som linje och '
  + 'avläggen som ringar. Norr är uppåt.';

/**
 * Hela rapporten. Ritaren lägger till kartan mellan svaret och avsnitten.
 */
export function skotningsrapport(d: SkotningsrapportIndata): Dokument {
  const { svar, ton } = svarRad(d);
  const fakta: { etikett: string; varde: string }[] = [
    { etikett: 'Trakt', varde: d.trakt.namn },
    { etikett: 'VO-nummer', varde: d.trakt.voNummer },
  ];
  if (d.trakt.kund) fakta.push({ etikett: 'Kund', varde: d.trakt.kund });
  const per = periodText(d.period);
  if (per) fakta.push({ etikett: 'Skotat', varde: per });
  if (d.skotare.length > 0) {
    fakta.push({ etikett: d.skotare.length === 1 ? 'Skotare' : 'Skotare', varde: d.skotare.join(', ') });
  }
  fakta.push({ etikett: 'Volym', varde: vol(d.volymM3fub) });

  const sektioner: DokSektion[] = [];

  // Var talet kommer ifrån står ALLTID i rapporten — handsatt och mätt är två
  // olika påståenden, och ett underlag som inte skiljer dem är vilseledande.
  const kalla = kallaMening(d);

  const matt = mattRader(d.cykel, d.handsatt ? d.avstandM : null);
  if (matt.length > 0) {
    sektioner.push({
      rubrik: d.handsatt ? 'Avståndet, och vad körspåret säger' : 'Samma körning, fyra mått',
      under: `${kalla} ${d.handsatt
        ? 'Måtten nedan är mätta ur körspåret.'
        : 'Tillägget räknas på det första. De andra står här för att talen ska gå att jämföra.'}`,
      rader: matt,
    });
  }

  const lucka = luckaRad(d.cykel);
  sektioner.push({
    rubrik: 'Vad det ger',
    // Utan måttsektion har källmeningen ingen annan plats — den ska stå.
    under: [matt.length === 0 ? kalla : null, lucka].filter(Boolean).join(' ') || undefined,
    rader: prisRader(d),
  });

  return {
    titel: 'Skotningsrapport',
    filnamn: `skotningsrapport-${d.trakt.voNummer}`,
    fakta,
    svar,
    svarTon: ton,
    sektioner,
    not: (d.handsatt
      ? 'Det fakturerade avståndet är satt för hand och gäller hela trakten. '
        + 'Måtten ur körspåret är mätta ur GPS:en i skotarens hytt, lass för '
        + 'lass: från avlägget ut till den punkt i trakten som låg längst bort. '
      : 'Mätt ur GPS:en i skotarens hytt, lass för lass: från avlägget ut '
        + 'till den punkt i trakten som låg längst bort. Snittet är viktat på '
        + 'lassens volym, och lass utan körspår drar inte ner det. ')
      + 'Kompersmåla Skog.',
  };
}
