// VÅRT EGET manuella arbete blir fakturarader: timmarna ur arbetsrapporten
// (extra_tid, debiterbar) prissatta ur arbete_timpris.
//
// VARFÖR DEN FINNS (avstämning mot Vidas betalda fakturor 2026-11-16)
//
// Elva fakturor sedan augusti bär en rad för manuellt arbete, och appen visade
// timmarna med "—" eftersom priset inte fanns. Två sorter döljer sig i de
// raderna, och de ska INTE behandlas lika:
//
//   VÅRT EGET arbete, timmarna finns i arbetsrapporten
//     Bågskyttebanan  "Man tim" 16 tim à 490 = 7 840 kr   (appen: 15,87 tim)
//     Skälviken       inte fakturerad än                   (appen: 16,47 tim)
//
//   ANDRAS arbete, en faktura som skickas vidare — egna priser
//     "Fällning Jacob" 525 · "Fälning Isac" 560 · "Fällning av träd
//     Kyrköns Skogstjänst" 475 · "Fällning Jocke" 490
//
// Bara det EGNA arbetet prissätts här. De nio trakter där Martin fakturerat
// fällning utan att timmarna finns i extra_tid är andras fakturor: de bär ett
// belopp från någon annans räkning och är `leverantor`-rader som en människa
// skriver in. Att prissätta dem ur vårt timpris hade satt 490 på en rad som
// kostade 560.
//
// ───────────────────────────────────────────────────────────────────────────
// EN TYP UTAN SATS PRISSÄTTS INTE. Martin har bekräftat 490 kr/tim för manuell
// fällning. Hans fakturor visar också planering 490, brandbevakning 450 och
// täckpapp 30 kr/m — men de satserna har han inte sagt, och ett pris som går
// till kund får inte gissas. Timmarna visas då utan belopp, med ordet om
// varför, precis som förut.
// ───────────────────────────────────────────────────────────────────────────
//
// REN FUNKTION. Uppslaget (vilka rader i arbete_timpris som gäller dagen)
// ligger hos anroparen, som äger sitt datumval — samma mönster som prisPerM3.

/** En rad ur extra_tid, berikad med sin aktivitetstyp. */
export type Arbetspost = {
  /** extra_tid.aktivitet_typ — nyckeln mot arbete_timpris. */
  typ: string | null;
  /** Det som står på raden: aktivitet_text, annars typens namn. */
  etikett: string;
  minuter: number;
};

export type Timprisrad = { nyckel: string; timpris: number };

export type Arbetsrad = {
  /** Fakturatexten: "Manuell fällning". */
  etikett: string;
  /** Timmar, avrundat till två decimaler — det som står på fakturan. */
  timmar: number;
  /** Kronor per timme. null = ingen sats gäller, raden bär inget belopp. */
  timpris: number | null;
  /** Typen, för spårbarhet och tester. */
  typ: string | null;
};

/** Namnet på fakturan när raden saknar egen text. Samma ord som arbetsrapporten. */
const TYPNAMN: Record<string, string> = {
  manuellt: 'Manuell fällning',
  planering: 'Planering',
  flytt: 'Flytt',
  markagare: 'Markägarkontakt',
};

/** Minuter → timmar med två decimaler. Avrunda FÖRST, summera sedan aldrig om. */
export const timmar = (minuter: number) => Math.round((minuter / 60) * 100) / 100;

/**
 * EN RAD PER AKTIVITETSTYP, inte per post. Fakturan bär "Man tim 16" på en
 * rad, inte tre rader om 5,33 — och summan av tre avrundade delar är inte
 * summan av helheten. Timmarna summeras i MINUTER och avrundas en gång.
 *
 * Posterna behåller sin ordning: första posten av varje typ bestämmer var
 * raden hamnar, så listan ligger still mellan hämtningar.
 */
export function byggArbetsrader(poster: Arbetspost[], priser: Timprisrad[]): Arbetsrad[] {
  const perTyp = new Map<string, { etikett: string; minuter: number; typ: string | null }>();

  for (const p of poster) {
    // Nyckeln är TYPEN, aldrig etiketten: två poster med olika fritext
    // ("Fällning vid vägen", "Fällning") är samma sort arbete och samma pris.
    const nyckel = p.typ ?? '';
    const finns = perTyp.get(nyckel);
    if (finns) {
      finns.minuter += p.minuter;
    } else {
      perTyp.set(nyckel, {
        etikett: TYPNAMN[nyckel] ?? p.etikett ?? 'Arbete',
        minuter: p.minuter,
        typ: p.typ,
      });
    }
  }

  const prisKarta = new Map(priser.map(p => [p.nyckel, p.timpris]));

  return [...perTyp.values()]
    .filter(r => r.minuter > 0)
    .map(r => ({
      etikett: r.etikett,
      timmar: timmar(r.minuter),
      timpris: prisKarta.get(r.typ ?? '') ?? null,
      typ: r.typ,
    }));
}

/**
 * Noten under sektionen: vad som prissätts och vad som inte gör det. En rad
 * utan sats ska SÄGA varför, inte bara visa ett streck.
 */
export function arbetsprisNot(rader: Arbetsrad[]): string {
  const utan = rader.filter(r => r.timpris == null);
  const med = rader.filter(r => r.timpris != null);

  if (rader.length === 0) return '';
  if (utan.length === 0) {
    const satser = [...new Set(med.map(r => r.timpris))];
    return satser.length === 1
      ? `Timmarna kommer ur arbetsrapporten och faktureras à ${satser[0]} kr/tim.`
      : 'Timmarna kommer ur arbetsrapporten och faktureras per timme.';
  }
  // Ingen tabellnamn i texten: den här raden läser Martin i traktvyn, och
  // "arbete_timpris" säger honom inget. Det tekniska står i granskningens
  // noter, där det hör hemma (lib/faktura/hamtaUnderlag).
  const namn = utan.map(r => r.etikett.toLowerCase()).join(', ');
  if (med.length === 0) {
    return `Ingen timsats är satt för ${namn}, så timmarna faktureras inte.`;
  }
  return `Ingen timsats är satt för ${namn} — de timmarna faktureras inte.`;
}
