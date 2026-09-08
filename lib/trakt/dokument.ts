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
  stamplingslangdOsaker: boolean;
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

export function klassificeraDokument(pdfer: KlassadPdf[], info?: string | null): DokumentKlass {
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

  // Inskannad stämplingslängd utan VSOP-namnmönster (t.ex. "Mölleryd.pdf" från en Toshiba):
  // exakt EN oidentifierad PDF OCH <Info> nämner stämplingslängd -> tolka som det men märk
  // OSÄKER och be UI:t bekräfta. Fyrar ALDRIG när det finns flera okända PDF:er (t.ex. två
  // snarlika namn "odensssvalahult gall.pdf" + "odenssvalahultga.pdf") — då gissar vi inte,
  // båda hamnar i ovriga med originalnamnen och en varning per fil.
  let stamplingslangdOsaker = false;
  if (!stamplingslangd && ovriga.length === 1 && info && RE_STAMPL.test(info)) {
    stamplingslangd = ovriga.pop() as KlassadPdf;
    stamplingslangdOsaker = true;
    varningar.push(`"${stamplingslangd.namn}" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.`);
  } else if (!stamplingslangd && ovriga.length > 1 && info && RE_STAMPL.test(info)) {
    varningar.push(`Info nämner stämplingslängd men ${ovriga.length} oidentifierade PDF:er finns — gissar inte, alla sparas som övrigt dokument.`);
  }

  for (const o of ovriga) {
    varningar.push(`PDF utan känt suffix: "${o.namn}" — sparad som övrigt dokument.`);
  }

  return { traktdirektiv, traktkartor, oversiktskarta, valtlapp, stamplingslangd, stamplingslangdOsaker, ovriga, varningar };
}
