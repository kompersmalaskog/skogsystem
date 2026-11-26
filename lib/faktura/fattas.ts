// VAD BEHÖVER DU KOLLA innan trakten faktureras — de uppgifter appen inte kan
// räkna fram själv, och vad de är värda i kronor.
//
// VARFÖR DEN FINNS (avstämning mot Vidas betalda fakturor 2026-11-16)
//
// Alla 14 ackordfakturor sedan augusti går att räkna fram exakt ur prislistan
// plus de tillägg Martin skrivit på fakturan. Formeln stämmer. Det som fattas
// är INDATA, och tre av fyra uppgifter är tomma på nästan varje trakt:
//
//   terrang_kr_manuell      ifylld på 2 av 14   (han har fakturerat 2–8 kr/m³)
//   skotavstand_manuell     ifylld på 2 av 14   (han har fakturerat 4–20 kr/m³)
//   sortiment_grupper_manuell  ifylld på 2 av 14
//
// Utan dem räknar appen tyst för lågt. Skälviken, trakten som ska faktureras
// 2026-11-16, är det skarpa fallet: 1 725 m³ skördat och TVÅ lass med
// körsträcka som tillsammans bär 40 m³. Avståndet summeras per lass på
// LASSETS egen volym (lib/ekonomi/acord skotAvstandKr) och delas sedan på hela
// trakten, så tillägget blir 1 680 kr = 0,97 kr/m³ — mot ~40 kr/m³ om de 858
// och 1 538 m lassen visar gäller trakten. Ca 67 000 kr som aldrig syns.
//
// LASSENS TÄCKNING ÄR DÄRFÖR DET SOM AVGÖR, inte om lass finns.
// Uppmätt på de tolv klara ackordtrakterna: Åbogen 0 %, Skälviken 2 %,
// Mölleryd 19 %, Brokamåla 53 %, Stänkelsmåla 67 % — och sedan Östra-Hoka
// 90 %, Kämpamåla 99 %, Räveboda 99 %, Bågskyttebanan 100 %, Bromåla 100 %,
// Hallaslätt 100 %, Rävemåla 102 %. Gränsen 80 % ligger i glappet mellan
// 67 och 90, så den delar materialet där det faktiskt delar sig.
//
// ───────────────────────────────────────────────────────────────────────────
// KORTET SPÄRRAR INGENTING. Det säger vad som fattas och vad det är värt.
// Martin avgör — 0 kr terräng kan vara rätt svar, och appen vet inte vilket.
// Att spärra en faktura på en gissning vore värre än att visa talet.
// ───────────────────────────────────────────────────────────────────────────
//
// REN FUNKTION. All text och alla tal här; kortet ritar bara.

/** Lassens täckning som krävs för att avståndet ur lassen ska duga. */
export const TACKNING_KRAV = 0.8;

export type FattasIndata = {
  /** Ackord eller timpeng. Avstånd och terräng hör bara till ackordet. */
  timpeng: boolean;
  kontraktsnummer: string | null;
  /** Skördad volym — det raden faktureras på. */
  volymM3fub: number;
  /** dim_objekt.terrang_kr_manuell, 0 när den är tom. */
  terrangKr: number;
  avstand: {
    /** dim_objekt.skotavstand_manuell i meter. Satt = ingen post. */
    manuellt: number | null;
    /** Volymen i de lass som HAR körsträcka. */
    lassVolym: number;
    /** Antal lass med körsträcka. */
    lassAntal: number;
    /** Kronor appen räknat fram, summerat per lass. */
    kronor: number;
  };
  sortiment: {
    /** true = någon har satt antalet för hand. */
    manuellt: boolean;
    /** Antalet som används i priset. */
    anvant: number;
    /** Appens egen räkning, för jämförelsen när talet är satt för hand. */
    raknat: number;
    /** Antal som ingår utan tillägg. null = ingen sats i prislistan. */
    grundantal: number | null;
    /** Kronor per sortiment över grundantalet. */
    krPerExtra: number | null;
  };
};

export type FattasPost = {
  nyckel: 'avstand' | 'terrang' | 'sortiment' | 'kontraktsnr';
  rubrik: string;
  text: string;
  /** Vad uppgiften är värd, i ord. null när det inte går att räkna. */
  varde: string | null;
  /**
   * Vilket ark på TRAKTEN som öppnas. null = ingen väg härifrån.
   *
   * Varje uppgift fylls i på fakturan, inte i en annan vy (Martin 2026-11-16:
   * "ska jag redigera måste jag komma till den sidan direkt och kunna komma
   * tillbaka till fakturan igen"). Raden som förut ledde till
   * /redigering?objekt=… öppnade hela redigeringsvyn, utan att peka ut fältet
   * och utan väg tillbaka — och kontraktsnumret har inget fält där alls.
   */
  ark: 'avstand' | 'terrang' | 'sortiment' | 'kontraktsnr' | null;
};

const tal = (n: number, dec = 0) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const kr2 = (n: number) => tal(n, 2);

/** "1 725 m³fub" — volym med enhet, utan decimaler. */
const vol = (n: number) => `${tal(n)} m³fub`;

