// Produktionshögarna: skördarens stammar klustrade inom ~10 m till högar.
//
// EN algoritm för planeringsvyns karta och Objektöversiktens karta — flyttad oförändrad ur app/planering/page.tsx
// (loadHogar, klient-grenen). Ren funktion: ingen karta, ingen databas.

export type HogStam = {
  lat: number;
  lng: number;
  total_volym: number | null;
  tradslag: string;
  sortiment?: string | null;
  bio_energy_adaption?: boolean | null;
  datum?: string;
};

export type HogKluster = {
  lat: number;
  lng: number;
  /** Antal stammar i högen. */
  n: number;
  /** m³fub (summa av stammarnas total_volym, m³sub). */
  volym: number;
  tradslagCount: Record<string, number>;
  sortimentVolym: Record<string, number>;
  grotCount: number;
  datum: string;
};

// 10 m ≈ 0.00009 grader lat, 0.00016 grader lng vid 56°N
export const KLUSTER_RAD_LAT = 0.00009;
export const KLUSTER_RAD_LNG = 0.00016;

/** Klustrar stammar i högar: varje ännu fri stam tar alla fria stammar inom ~10 m (ruta), i den ordning de kommer. */
export function klustraStammar(stammar: readonly HogStam[]): HogKluster[] {
  const ut: HogKluster[] = [];
  const used = new Uint8Array(stammar.length);
  for (let i = 0; i < stammar.length; i++) {
    if (used[i]) continue;
    const s = stammar[i];
    if (!s.lat || !s.lng) continue;

    const cluster = [i];
    used[i] = 1;
    let sumLat = s.lat, sumLng = s.lng;
    for (let j = i + 1; j < stammar.length; j++) {
      if (used[j]) continue;
      const t = stammar[j];
      if (!t.lat || !t.lng) continue;
      if (Math.abs(t.lat - s.lat) < KLUSTER_RAD_LAT && Math.abs(t.lng - s.lng) < KLUSTER_RAD_LNG) {
        cluster.push(j);
        used[j] = 1;
        sumLat += t.lat;
        sumLng += t.lng;
      }
    }

    const n = cluster.length;
    let volym = 0;
    const tradslagCount: Record<string, number> = {};
    const sortimentVolym: Record<string, number> = {};
    let datum = '';
    let grotCount = 0;
    for (const idx of cluster) {
      const st = stammar[idx];
      const stVol = st.total_volym || 0;
      volym += stVol;
      const ts = st.tradslag || 'OKÄNT';
      tradslagCount[ts] = (tradslagCount[ts] || 0) + 1;
      if (st.sortiment) sortimentVolym[st.sortiment] = (sortimentVolym[st.sortiment] || 0) + stVol;
      if (!datum && st.datum) datum = st.datum;
      if (st.bio_energy_adaption) grotCount++;
    }
    ut.push({ lat: sumLat / n, lng: sumLng / n, n, volym, tradslagCount, sortimentVolym, grotCount, datum });
  }
  return ut;
}
