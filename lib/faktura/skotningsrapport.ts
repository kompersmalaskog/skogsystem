// SKOTNINGSRAPPORTEN — underlaget Martin skickar till Vidas inköpare.
//
// VARFÖR DEN FINNS (Martin 2026-11-25: "kan vi göra det till pdf så jag kan
// skicka det till inköparna")
//
// Avståndstillägget är den post på en ackordfaktura som flyttar mest pengar
// och är svårast att visa. Förut fanns inget underlag alls: Martin satt ett
// tal för hand, och inköparen fick lita på det. Nu mäter appen avståndet ur
// hyttspårets GPS, och då ska mätningen gå att SKICKA.
//
// RAPPORTEN SVARAR PÅ EN FRÅGA: hur långt skotades virket, och vad ger det?
//
// SIDAN ÄR EN A4, och ordningen är skissens (Martin godkände den 2026-11-25
// och tog senare upp att den byggda PDF:en inte följde den):
//
//   huvud · tre kort (avstånd · prislista · tillägg) · källmeningen
//   kartan | Var låg virket?      ← sida vid sida
//   Skotningen · Samma körning, fyra mått · Så är det mätt
//
// ÄRLIGHETEN ÄR POÄNGEN. Alla fyra måtten står i rapporten, också de tre vi
// INTE fakturerar. Inköparen ser att vi tagit det lägsta transportmåttet
// (414 m där halva cykeln är 739), och att talet är mätt och inte påstått.
// Martins egen regel: "det ska vara verkligheten så det stämmer för alla både
// markägaren och entreprenören ingen ska bli lurad".
//
// REN FUNKTION. All text och alla tal här; ritaren (skotningsrapportPdf.ts)
// ritar bara. Talen kommer ur samma funktioner som fakturan (`avstandsTillagg`
// och `sammanstallCykel`) — rapporten räknar aldrig själv, så den kan inte
// säga ett annat tal än det vi fakturerar.

import { langtDatum } from '@/lib/arbetsmiljo/dokument';
import { MARK_STIL, markeringsStil, type MarkSlag } from '@/lib/egenkontrollRapportKarta';
import type { KordStracka } from './kordStracka';
import { SKAL_TEXT, type CykelSammanstallning } from './lassCykel';
import { virkesfordelning, type Stam, type Virkesfordelning } from './virkesfordelning';

