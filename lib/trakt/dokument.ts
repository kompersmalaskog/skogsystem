// Klassificerar trakt-PDF:er på filnamnssuffix. Ingen fallback som gör en ensam icke-TD-PDF
// till traktdirektiv, och ingen tyst överskrivning — varje typ samlas, dubbletter loggas.
// Gäller både envz-bilagor och zip-fallbackens entries.
//
// Teckenkodning: filnamn kan komma i NFC (Windows/VSOP: Ö = U+00D6) eller NFD (annat OS på
// vägen: Ö = O + combining diaeresis U+0308). Vi NFC-normaliserar en KOPIA för matchningen så
// suffixreglerna träffar oavsett — men rör aldrig p.namn, så originalnamnet (mellanslag, dubbel-
// stavning m.m.) bevaras oförändrat i lagringen. Å/Ä/Ö-regexar byggs ur \uXXXX så de är
// oberoende av hur den här källfilen råkar sparas/normaliseras.

export interface KlassadPdf {
  namn: string;
  bytes: Uint8Array;
}

// Ett traktkarteblad. ordning kommer ur _NN_-suffixet (889174_01_TK.pdf -> 1); en enskild
// karta utan nummer (…_TK.pdf) får ordning 1.
export interface TraktkartaBlad extends KlassadPdf {
  ordning: number;
}

export interface DokumentKlass {
  traktdirektiv: KlassadPdf | null;
  traktkartor: TraktkartaBlad[];        // ALLA TK-blad, sorterade på ordning (kan vara flera)
  oversiktskarta: KlassadPdf | null;    // _ÖK.pdf — egen typ, inte ett arbetsblad
  valtlapp: KlassadPdf | null;
  stamplingslangd: KlassadPdf | null;
  /** PDF:er som inget suffix känner igen. Stämplingslängden väljs ur dem av `valjStamplingslangd` — se nedan. */
  ovriga: KlassadPdf[];
  varningar: string[];
}

// NFC-normaliserad basename (utan zip-interna mappar) — ENBART för matchning.
const matchNamn = (p: KlassadPdf): string => (p.namn.split('/').pop() || p.namn).normalize('NFC');

const RE_TD = /_TD\.pdf$/i;
const RE_OK = /_\u00D6K\.pdf$/i;            // _ÖK.pdf (Ö = U+00D6) — byggd ur \uXXXX, oberoende av källkodning
const RE_TK = /_\d*_?TK\.pdf$/i;            // _01_TK.pdf ELLER _TK.pdf
const RE_TK_ORDNING = /_(\d+)_TK\.pdf$/i;   // fångar NN ur _NN_TK.pdf
const RE_VALTLAPP = /valtlapp/i;
const RE_STAMPL = /(stampl|stämpl)/i;  // ä = U+00E4

/**
 * Suffixklassning. Stämplingslängden avgörs INTE här: den kräver att man vet om trakten är en rotpost, och avtalsformen läses ur
 * traktdirektivets text — som i sin tur kräver att TD-filen hittats av den här funktionen. Anropa `valjStamplingslangd` efteråt.
 */
export function klassificeraDokument(pdfer: KlassadPdf[]): DokumentKlass {
  const varningar: string[] = [];
  let traktdirektiv: KlassadPdf | null = null;
  let oversiktskarta: KlassadPdf | null = null;
  let valtlapp: KlassadPdf | null = null;
  let stamplingslangd: KlassadPdf | null = null;
  const traktkartor: TraktkartaBlad[] = [];
  const ovriga: KlassadPdf[] = [];

  const forsta = (typ: string, ny: KlassadPdf, gammal: KlassadPdf | null): KlassadPdf => {
    if (gammal) {
      varningar.push(`Flera ${typ} (${gammal.namn}, ${ny.namn}) — behåller den första.`);
      return gammal;
    }
    return ny;
  };

  for (const p of pdfer) {
    const n = matchNamn(p);
    if (RE_TD.test(n)) traktdirektiv = forsta('traktdirektiv', p, traktdirektiv);
    else if (RE_OK.test(n)) oversiktskarta = forsta('översiktskarta', p, oversiktskarta);
    else if (RE_TK.test(n)) {
      const m = n.match(RE_TK_ORDNING);
      traktkartor.push({ namn: p.namn, bytes: p.bytes, ordning: m ? parseInt(m[1], 10) : 1 });
    }
    else if (RE_VALTLAPP.test(n)) valtlapp = forsta('vältlapp', p, valtlapp);
    else if (RE_STAMPL.test(n)) stamplingslangd = forsta('stämplingslängd', p, stamplingslangd);
    else ovriga.push(p);
  }

  // Stabil ordning: sortera på suffix-numret. Array.prototype.sort är stabil (ES2019+), så
  // blad med samma nummer behåller sin inbördes encounter-ordning.
  traktkartor.sort((a, b) => a.ordning - b.ordning);

  return { traktdirektiv, traktkartor, oversiktskarta, valtlapp, stamplingslangd, ovriga, varningar };
}