/**
 * Posterna i FAST ordning — raderna ska ligga still mellan trakter, inte
 * sorteras om efter vad som råkar vara störst. Tom lista = inget att kolla.
 */
export function byggFattas(d: FattasIndata): FattasPost[] {
  const poster: FattasPost[] = [];
  const ackord = !d.timpeng;

  if (ackord) {
    const a = avstandPost(d);
    if (a) poster.push(a);
    const t = terrangPost(d);
    if (t) poster.push(t);
  }

  const s = sortimentPost(d);
  if (s) poster.push(s);

  if (!d.kontraktsnummer) {
    poster.push({
      nyckel: 'kontraktsnr',
      rubrik: 'Kontraktsnummer saknas',
      text: 'Numret står som artikel 8 på fakturan. Utan det går fakturan inte '
        + 'att följa upp mot Vidas avräkning.',
      varde: null,
      ark: 'kontraktsnr',
    });
  }

  return poster;
}

/**
 * Avståndet. Satt för hand → ingen post; den siffran är ett svar.
 * Annars avgör lassens TÄCKNING, inte om lass finns.
 */
function avstandPost(d: FattasIndata): FattasPost | null {
  if (d.avstand.manuellt != null) return null;

  const krPerM3 = d.volymM3fub > 0 ? d.avstand.kronor / d.volymM3fub : 0;

  if (d.avstand.lassAntal === 0) {
    return {
      nyckel: 'avstand',
      rubrik: 'Skotningsavståndet är inte satt',
      text: 'Inget lass har körsträcka, så tillägget blir 0 kr. Skriv in '
        + 'avståndet enkel väg.',
      varde: '0 kr',
      ark: 'avstand',
    };
  }

  const tackning = d.volymM3fub > 0 ? d.avstand.lassVolym / d.volymM3fub : 0;
  if (tackning >= TACKNING_KRAV) return null;

  const procent = Math.round(tackning * 100);
  return {
    nyckel: 'avstand',
    rubrik: `Skotningsavståndet bygger på ${procent} % av volymen`,
    text: `${d.avstand.lassAntal === 1 ? 'Ett lass' : `${d.avstand.lassAntal} lass`} `
      + `med körsträcka bär ${vol(d.avstand.lassVolym)} av ${vol(d.volymM3fub)}. `
      + 'Tillägget räknas bara på de lassen. Skriv in avståndet enkel väg om '
      + 'det inte stämmer.',
    varde: `${kr2(krPerM3)} kr/m³fub · ${tal(d.avstand.kronor)} kr`,
    ark: 'avstand',
  };
}

/** Terrängen. 0 kr kan vara rätt — posten frågar, den påstår inget. */
function terrangPost(d: FattasIndata): FattasPost | null {
  if (d.terrangKr !== 0) return null;
  return {
    nyckel: 'terrang',
    rubrik: 'Terrängtillägget är 0 kr',
    text: 'Är marken normal? Svår eller blöt mark ger ett tillägg som går till '
      + 'skotaren.',
    varde: '0 kr',
    ark: 'terrang',
  };
}

/**
 * Sortimentsantalet. Martins beslut 2026-11-16: appen föreslår, han rättar per
 * trakt — ingen tröskel reproducerar hans fakturor (Brokamåla har 7 sortiment
 * där alla är över 2 m³ och han fakturerade för 6; Bågskyttebanan har 7 och
 * han fakturerade 8). Därför frågas det på VARJE trakt där talet inte är satt
 * för hand, också när antalet ligger under grundantalet: är appens 5 i själva
 * verket 7 är det pengar som inte syns.
 */
function sortimentPost(d: FattasIndata): FattasPost | null {
  if (d.sortiment.manuellt) return null;
  const { anvant, grundantal, krPerExtra } = d.sortiment;

  if (grundantal == null || krPerExtra == null) {
    return {
      nyckel: 'sortiment',
      rubrik: `Appen räknar ${anvant} sortiment`,
      text: 'Ingen sats i prislistan, så tillägget blir 0 kr. Stämmer antalet?',
      varde: null,
      ark: 'sortiment',
    };
  }

  // EN regel: `extra > 0` avgör både texten och värdet. Ett Math.max(0, …) här
  // vore dött — ett negativt `extra` når aldrig fram till någon rad — och dött
  // skydd är värre än inget, för det ser ut som att någon tänkt på fallet.
  const extra = anvant - grundantal;
  const krPerM3 = extra * krPerExtra;
  const kronor = krPerM3 * d.volymM3fub;

  return {
    nyckel: 'sortiment',
    rubrik: `Appen räknar ${anvant} sortiment`,
    text: extra > 0
      ? `${extra} över de ${grundantal} som ingår i priset. Stämmer det?`
      : `Alla ${anvant} ingår i priset — tillägget blir 0 kr. Stämmer det?`,
    varde: extra > 0
      ? `+${kr2(krPerM3)} kr/m³fub · ${tal(kronor)} kr`
      : '0 kr',
    ark: 'sortiment',
  };
}

/** Rubriken över kortet. Tom lista = kortet ritas inte. */
export function fattasRubrik(poster: FattasPost[]): string {
  return poster.length === 1 ? '1 sak att kolla' : `${poster.length} saker att kolla`;
}
