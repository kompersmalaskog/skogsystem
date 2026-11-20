// Maskinfiler utan objekt i "Behöver dig" (Martin 2026-10-24: "massa olika menyer och jätte rörigt").
//
// Förut stod samma sak på tre ställen: en fil-rad i Behöver dig, en egen ruta "57 filer hör inte till något objekt" och en
// rad "12 småjobb utan VO". Nu finns EN väg: ett jobb vars senaste fil kom de senaste 30 dagarna är en fråga i Behöver dig
// ("Vilket objekt hör filen till?"). Äldre jobb är klara i skogen — skotaren behöver inga högar längre — och ligger tyst
// bakom en rad längst ner i listan. Inget försvinner: kopplas eller ignoreras gör man fortfarande där.
//
// Källan är densamma som importens och planeringsvyns: ett jobbs nummer som varken är ett objekts vo_nummer eller ett extra
// nummer (lib/objektNummer `okopplatJobb`). Koppla = ett extra nummer på det valda objektet; Ignorera = hpr_ignorerad.

import { ignoreradNyckel, troligaObjekt, type ObjektNamnRad, type OkopplatJobb } from '@/lib/objektNummer';

/** Ett jobb vars senaste fil är högst så här gammal är en fråga i Behöver dig. */
export const AKTUELL_DAGAR = 30;

const DAG_MS = 86_400_000;

/** Är filens datum ("2026-10-23" eller en tidsstämpel) inom `dagar` från idag? Saknat datum = inte aktuellt. */
export function arAktuell(datum: string | null | undefined, idag: Date, dagar = AKTUELL_DAGAR): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(datum ?? ''));
  if (!m) return false;
  const fil = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const nu = Date.UTC(idag.getFullYear(), idag.getMonth(), idag.getDate());
  return nu - fil <= dagar * DAG_MS;
}

/**
 * Dela jobben i det som är en fråga nu (aktuellt, går att koppla, inte ignorerat) och hur många som ligger tysta (äldre
 * eller utan nummer, inte ignorerade).
 */
export function delaFilJobb(jobb: readonly OkopplatJobb[], ignorerade: ReadonlySet<string>, idag: Date): { aktuella: OkopplatJobb[]; tysta: number } {
  const aktuella: OkopplatJobb[] = [];
  let tysta = 0;
  for (const j of jobb) {
    if (ignorerade.has(ignoreradNyckel(j))) continue;
    if (j.kanKopplas && arAktuell(j.datum, idag)) aktuella.push(j);
    else tysta++;
  }
  return { aktuella, tysta };
}

const ord = (s: string | null | undefined) =>
  String(s ?? '').toLocaleLowerCase('sv').split(/[^a-zåäöé0-9]+/).filter((t) => t.length >= 3);

/**
 * Objekten som filen troligast hör till, högst tre: först samma namn (importens regel), sedan objekt där minst hälften av
 * filnamnets ord finns i objektets namn.
 */
export function kandidaterFor(jobb: Pick<OkopplatJobb, 'namn'>, objekt: readonly ObjektNamnRad[]): ObjektNamnRad[] {
  const troliga = troligaObjekt(jobb, objekt);
  const ut: ObjektNamnRad[] = [...troliga];
  const jo = new Set(ord(jobb.namn));
  if (jo.size > 0) {
    const poang = objekt
      .filter((o) => !ut.some((u) => u.id === o.id))
      .map((o) => {
        const oo = new Set(ord(o.namn));
        let traff = 0;
        jo.forEach((t) => { if (oo.has(t)) traff++; });
        return { o, p: traff / jo.size };
      })
      .filter((x) => x.p >= 0.5)
      .sort((a, b) => b.p - a.p || String(a.o.namn ?? '').localeCompare(String(b.o.namn ?? ''), 'sv'));
    for (const x of poang) ut.push(x.o);
  }
  return ut.slice(0, 3);
}

/** Sök bland objekten på namn och VO (alla ord måste träffa), högst 20. Tom sökning = inget. */
export function sokObjekt(objekt: readonly ObjektNamnRad[], sok: string): ObjektNamnRad[] {
  const q = sok.trim().toLocaleLowerCase('sv').split(/\s+/).filter(Boolean);
  if (q.length === 0) return [];
  return objekt
    .filter((o) => {
      const t = `${o.namn ?? ''} ${o.vo_nummer ?? ''}`.toLocaleLowerCase('sv');
      return q.every((w) => t.includes(w));
    })
    .sort((a, b) => String(a.namn ?? '').localeCompare(String(b.namn ?? ''), 'sv'))
    .slice(0, 20);
}