export type SkotningsrapportIndata = {
  trakt: {
    namn: string;
    voNummer: string;
    kund: string | null;
    avtalsform: string | null;
    /** Hektar ur trakten. null = sägs inte. */
    arealHa?: number | null;
  };
  /** Skotarens namn (dim_maskin.visningsnamn). Tom lista = inget sägs. */
  skotare: string[];
  /** Första och sista lossningsdagen, 'YYYY-MM-DD'. null = okänt. */
  period: { fran: string; till: string } | null;
  /** Dagar med lass — inte kalenderdagar mellan första och sista. */
  dagar?: number;
  /** Traktens skördade volym, m³fub — det fakturan räknas på. */
  volymM3fub: number;
  /** Avståndet priset räknas på, enkel väg. null = inget tal finns. */
  avstandM: number | null;
  /** true = satt för hand (då är lassen bara jämförelse). */
  handsatt: boolean;
  /** Lassens sammanställning. null = trakten har inga app-lass. */
  cykel: CykelSammanstallning | null;
  /**
   * Ett avstånd per lass, enkel väg — underlaget för kortaste och längsta.
   *
   * `kalla` MÅSTE med: appens lass bär avståndet ut till virket, Optis bär
   * halva körsträckan (se lassCykel). Summeras de rått blandas två mått i
   * samma tal, och "längsta lasset" kan bli ett Opti-lass mätt på ett annat
   * sätt än det vi fakturerar.
   */
  lass?: { avstandM: number; volym: number; kalla?: string }[];
  /** Skördarens stammar med volym — underlaget för "Var låg virket?". */
  virke?: Stam[];
  /** Avläggen, för att mäta virkets avstånd. */
  avlagg?: { lat: number; lng: number; namn?: string }[];
  /**
   * Hur långt maskinerna körde, mätt på RÅDATA ur hytten (`kordStracka`).
   * null = inget körspår, och då sägs ingenting om körd sträcka.
   */
  korde?: KordStracka | null;
  /**
   * Vad kartan faktiskt bär — teckenförklaringen får bara nämna det som ritas.
   * `zoner` är zontyper (protected, wet, …), `mark` blött/brant-slagen.
   */
  kartinnehall?: { zoner: string[]; mark: MarkSlag[]; symboler?: string[] };
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

// ── Sidans delar ─────────────────────────────────────────────────────────

/** Ett av de tre korten överst. `varde` är stort, `under` litet. */
export type Kort = { etikett: string; varde: string; under: string | null };

/** En rad i "Var låg virket?". `andel` 0–100 ger stapelns längd. */
export type VirkeRad = { etikett: string; m3fub: string; andel: number };

/** En rad etikett/värde i "Skotningen" och "Samma körning". */
export type Rad = { etikett: string; varde: string; under?: string | null };

export type SkotningsrapportSida = {
  /** Filens namn, utan ändelse. */
  filnamn: string;
  titel: string;
  /** "Kompersmåla Skog AB · 25 november 2026 · till Vida" */
  avsandare: string;
  traktNamn: string;
  /** "VO 11271860 · rotpost · 7,28 ha · 1 746 m³fub · avlägg 01-1" */
  traktFakta: string;
  /** Avståndet, prislistan och tillägget. Prislistan kan saknas. */
  kort: Kort[];
  /** En mening om var avståndet kommer ifrån. Står alltid. */
  kalla: string;
  /** Teckenförklaringen under kartan. */
  kartforklaring: string;
  /** "Var låg virket?" — null när virket inte går att placera. */
  virke: {
    rubrik: string;
    under: string;
    rader: VirkeRad[];
    summa: string;
    /** Sägs under tabellen när stammar saknar plats eller volym. */
    not: string | null;
  } | null;
  /** "Skotningen" — lass och längder, som en vågrät statsrad. */
  skotningen: Rad[];
  /**
   * Perioden och dagarna, som en mening under statsraden.
   *
   * Står INTE som en stat: "3 november 2026 – 18 november 2026" är fyra gånger
   * bredare än de andra värdena och sköt in i grannkolumnen (uppmätt i den
   * renderade PDF:en). En rad i full bredd är både läsbar och ärlig.
   */
  skotningenPeriod: string | null;
  /** "Samma körning, fyra mått" — det fakturerade först och märkt. */
  matt: Rad[];
  /** Under måttrubriken: vad som inte gick att mäta. */
  mattLucka: string | null;
  /** "Så är det mätt" — tre korta stycken. */
  saMatt: { rubrik: string; text: string }[];
  /** Foten. */
  not: string;
};

// ── Delarna, var för sig och testbara ────────────────────────────────────

/**
 * De tre korten. Avståndet är rapportens svar och står först.
 *
 * Saknas avståndet står kortet ändå, med orsaken i stället för ett tal —
 * ett tomt kort vore värre än ett som säger varför.
 */
export function kortRad(d: SkotningsrapportIndata): Kort[] {
  const ut: Kort[] = [{
    etikett: 'Skotningsavstånd',
    varde: d.avstandM == null ? '—' : meter(d.avstandM),
    under: d.avstandM == null
      ? 'Inte mätt på den här trakten.'
      : 'Enkel väg, avlägget till virket. Det avstånd fakturan räknar på.',
  }];

  const { grundavstandM, krPer100m, kronor } = d.pris;
  const per = krPerM3(kronor, d.volymM3fub);
  if (per != null) {
    // ENHETEN STÅR UNDER, INTE I TALET. Två skäl: tre kort som alla slutar på
    // ett kort tal ("414 m", "12,00 kr", "20 956 kr") läses snabbare, och i
    // den stora stilen läser pdftotext den upphöjda trean som ett eget ord —
    // den som kopierar texten ur filen fick "12,00 kr/m fub" (uppmätt i den
    // renderade PDF:en 2026-11-25). I underradens storlek sitter den ihop.
    const villkor = grundavstandM != null && krPer100m != null
      ? ` ${meter(grundavstandM)} fritt, sedan ${tal(krPer100m, 2)} kr per påbörjad 100 m.`
      : '';
    ut.push({
      etikett: 'Prislistan',
      varde: `${tal(per, 2)} kr`,
      under: `per m³fub.${villkor}`,
    });
  }

  ut.push({
    etikett: 'Tillägg',
    varde: kr(kronor),
    under: `${vol(d.volymM3fub)} skördad volym`,
  });
  return ut;
}

/**
 * Avtalsformen i klartext. Databasen bär Vidas koder ('Rp', 'Au'); en rapport
 * ska inte kräva att läsaren kan dem. En kod vi inte känner skrivs som den är
 * — hellre Vidas eget ord än ett påhittat.
 */
const AVTALSFORM: Record<string, string> = {
  rp: 'rotpost',
  au: 'avverkningsuppdrag',
};

/** "VO 11271860 · rotpost · 7,28 ha · 1 746 m³fub · avlägg 01-1" */
export function traktFakta(d: SkotningsrapportIndata): string {
  const delar: string[] = [`VO ${d.trakt.voNummer}`];
  const form = d.trakt.avtalsform?.trim();
  if (form) delar.push(AVTALSFORM[form.toLowerCase()] ?? form);
  if (d.trakt.arealHa != null && d.trakt.arealHa > 0) delar.push(`${tal(d.trakt.arealHa, 2)} ha`);
  delar.push(vol(d.volymM3fub));
  const namn = (d.avlagg ?? []).map(a => a.namn).filter(Boolean);
  if (namn.length === 1) delar.push(`avlägg ${namn[0]}`);
  else if (namn.length > 1) delar.push(`${namn.length} avlägg`);
  return delar.join(' · ');
}

/**
 * Hur talet kom fram, i en mening. Handsatt och mätt är två olika påståenden
 * och ska aldrig låta lika.
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
  return `Varje lass är mätt med GPS i skotarhytten. Snittet är viktat på volym: `
    + `${tal(c.medCykel)} av ${tal(c.lass)} lass har mätt körspår, `
    + `${vol(c.volymMedCykel)} av ${vol(d.volymM3fub)}${tackning}.`;
}

/**
 * SAMMA KÖRNING, FYRA MÅTT — med det vi fakturerar först och märkt.
 *
 * Rapportens viktigaste del för en inköpare: samma körning går att mäta på
 * fyra sätt, de skiljer sig kraftigt, och vi har valt det lägsta
 * transportmåttet. Tom lista när trakten inte har app-lass.
 */
export function mattRader(c: CykelSammanstallning | null, handsattM: number | null = null): Rad[] {
  if (!c || c.enkelVagM == null) return [];
  const rader: Rad[] = [];
  // ÄR AVSTÅNDET SATT FÖR HAND är det DET som faktureras — då får ingen mätt
  // rad märket "fakturerat". Annars läser inköparen 414 m som priset, medan
  // fakturan vilar på 450. Det vore att visa fel tal i ett underlag.
  if (handsattM != null) {
    rader.push({
      etikett: 'Satt för hand',
      varde: `${meter(handsattM)} · fakturerat`,
      under: 'Avståndet för hela trakten, satt av oss.',
    });
  }
  if (c.ytterstM != null) {
    rader.push({
      etikett: 'Ut till virket',
      varde: handsattM == null ? `${meter(c.ytterstM)} · fakturerat` : meter(c.ytterstM),
      under: handsattM == null
        ? 'Från avlägget ut till virket. Det här räknas tillägget på.'
        : 'Från avlägget ut till virket, mätt ur körspåret.',
    });
  }
  rader.push({
    etikett: 'Halva cykeln',
    varde: meter(c.enkelVagM),
    under: 'Hela körningen delat på två. Räknar in sortering vid avlägget, som är betald i kubikpriset.',
  });
  if (c.hemMedLassM != null) {
    rader.push({
      etikett: 'Efter vändpunkten',
      varde: meter(c.hemMedLassM),
      under: 'Körningen efter den punkt som låg längst bort.',
    });
  }
  if (c.vidAvlaggetM != null) {
    rader.push({
      etikett: 'Vid avlägget',
      varde: meter(c.vidAvlaggetM),
      under: 'Sortering inom 60 m från lossningen. Inte skotning.',
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

/**
 * "SKOTNINGEN" — hur jobbet såg ut i siffror.
 *
 * LASSEN TILLSAMMANS, inte "körd sträcka". Summan av lassens enkla vägar är
 * INTE vad maskinen körde — den körde dubbelt så långt plus landningsarbete
 * (Skälviken: 85 lass à 414 m enkel väg är 35 km, men hela cykeln är 125 km).
 * Skissen kallade det "Körd sträcka"; det talet håller inte om inköparen
 * räknar efter, och ett underlag som inte håller förlorar hela sitt värde.
 */
export function skotningenRader(d: SkotningsrapportIndata): Rad[] {
  const ut: Rad[] = [];
  const c = d.cykel;
  if (c) ut.push({ etikett: 'Lass', varde: tal(c.lass) });

  // ETT MÅTT I TAGET. Har trakten app-lass räknas bara de — deras avstånd är
  // det ut till virket, alltså samma mått som fakturan. Finns inga app-lass
  // är alla lass Optis, och då är halva cykeln måttet för allihop. Det som
  // aldrig får hända är en blandning: "längsta lasset" mätt på ett sätt och
  // det fakturerade avståndet på ett annat.
  const alla = (d.lass ?? []).filter(l => Number.isFinite(l.avstandM));
  const app = alla.filter(l => l.kalla === 'app');
  const lass = app.length > 0 ? app : alla;
  if (lass.length > 0) {
    const m = lass.map(l => l.avstandM);
    ut.push({ etikett: 'Kortaste lasset', varde: meter(Math.min(...m)) });
    ut.push({ etikett: 'Längsta lasset', varde: meter(Math.max(...m)) });
    const summa = m.reduce((s, x) => s + x, 0);
    ut.push({
      etikett: 'Lassen tillsammans',
      varde: `${tal(summa / 1000, 1)} km`,
      // Vilken rad som förklarar beror på om talet bredvid finns. Utan
      // "Maskinen körde" måste den här raden säga BÅDE att lassen är enkel väg
      // och att maskinen körde mer; med det talet bredvid säger den bara vad
      // skillnaden mellan de två är — annars står samma sak två gånger.
      under: d.korde
        ? 'Enkel väg, lass för lass. Talet bredvid är hela körningen — tur och retur, plus arbetet vid avlägget.'
        : 'Enkel väg, lass för lass. Maskinen körde mer än så — tur och retur, plus arbetet vid avlägget.',
    });
  }

  // MASKINEN KÖRDE — hela körningen, mätt på rådata. Den står sist: lassens
  // mått hör ihop, och det här är ett annat slags tal. Raden är vågrät, så ett
  // femte tal kostar ingen höjd på sidan.
  if (d.korde) ut.push({ etikett: 'Maskinen körde', varde: `${tal(d.korde.skotareM / 1000, 1)} km` });

  return ut;
}

/**
 * "Skotat 3 november 2026 – 18 november 2026 · 11 dagar med lass"
 *
 * DAGAR MED LASS, inte kalenderdagar i perioden. Skotaren står still på
 * trakten medan skördaren ligger före, och "26 dagar" om 11 arbetade läses
 * som att vi tagit för lång tid.
 */
export function periodMening(d: SkotningsrapportIndata): string | null {
  const per = periodText(d.period);
  if (!per) return null;
  const dagar = d.dagar && d.dagar > 0
    ? ` · ${tal(d.dagar)} ${d.dagar === 1 ? 'dag' : 'dagar'} med lass`
    : '';
  return `Skotat ${per}${dagar}`;
}

/**
 * "Så är det mätt" — de korta styckena längst ner.
 *
 * `harVirke` säger om tabellen "Var låg virket?" står på sidan. Gör den inte
 * det utelämnas stycket som förklarar den: en förklaring till något som inte
 * finns på papperet läses som att vi glömt tabellen.
 */
export function saMattStycken(
  d: SkotningsrapportIndata,
  harVirke: boolean,
): { rubrik: string; text: string }[] {
  const ut: { rubrik: string; text: string }[] = [];
  ut.push({
    rubrik: d.handsatt ? 'Det fakturerade avståndet' : 'Körd väg',
    text: d.handsatt
      ? 'Satt för hand och gäller hela trakten. Måtten nedanför är mätta ur körspåret och står som jämförelse.'
      : 'GPS:en i skotarens hytt, lass för lass: från avlägget ut till den punkt i trakten som låg längst bort. '
        + 'Snittet är viktat på lassens volym, och lass utan körspår drar inte ner det.',
  });
  if (harVirke) {
    ut.push({
      rubrik: 'Fågelväg',
      text: 'Tabellen "Var låg virket?" mäter rakt från avlägget till varje 20 m-ruta, viktat på rutans volym. '
        + 'Den visar var virket låg — inte hur långt maskinen körde.',
    });
  }
  // MASKINEN KÖRDE: vad talet omfattar, och hur mycket av det som låg i
  // skördarens stråk. Andelen är poängen med att stråket är ritat — den säger
  // att vägen var given. Står det ingen skördare i datan sägs ingen andel:
  // utan stråk vet vi inte var det går, och då finns inget att vara innanför.
  if (d.korde) {
    const km = (m: number) => `${tal(m / 1000, 1)} km`;
    const bitar = [
      `GPS:en i hytten, rådata: ${km(d.korde.skotareM)} på trakten och vägen ut till avlägget — resan hem räknas inte.`,
    ];
    if (d.korde.skordareM != null && d.korde.utanforM != null && d.korde.skotareM > 0) {
      const iStraket = Math.round(((d.korde.skotareM - d.korde.utanforM) / d.korde.skotareM) * 100);
      bitar.push(`${iStraket} % av det låg i skördarens stråk. Skördaren körde ${km(d.korde.skordareM)}.`);
    }
    ut.push({ rubrik: 'Maskinen körde', text: bitar.join(' ') });
  }

  const c = d.cykel;
  if (c) {
    const andel = d.volymM3fub > 0 ? Math.round((c.volymMedCykel / d.volymM3fub) * 100) : null;
    ut.push({
      rubrik: 'Täckning',
      text: andel == null
        ? `${tal(c.medCykel)} av ${tal(c.lass)} lass har mätt körspår.`
        : `${tal(c.medCykel)} av ${tal(c.lass)} lass har mätt körspår, och de bär ${andel} % av traktens volym.`,
    });
  }
  return ut;
}

/** "3 november 2026 – 18 november 2026" eller null. */
export function periodText(p: { fran: string; till: string } | null): string | null {
  if (!p) return null;
  return p.fran === p.till ? langtDatum(p.fran) : `${langtDatum(p.fran)} – ${langtDatum(p.till)}`;
}

/**
 * Teckenförklaringen under kartan, i ord. FÄRG ÄR ALDRIG ENSAM BÄRARE — och
 * rapporten skrivs ofta ut i svartvitt.
 *
 * Grundraden: det som alltid finns på kartan.
 */
/**
 * EN mening om vad man ser. Den får ALDRIG nämna en färg eller en symbol kartan
 * inte ritar: står det "skotarens körning i vitt" när hon ritas turkos är
 * teckenförklaringen en lögn, och då litar ingen på resten heller.
 *
 * TURKOS, inte vitt (Martin 2026-11-27, efter att ha sett fyra kartor bredvid
 * varandra). Appens sätt att visa skotaren inne i stråket — en vit mittlinje i
 * det lila — ritas inte alls vid rapportens utzoomning: kärnan är smalare än
 * gränsen i hytten, och en vit strimma hade ätit upp det lila (samma sak gör
 * appen när man zoomar ut). Resultatet var att skotaren, som rapporten HANDLAR
 * om, bara syntes som några vita fläckar vid avlägget. Turkos är hennes färg i
 * hela appen (`ROLLFARG_SKOTARE`), så det här är inte en ny färg — det är
 * appens färg i stället för hyttkartans specialfall.
 */
export const KARTA_FORKLARING =
  'Traktgränsen randig röd och gul som snitseln i skogen, skördarens stråk som '
  + 'lila band, skotarens körning som en tunn turkos linje och avlägget med sin '
  + 'symbol. Norr är uppåt.';

/**
 * Teckenförklaringen för DEN HÄR kartan: grundraden plus en mening om hänsynen
 * och en om marken — men bara när de faktiskt är ritade. Appens regel från
 * "Vad betyder kartan": bara det som finns på trakten. En förklaring till
 * något som inte står på papperet läses som att vi glömt det.
 *
 * Orden kommer ur SAMMA tabeller som ritningen (`markeringsStil`, `MARK_STIL`),
 * så förklaringen aldrig kan säga något annat än det som syns.
 */
export function kartforklaring(k?: SkotningsrapportIndata['kartinnehall']): string {
  const ut = [KARTA_FORKLARING];

  const zoner = [...new Set(k?.zoner ?? [])]
    .map((typ) => markeringsStil('zon', typ)?.etikett)
    .filter((e): e is string => !!e);
  if (zoner.length > 0) {
    // Hänsynen är det inköparen ska se att vi INTE kört i. Snedstreckningen
    // behöver ingen förklaring — den syns; ett ord till gör bara raden längre.
    ut.push(`Ytor vi inte kört i: ${listaOrd(zoner)}.`);
  }

  // SYMBOLERNA står utan namn bredvid sig på kartan — sex gånger ordet
  // "Evighetsträd" gör bilden rörig, och det är symbolen man känner igen. Namnen
  // hör därför hemma här, i samma ordning som appens egen symbolkälla ger dem.
  const symboler = [...new Set(k?.symboler ?? [])]
    .map((typ) => markeringsStil('symbol', typ)?.etikett)
    .filter((e): e is string => !!e);
  if (symboler.length > 0) ut.push(`Kvarlämnat: ${listaOrd(symboler.map((s) => s.toLowerCase()))}.`);

  // MARKEN: säg VAD som är tonat och VARIFRÅN talet kommer — aldrig vad
  // skotaren gjorde åt det. Att skotaren "körde runt" det blöta är en slutsats
  // vi inte mätt; kartan visar marken och körspåret på samma bild, och den
  // slutsatsen drar inköparen själv. Det är hela skälet att marken är med.
  const mark = (k?.mark ?? []).map((s) => MARK_STIL[s]).filter((s) => !!s);
  if (mark.length > 0) {
    // Säg vilket MÖNSTER som är vilket — det är så kartan läses i svartvitt,
    // och blå streck ska inte förväxlas med det turkosa körspåret.
    const del = (['blott', 'brant'] as const)
      .filter((o) => mark.some((s) => s.ord === o))
      .map((o) => `${listaOrd(mark.filter((s) => s.ord === o).map((s) => s.etikett))} i ${o === 'blott' ? 'blå vågräta streck' : 'röda snedstreck'}`);
    ut.push(`${versal(del.join(' och '))}, ur Skogsstyrelsens och SLU:s kartor.`);
  }

  return ut.join(' ');
}

/** "a, b och c" — aldrig "a, b, c" i en mening till kund. */
function listaOrd(d: string[]): string {
  const a = d.map((s) => s.toLowerCase());
  if (a.length === 1) return a[0];
  return `${a.slice(0, -1).join(', ')} och ${a[a.length - 1]}`;
}

/** Stor bokstav först — `listaOrd` gemenar, och listan kan börja en mening. */
function versal(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/** "Var låg virket?" ur stammarna och avläggen. null när den inte går att räkna. */
export function virkeDel(d: SkotningsrapportIndata): SkotningsrapportSida['virke'] {
  const f: Virkesfordelning | null = virkesfordelning(d.virke ?? [], d.avlagg ?? []);
  if (!f) return null;
  return {
    rubrik: 'Var låg virket?',
    under: 'Fågelväg från avlägget till varje 20 m-ruta, viktat på rutans volym.',
    rader: f.klasser.map(k => ({ etikett: k.etikett, m3fub: tal(k.m3fub), andel: k.andel })),
    summa: vol(f.summaM3fub),
    not: f.utan > 0
      ? `${tal(f.utan)} ${f.utan === 1 ? 'stam' : 'stammar'} saknar plats eller volym och räknas inte.`
      : null,
  };
}

/** Hela sidan. */
export function skotningsrapport(d: SkotningsrapportIndata): SkotningsrapportSida {
  const till = d.trakt.kund ? ` · till ${d.trakt.kund}` : '';
  const virke = virkeDel(d);
  return {
    filnamn: `skotningsrapport-${d.trakt.voNummer}`,
    titel: 'Skotningsrapport',
    avsandare: `Kompersmåla Skog AB · ${langtDatum(new Date().toISOString().slice(0, 10))}${till}`,
    traktNamn: d.trakt.namn,
    traktFakta: traktFakta(d),
    kort: kortRad(d),
    kalla: kallaMening(d),
    kartforklaring: kartforklaring(d.kartinnehall),
    virke,
    skotningen: skotningenRader(d),
    skotningenPeriod: periodMening(d),
    matt: mattRader(d.cykel, d.handsatt ? d.avstandM : null),
    mattLucka: luckaRad(d.cykel),
    saMatt: saMattStycken(d, virke != null),
    not: d.skotare.length > 0
      ? `Skotare: ${d.skotare.join(', ')}. Kompersmåla Skog AB.`
      : 'Kompersmåla Skog AB.',
  };
}
