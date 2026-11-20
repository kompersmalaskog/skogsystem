// "AVVERKAS – LARMA INTE" PÅ VIDAS HÄNSYNSYTA (Martin 2026-10-29).
//
// Vidas hänsynsytor larmar ALLTID vid inkörning ("Hänsyn 6 – Du är inne i ytan, kör inte här", lib/larm). Men ibland avverkas det inne i ytan (Skälviken:
// granen i Hänsyn 6 togs ut) och då är larmet fel varje gång maskinen kör in. Planeraren markerar ytan "Avverkas – larma inte" i ytans kort; då larmar den inte och
// räknas inte i fällningscirkeln. Instruktionskortet (Vidas egen text) och ytans ritning på kartan är oförändrade — det är bara LARMET som tystnar.
//
//  - Gäller BARA Vidas hänsynsytor (nyckel `hansyn:<LOPNR>`, samma som kommentarer och foton). Nyckelbiotop och fornlämning går aldrig att tysta.
//  - Vidas data ändras aldrig: markeringen ligger i tabellen objekt_yta_avverkas (per objekt + nyckel) och överlever en omimport.
//  - Alla inloggade läser; bara admin markerar och tar bort (RLS). Vem och när sätts av databasen.
//  - Går tabellen inte att läsa (migrationen ej körd, nät) larmar allt som förut — hellre ett larm för mycket än ett tystat av misstag.

import { arHansynsyta } from './vidaYtaTyp';
import { ytaNyckel } from './traktGeometri';

export const AVVERKAS_TABELL = 'objekt_yta_avverkas';

/** Bara Vidas hänsynsytor kan markeras. */
export const kanMarkeraAvverkas = (nyckel: string | null | undefined): boolean => typeof nyckel === 'string' && /^hansyn:.+/.test(nyckel);

const arYta = (t: unknown) => t === 'Polygon' || t === 'MultiPolygon';

/**
 * Vidas samling utan de hänsynsytor som är markerade "avverkas": deras geometri blir null, så larmet och fällningscirkeln hoppar över dem. Featuren ligger KVAR på
 * sin plats i listan — larmets id (`vida:<lager>:<index>`) och därmed kvittenserna för övriga objekt ändras inte. Samma samling tillbaka när inget är markerat.
 */
export function utanAvverkade<T extends { features?: any[] } | null | undefined>(fc: T, avverkas: ReadonlySet<string>): T {
  if (!fc || !fc.features || avverkas.size === 0) return fc;
  let andrad = false;
  const features = fc.features.map((f) => {
    if (!f?.geometry || !arYta(f.geometry.type) || !arHansynsyta(f.properties)) return f;
    const n = ytaNyckel(f.properties);
    if (!n || !avverkas.has(n)) return f;
    andrad = true;
    return { ...f, geometry: null };
  });
  return andrad ? ({ ...fc, features } as T) : fc;
}

type Db = { from: (t: string) => any };

/** Markerade nycklar för objektet. `null` = kunde inte läsas (då larmar allt). */
export async function lasAvverkas(db: Db, objektId: string): Promise<Set<string> | null> {
  try {
    const { data, error } = await db.from(AVVERKAS_TABELL).select('nyckel').eq('objekt_id', objektId);
    if (error || !Array.isArray(data)) return null;
    return new Set(data.map((r: any) => String(r.nyckel)).filter(kanMarkeraAvverkas));
  } catch {
    return null;
  }
}

/** Markera (pa) eller ta bort. Läser tillbaka: sant bara när databasen faktiskt har det läge som begärdes. */
export async function sattAvverkas(db: Db, objektId: string, nyckel: string, pa: boolean): Promise<boolean> {
  if (!kanMarkeraAvverkas(nyckel)) return false;
  try {
    const { error } = pa
      ? await db.from(AVVERKAS_TABELL).upsert({ objekt_id: objektId, nyckel }, { onConflict: 'objekt_id,nyckel' })
      : await db.from(AVVERKAS_TABELL).delete().eq('objekt_id', objektId).eq('nyckel', nyckel);
    if (error) return false;
    const nu = await lasAvverkas(db, objektId);
    return !!nu && nu.has(nyckel) === pa;
  } catch {
    return false;
  }
}
