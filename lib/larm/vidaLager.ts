// Vidas lager (objekt_geometri: traktgräns, kraftledning, hänsynsytor, avlägg) för trakten — och SKILLNADEN mellan "trakten har ingen geometri" och
// "geometrin gick inte att hämta". Larmen för Vidas kraftledning och hänsyn bygger på den här datan: ett hämtfel som såg ut som "ingen geometri"
// vore en tyst luckan i säkerheten. Därför tre svar, aldrig två: finns / saknas (svaret kom, inget där) / fel (svaret kom aldrig eller var ett fel).
//
// OBS: objekt_geometri har RLS. En utgången session ger tomma rader UTAN fel och ser därför ut som 'saknas' — det går inte att skilja härifrån.

export const VIDA_SAKNAS_TEXT = 'Vidas lager saknas – kraftledning och hänsyn larmar inte';

export type VidaLagerSvar =
  | { status: 'finns'; fc: { features: any[] } }
  | { status: 'saknas' }
  | { status: 'fel'; orsak: string };

/** Klassar ett svar från `select('geometri').maybeSingle()`. Ett kast räknas som fel, aldrig som "saknas". */
export async function lasVidaLager(hamta: () => PromiseLike<{ data: any; error: any }>): Promise<VidaLagerSvar> {
  try {
    const { data, error } = await hamta();
    if (error) return { status: 'fel', orsak: String(error.message ?? error) };
    const fc = data?.geometri;
    if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) return { status: 'saknas' };
    return { status: 'finns', fc };
  } catch (e) {
    return { status: 'fel', orsak: String((e as any)?.message ?? e) };
  }
}
