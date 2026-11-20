// SAMMA OBJEKT UNDER TVÅ VO-NUMMER (Martin 2026-10-24: "men mölleryd står ju tre gånger").
// Redigering grupperar dim_objekt per vo_nummer. Mölleryd RP J-Hus -25 har två rader: skördarens under
// Vidas objektnummer 11166477 och skotarens under kontraktsnumret 11271883 — och planeringens objekt
// (vo 11271883) har 11166477 som EXTRA NUMMER (objekt_alt_nummer). Det är ett objekt, men det blev två
// grupper, två rader i Behöver dig och två ark.
//
// Regeln (försiktig, hellre två rader än två objekt ihopslagna fel): numret N slås ihop med objektets
// vo_nummer V bara när
//   1. N är ett extra nummer på objektet (kontraktsnummer, inte ett maskinbundet k-nummer),
//   2. inget planeringsobjekt har N som sitt EGET vo_nummer (då hör raderna till det objektet),
//   3. det finns dim-rader under både N och V, och de bär samma namn (Kroksjömåla Grot har
//      slutavverkningens nummer som extra nummer — namnen skiljer, så de förblir två).
import type { AltNummerRad, ObjektNamnRad } from '@/lib/objektNummer';

const norm = (s: unknown) => String(s ?? '').trim();
const namnNorm = (s: unknown) => norm(s).toLowerCase().replace(/\s+/g, ' ');

export interface DimVoRad { vo_nummer?: string | null; object_name?: string | null }

/** N → V för de nummer som ska läsas som objektets eget. Tom karta när inget gäller. */
export function voGruppKarta(alias: AltNummerRad[], objekt: ObjektNamnRad[], dim: DimVoRad[]): Map<string, string> {
  const egnaVo = new Set(objekt.map(o => norm(o.vo_nummer)).filter(Boolean));
  const voPerObjekt = new Map(objekt.map(o => [o.id, norm(o.vo_nummer)]));
  const namnPerVo = new Map<string, Set<string>>();
  for (const d of dim) {
    const vo = norm(d.vo_nummer);
    if (!vo) continue;
    const s = namnPerVo.get(vo) ?? new Set<string>();
    if (norm(d.object_name)) s.add(namnNorm(d.object_name));
    namnPerVo.set(vo, s);
  }
  const karta = new Map<string, string>();
  for (const a of alias) {
    if (a.maskin_id) continue;
    const n = norm(a.nummer);
    const v = voPerObjekt.get(a.objekt_id) ?? '';
    if (!n || !v || n === v || egnaVo.has(n)) continue;
    const nNamn = namnPerVo.get(n);
    const vNamn = namnPerVo.get(v);
    if (!nNamn || !vNamn || nNamn.size !== 1 || vNamn.size !== 1) continue;
    if ([...nNamn][0] !== [...vNamn][0]) continue;
    karta.set(n, v);
  }
  return karta;
}

/** Raderna med `_vo_grupp` satt: objektets vo för ihopslagna nummer, annars radens eget vo_nummer. */
export function medVoGrupp<T extends DimVoRad>(rader: T[], karta: Map<string, string>): (T & { _vo_grupp: string | null })[] {
  return rader.map(r => {
    const vo = norm(r.vo_nummer);
    return { ...r, _vo_grupp: vo ? (karta.get(vo) ?? vo) : null };
  });
}
