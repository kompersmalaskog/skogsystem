// Minimal typdeklaration för npm-paketet "shapefile" (mbostock, saknar egna typer).
declare module 'shapefile' {
  interface Source {
    read(): Promise<{ done: boolean; value: any }>;
  }
  export function open(
    shp: ArrayBuffer | Uint8Array | string,
    dbf?: ArrayBuffer | Uint8Array | string,
    options?: { encoding?: string },
  ): Promise<Source>;
  export function openShp(shp: ArrayBuffer | Uint8Array | string): Promise<Source>;
  export function openDbf(dbf: ArrayBuffer | Uint8Array | string, options?: { encoding?: string }): Promise<Source>;
}
