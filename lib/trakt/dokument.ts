// Klassificerar trakt-PDF:er på filnamnssuffix. Ingen fallback som gör en ensam icke-TD-PDF
// till traktdirektiv, och ingen tyst överskrivning — varje typ samlas, dubbletter loggas.
// Gäller både envz-bilagor och zip-fallbackens entries.

export interface KlassadPdf {
  namn: string;
  bytes: Uint8Array;
}

export interface DokumentKlass {
  traktdirektiv: KlassadPdf | null;
  traktkarta: KlassadPdf | null;
  valtlapp: KlassadPdf | null;
  stamplingslangd: KlassadPdf | null;
  stamplingslangdOsaker: boolean;
  ovriga: KlassadPdf[];
  varningar: string[];
}

export function klassificeraDokument(pdfer: KlassadPdf[], info?: string | null): DokumentKlass {
  const varningar: string[] = [];
  let traktdirektiv: KlassadPdf | null = null;
  let traktkarta: KlassadPdf | null = null;
  let valtlapp: KlassadPdf | null = null;
  let stamplingslangd: KlassadPdf | null = null;
  const ovriga: KlassadPdf[] = [];

  const forsta = (typ: string, ny: KlassadPdf, gammal: KlassadPdf | null): KlassadPdf => {
    if (gammal) {
      varningar.push(`Flera ${typ} (${gammal.namn}, ${ny.namn}) — behåller den första.`);
      return gammal;
    }
    return ny;
  };

  for (const p of pdfer) {
    const n = p.namn.split('/').pop() || p.namn; // zip-interna mappar bort
    if (/_TD\.pdf$/i.test(n)) traktdirektiv = forsta('traktdirektiv', p, traktdirektiv);
    else if (/_\d*_?TK\.pdf$/i.test(n)) traktkarta = forsta('traktkarta', p, traktkarta);
    else if (/valtlapp/i.test(n)) valtlapp = forsta('vältlapp', p, valtlapp);
    else if (/(stampl|stämpl)/i.test(n)) stamplingslangd = forsta('stämplingslängd', p, stamplingslangd);
    else ovriga.push(p);
  }

  // Inskannad stämplingslängd utan VSOP-namnmönster (t.ex. "Mölleryd.pdf" från en Toshiba):
  // exakt EN oidentifierad PDF OCH <Info> nämner stämplingslängd -> tolka som det men märk
  // OSÄKER och be UI:t bekräfta. Gissa aldrig tyst.
  let stamplingslangdOsaker = false;
  if (!stamplingslangd && ovriga.length === 1 && info && /(stampl|stämpl)/i.test(info)) {
    stamplingslangd = ovriga.pop() as KlassadPdf;
    stamplingslangdOsaker = true;
    varningar.push(`"${stamplingslangd.namn}" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.`);
  }

  for (const o of ovriga) {
    varningar.push(`PDF utan känt suffix: "${o.namn}" — sparad som övrigt dokument.`);
  }

  return { traktdirektiv, traktkarta, valtlapp, stamplingslangd, stamplingslangdOsaker, ovriga, varningar };
}
