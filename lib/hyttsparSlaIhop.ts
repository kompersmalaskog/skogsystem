// Slå ihop två hyttspårs-punktlistor till EN (när en rad flyttas till ett objekt som redan har dagens rad för samma roll).
//
// Punkterna är [{lat,lng,tid}] i tidsordning. Ihopslagningen läggger bara till — den kastar aldrig en punkt som finns i bara EN av listorna —
// och tar bort dubbletter (samma tid + koordinat: samma punkt som skrivits in två gånger). Ordningen blir tidsordning; punkter utan giltig tid
// behåller sin inbördes ordning och hamnar efter de tidsatta (de kan inte placeras).

export interface SparPunktRad { lat: number; lng: number; tid?: string | null }

const nyckel = (p: SparPunktRad) => `${p.tid ?? ''}|${p.lat}|${p.lng}`;
const tidMs = (p: SparPunktRad): number => { const t = p.tid ? Date.parse(p.tid) : NaN; return Number.isNaN(t) ? Infinity : t; };

export function slaIhopPunkter(a: unknown, b: unknown): SparPunktRad[] {
  const lista = (x: unknown): SparPunktRad[] => (Array.isArray(x) ? x.filter((p: any) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) : []);
  const sett = new Set<string>();
  const alla: { p: SparPunktRad; i: number }[] = [];
  let i = 0;
  for (const p of [...lista(a), ...lista(b)]) {
    const k = nyckel(p);
    if (sett.has(k)) continue;
    sett.add(k);
    alla.push({ p, i: i++ });
  }
  alla.sort((x, y) => { const tx = tidMs(x.p), ty = tidMs(y.p); return tx === ty ? x.i - y.i : tx < ty ? -1 : 1; });
  return alla.map((x) => x.p);
}
