// Produktionshögarna ("Avverkade stammar") i skotarläget: PÅ från början. Skotaren följer skördarens stråk och högar hela tiden —
// att behöva slå på lagret under + är ett steg för mycket (Martin fick göra det för hand på Max objekt 2026-10-20).
//
// Ett eget lager-id i samma sparade lista (mapLayers_v4): saknad nyckel = PÅ, bara ett uttryckligt false (föraren slog av det i skotarläget) döljer.
// Planeringsvyn och övriga vyer läser fortfarande `produktionshogar` och rörs inte: ett val i skotarläget ändrar inte planeringens lager, och tvärtom.

export const SKOTAR_HOGAR_ID = 'skotarHogar';

type Lager = Record<string, boolean> | null | undefined;

/** Ska produktionshögarna ritas? Skotarläge: om inte föraren själv slagit av dem. Allt annat: lagret `produktionshogar` som förut. */
export const hogarSynliga = (overlays: Lager, skotarlage: boolean): boolean =>
  skotarlage ? overlays?.[SKOTAR_HOGAR_ID] !== false : !!overlays?.produktionshogar;

/** Knappen i + › Lager i skotarläget: slår om skotarläges-valet, rör inte `produktionshogar`. */
export const vaxlaSkotarHogar = <T extends Record<string, boolean>>(prev: T): T => ({ ...prev, [SKOTAR_HOGAR_ID]: !hogarSynliga(prev, true) });
