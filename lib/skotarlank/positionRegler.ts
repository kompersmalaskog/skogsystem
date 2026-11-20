// Skotarlänken, telefonen som GPS: reglerna som både servern och sidan använder (inga serverberoenden här).

/** Äldre än så här (ms) är positionen inte längre "nu": pricken blir grå och tiden står bredvid. */
export const POSITION_FARSK_MS = 2 * 60_000;
/** Äldre än så här (ms) visas den inte alls. */
export const POSITION_MAX_ALDER_MS = 12 * 3600_000;

export type Position = { lat: number; lng: number; noggrannhet: number | null; kurs: number | null; tid: string };

/** Är positionen "nu"? */
export const arFarsk = (tid: string, nu = Date.now()): boolean => nu - Date.parse(tid) <= POSITION_FARSK_MS;
