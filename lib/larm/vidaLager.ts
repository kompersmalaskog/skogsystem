// Vidas lager (objekt_geometri: traktgräns, kraftledning, hänsynsytor, avlägg) för trakten — och SKILLNADEN mellan "trakten har ingen geometri" och
// "geometrin gick inte att hämta". Larmen för Vidas kraftledning och hänsyn bygger på den här datan: ett hämtfel som såg ut som "ingen geometri"
// vore en tyst luckan i säkerheten. Därför tre svar, aldrig två: finns / saknas (svaret kom, inget där) / fel (svaret kom aldrig eller var ett fel).
//
// OBS: objekt_geometri har RLS. En utgången session ger tomma rader UTAN fel och ser därför ut som 'saknas' — det går inte att skilja härifrån.

export const VIDA_SAKNAS_TEXT = 'Vidas lager saknas – kraftledning och hänsyn larmar inte';

/**
 * Är det en Vida-trakt? Vidas objekt har ett numeriskt vo_nummer; privata jobb och "väntar på Vida" har ett P-VO (Starta jobb, `lib/startaJobb`).
 * En Vida-trakt har ALLTID en traktgräns, så ett tomt svar för den är ett fel (t.ex. en utgången session: RLS ger tomma rader utan fel).
 * För ett P-VO-jobb betyder tomt "saknas" på riktigt — ingen rad.
 */
export const arVidaVo = (vo: string | null | undefined): boolean => /^\d+$/.test((vo ?? '').trim());

export type VidaLagerSvar =
  | { status: 'finns'; fc: { features: any[] } }
  | { status: 'saknas' }
  | { status: 'fel'; orsak: string; sessionMisstankt: boolean };

type Hamta = () => PromiseLike<{ data: any; error: any }>;
export interface VidaLagerVal {
  /** Trakten är en Vida-trakt (`arVidaVo`): ett tomt svar är då ett fel. */
  forvantas?: boolean;
  /** Förnyar sessionen. Anropas högst en gång per hämtning, bara när sessionen misstänks vara utgången, och hämtningen görs om efteråt. */
  forny?: () => Promise<unknown>;
}

const AUTH_FEL = /jwt|expired|unauthori[sz]ed|\b401\b|PGRST30[0-9]|not authenticated/i;

async function klassa(hamta: Hamta, forvantas: boolean): Promise<VidaLagerSvar> {
  try {
    const { data, error } = await hamta();
    if (error) {
      const orsak = String(error.message ?? error);
      return { status: 'fel', orsak, sessionMisstankt: AUTH_FEL.test(orsak) || AUTH_FEL.test(String(error.code ?? '')) };
    }
    const fc = data?.geometri;
    if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) {
      return forvantas
        ? { status: 'fel', orsak: 'tomt svar för en Vida-trakt (saknad geometri eller utgången session)', sessionMisstankt: true }
        : { status: 'saknas' };
    }
    return { status: 'finns', fc };
  } catch (e) {
    return { status: 'fel', orsak: String((e as any)?.message ?? e), sessionMisstankt: false };
  }
}

/**
 * Klassar ett svar från `select('geometri').maybeSingle()`. Ett kast eller hämtfel är aldrig "saknas". Ett TOMT svar är "saknas" bara för ett
 * P-VO-jobb; för en Vida-trakt är det ett fel. Misstänks sessionen vara utgången (auth-fel, eller tomt för en Vida-trakt) förnyas den innan
 * hämtningen görs om en gång.
 */
export async function lasVidaLager(hamta: Hamta, val: VidaLagerVal = {}): Promise<VidaLagerSvar> {
  const forvantas = val.forvantas === true;
  const forsta = await klassa(hamta, forvantas);
  if (forsta.status === 'fel' && forsta.sessionMisstankt && val.forny) {
    try { await val.forny(); } catch { /* förnyelsen föll (t.ex. inget nät): hämtningen görs om ändå */ }
    return klassa(hamta, forvantas);
  }
  return forsta;
}

/**
 * Förnyare med spärr: en Vida-trakt vars geometri verkligen saknas ger fel var 15:e sekund, och sessionen ska inte förnyas lika ofta.
 * Spärren gäller anropen, inte utfallet: inom `minMs` från senaste förnyelse görs ingen ny.
 */
export function skapaFornyare(refresh: () => Promise<unknown>, minMs = 60000, nu: () => number = Date.now): () => Promise<unknown> {
  let senast = -Infinity;
  return async () => {
    const t = nu();
    if (t - senast < minMs) return undefined;
    senast = t;
    return refresh();
  };
}