// ---------------------------------------------------------------------------
// Stämplingslängden — strukturen avgör, inte en fritextanteckning (Martin 2026-10-25)
// ---------------------------------------------------------------------------
// Vida märker ALDRIG stämplingslängden i filnamnet. Den kommer som en PDF döpt efter trakten ("Skälviken.pdf", "Mölleryd.pdf",
// "Arvidstorp RP -25.pdf") medan traktdirektiv, traktkarta och vältlapp alla har suffix och filas rätt varje gång. Paketet går
// alltså jämnt ut: det som blir över ÄR stämplingslängden.
//
// Förut krävdes att <Info> nämnde ordet stämplingslängd, och raden märktes "OSÄKER, bekräfta i UI:t". Prod 2026-10-25, alla sex
// envz-rotposter:
//     Arvidstorp RP  TD 1  TK 0  VÄLT 1  SL 1  övriga 0
//     Bågskyttebanan TD 1  TK 1  VÄLT 1  SL 1  övriga 0
//     Edestad RP     TD 1  TK 0  VÄLT 1  SL 1  övriga 0
//     Skälviken RP   TD 1  TK 1  VÄLT 1  SL 1  övriga 0
//     Vällust RP     TD 1  TK 0  VÄLT 1  SL 1  övriga 0
//     Mölleryd RP    TD 1  TK 1  VÄLT 1  SL 0  övriga 1  ← "Mölleryd.pdf"
// Mölleryd är inget undantag från regeln utan ett bevis på att regeln var fel: dess Info råkade inte nämna ordet, så PDF:en hamnade
// under "övrigt" och objektvyn frågade om en fil som låg mitt framför användaren. Den frågan går inte att förstå, eftersom den handlar
// om appens osäkerhet och inte om skogen.
//
// Nu: på en rotpost är den enda PDF:en utan känt suffix stämplingslängden. Ingen gissad-märkning, ingen fråga, ingen bekräftelseknapp.
// Blir den någon gång fel märks det på att talen inte går ihop (lib/objekt/stamplingslangd.ts jämför mot Vidas volym) — en bättre vakt
// än en fråga ingen förstår. Info-regeln ligger kvar som reserv för objekt som INTE är rotposter, där strukturen inte säger något.

export type StamplingsKalla = 'suffix' | 'rotpost' | 'info' | null;

export interface StamplingsVal {
  stamplingslangd: KlassadPdf | null;
  /** Det som är kvar efter att stämplingslängden plockats ur — sparas som övriga dokument. */
  ovriga: KlassadPdf[];
  kalla: StamplingsKalla;
  varningar: string[];
}

/**
 * Väljer stämplingslängden ur de oidentifierade PDF:erna och skriver varningarna för dem som blir kvar.
 * `rotpost` kommer ur lib/objekt/rotpost.ts (avtalsform Rp, annars "RP" i namnet).
 */
export function valjStamplingslangd(
  { stamplingslangd, ovriga, rotpost, info }:
  { stamplingslangd: KlassadPdf | null; ovriga: KlassadPdf[]; rotpost: boolean; info?: string | null },
): StamplingsVal {
  const varningar: string[] = [];
  const kvar = [...ovriga];
  let vald = stamplingslangd;
  let kalla: StamplingsKalla = vald ? 'suffix' : null;
  const infoNamner = !!info && RE_STAMPL.test(info);

  if (!vald && kvar.length === 1 && rotpost) {
    vald = kvar.pop() as KlassadPdf;
    kalla = 'rotpost';
  } else if (!vald && kvar.length === 1 && infoNamner) {
    // Inte en rotpost, men Info nämner en stämplingslängd. Strukturen säger inget här, så det är fortfarande en gissning.
    vald = kvar.pop() as KlassadPdf;
    kalla = 'info';
    varningar.push(`"${vald.namn}" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.`);
  } else if (!vald && kvar.length > 1 && (rotpost || infoNamner)) {
    // Flera okända PDF:er (t.ex. "odensssvalahult gall.pdf" + "odenssvalahultga.pdf"): då gissar vi inte, alla sparas som övrigt.
    varningar.push(`${kvar.length} oidentifierade PDF:er — gissar inte vilken som är stämplingslängden, alla sparas som övrigt dokument.`);
  } else if (!vald && kvar.length === 0 && rotpost) {
    // Ett larm med innehåll: paketet gick inte jämnt ut. Till skillnad från den gamla frågan säger det här något som faktiskt är fel.
    varningar.push('Rotpost utan stämplingslängd: ingen PDF i leveransen gick att identifiera som en.');
  }

  for (const o of kvar) {
    varningar.push(`PDF utan känt suffix: "${o.namn}" — sparad som övrigt dokument.`);
  }

  return { stamplingslangd: vald, ovriga: kvar, kalla, varningar };
}
