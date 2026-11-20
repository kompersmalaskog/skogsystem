// MARKERINGSSYNK: varje ny, ändrad eller borttagen markering sparas LOKALT och beständigt (IndexedDB) innan något annat händer, och en kö skickar den
// till servern när nätet finns. Hämtning från servern får aldrig ta bort eller skriva över en lokal ändring som inte kommit fram: serverns rader och
// de väntande ändringarna SAMMANFOGAS (`sammanfoga`), lokalt ovanpå.
//
// Varför (Martin, Skälviken, 2026-10-15): en symbol satt i flygplansläge försvann. Orsaken i koden: sidan markerade en ny markering som "sparad" INNAN
// upserten gjorts (och en misslyckad upsert loggades bara) — den debouncade synken såg den som ren och försökte aldrig igen — och refetchen vid
// återanslutning ERSATTE sedan hela minnet med serverns version. Inget fanns kvar lokalt och inget retrade.
//
// Den här filen är ren logik: lagret (IndexedDB / minne) och skrivningarna mot Supabase kommer in utifrån, så allt går att testa utan webbläsare.
// Samma mönster som fotokön (./fotoKo).

export type SynkOp = 'upsert' | 'delete';

export interface VantandeMarkering {
  /** `${objektId}/${markerId}` — EN väntande ändring per markering (den senaste vinner lokalt) */
  nyckel: string;
  objektId: string;
  markerId: string;
  op: SynkOp;
  typ: string;
  /** upsert: markeringen inklusive `andradTs`; delete: null */
  data: Record<string, any> | null;
  /** när den lokala ändringen gjordes (ms, serverkorrigerad klocka) */
  andrad: number;
  forsok: number;
  /** tidigast nästa försök (ms) */
  nastaForsok: number;
}

export interface ServerRad { marker_id: string; data: any }
/** Serverns senast lästa version av ett objekts markeringar — visas när trakten öppnas utan täckning. */
export interface ServerBild { objektId: string; rader: ServerRad[]; hamtad: number }

export interface SynkLager {
  put(v: VantandeMarkering): Promise<void>;
  get(nyckel: string): Promise<VantandeMarkering | null>;
  alla(): Promise<VantandeMarkering[]>;
  ta(nyckel: string): Promise<void>;
  sparaBild(b: ServerBild): Promise<void>;
  lasBild(objektId: string): Promise<ServerBild | null>;
}

export const markeringNyckel = (objektId: string | number, markerId: string | number) => `${objektId}/${markerId}`;

/** När en markering senast ändrades enligt dess egen data (0 = okänt, t.ex. raden skrevs före den här synken). */
export const andradTid = (data: unknown): number => {
  const v = Number((data as any)?.andradTs);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

// ── Sammanfogning ────────────────────────────────────────────────────────────────────────────────────────────────────

export type KrockTyp = 'lokal_nyare' | 'server_nyare' | 'raderad_lokalt_efter_serverandring';
export interface Krock { nar: number; objektId: string; markerId: string; typ: KrockTyp; lokal: number; server: number }

/**
 * Serverns rader + de väntande lokala ändringarna ovanpå:
 *  - väntande RADERING: markeringen tas bort ur resultatet (även om servern ännu har den) — en borttagning får aldrig återuppstå;
 *  - väntande ÄNDRING/NY: ersätter serverns version — utom när servern har en NYARE version (annan enhet, `andradTs` större) → senaste ändring vinner,
 *    serverns version behålls och den lokala ändringen läggs i `ersatta` (kön släpper den);
 *  - allt annat i serverns rader behålls orört, i serverns ordning; nya lokala markeringar läggs sist i ändringsordning.
 * Ren funktion: ingenting skrivs någonstans.
 */
export function sammanfoga(server: ServerRad[], vantande: VantandeMarkering[], nu = 0): { markers: any[]; krockar: Krock[]; ersatta: string[] } {
  const krockar: Krock[] = [];
  const ersatta: string[] = [];
  const perId = new Map<string, VantandeMarkering>();
  for (const p of vantande) perId.set(p.markerId, p);

  const ut: any[] = [];
  const sedda = new Set<string>();
  for (const rad of server) {
    const id = String(rad.marker_id);
    sedda.add(id);
    const p = perId.get(id);
    if (!p) { ut.push(rad.data); continue; }
    const sTs = andradTid(rad.data);
    if (p.op === 'delete') {
      if (sTs > p.andrad) krockar.push({ nar: nu, objektId: p.objektId, markerId: id, typ: 'raderad_lokalt_efter_serverandring', lokal: p.andrad, server: sTs });
      continue;   // borttagen lokalt: aldrig tillbaka
    }
    if (sTs > p.andrad) {
      krockar.push({ nar: nu, objektId: p.objektId, markerId: id, typ: 'server_nyare', lokal: p.andrad, server: sTs });
      ersatta.push(p.nyckel);
      ut.push(rad.data);
      continue;
    }
    if (JSON.stringify(rad.data) !== JSON.stringify(p.data)) krockar.push({ nar: nu, objektId: p.objektId, markerId: id, typ: 'lokal_nyare', lokal: p.andrad, server: sTs });
    ut.push(p.data);
  }
  for (const p of [...vantande].sort((a, b) => a.andrad - b.andrad)) {
    if (p.op !== 'upsert' || sedda.has(p.markerId)) continue;
    ut.push(p.data);
  }
  return { markers: ut, krockar, ersatta };
}

// ── Kön ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Väntetid före nästa försök: 5 s, 10 s, 20 s … högst 2 min (fältdata ska upp så fort nätet finns). */
export const synkBackoffMs = (forsok: number) => Math.min(2 * 60_000, 5_000 * 2 ** Math.max(0, forsok - 1));

export interface ServerInfo {
  /** serverns `andradTs` (0 = saknas) */
  andradTs: number;
  photoPath?: string | null;
  photoTs?: number | null;
}

export interface SynkDeps {
  lager: SynkLager;
  /** Läser serverns andradTs + foto för raderna. null = gick inte att läsa (nätfel) → försök igen. Saknad rad = ingen post i kartan. */
  lasInfo: (objektId: string, ids: string[]) => Promise<Map<string, ServerInfo> | null>;
  /** UPSERT av raderna. true = skrivet. */
  skrivUpsert: (rader: { objekt_id: string; marker_id: string; typ: string; data: Record<string, any> }[]) => Promise<boolean>;
  /** DELETE av en rad. true = borttagen (eller fanns inte). */
  skrivDelete: (objektId: string, markerId: string) => Promise<boolean>;
  nu?: () => number;
  /** något i kön ändrades (ny ändring, skickad, släppt) — driver indikatorn "N väntar" */
  paForandring?: () => void;
  /** markeringar som nu ligger på servern (fotokön kan koppla sina foton) */
  paSynkad?: (r: { objektId: string; markerIds: string[] }) => void;
  paKrock?: (k: Krock) => void;
}

export function skapaMarkeringSynk(d: SynkDeps) {
  const nu = d.nu ?? (() => Date.now());
  const andrad = () => { try { d.paForandring?.(); } catch { /* */ } };
  let pagar: Promise<void> | null = null;
  // Strikt växande stämpel: två ändringar inom samma millisekund får olika `andrad`, så en kvittering aldrig tar bort den nyare av dem.
  let senaste = 0;
  const stampel = () => { const t = nu(); senaste = t > senaste ? t : senaste + 1; return senaste; };

  /** Sparar en ny eller ändrad markering lokalt, beständigt, direkt. Den senaste ändringen per markering ersätter den förra (även en väntande radering). */
  async function laggUpsert(objektId: string, marker: Record<string, any>, typ: string): Promise<void> {
    const markerId = String(marker.id);
    const ts = stampel();
    await d.lager.put({
      nyckel: markeringNyckel(objektId, markerId), objektId, markerId, op: 'upsert', typ,
      data: { ...marker, andradTs: ts }, andrad: ts, forsok: 0, nastaForsok: 0,
    });
    andrad();
  }

  /** Markerar en markering som borttagen lokalt (grav tills servern bekräftat). Ersätter en väntande ändring av den. */
  async function laggDelete(objektId: string, markerId: string): Promise<void> {
    await d.lager.put({
      nyckel: markeringNyckel(objektId, markerId), objektId, markerId: String(markerId), op: 'delete', typ: '', data: null,
      andrad: stampel(), forsok: 0, nastaForsok: 0,
    });
    andrad();
  }

  async function vantande(objektId?: string): Promise<VantandeMarkering[]> {
    const alla = await d.lager.alla();
    return (objektId ? alla.filter((v) => v.objektId === objektId) : alla).sort((a, b) => a.andrad - b.andrad);
  }

  /** Kön släpper de ändringar som servern redan har en nyare version av (senaste ändring vinner). */
  async function slapp(nycklar: string[]): Promise<void> {
    for (const n of nycklar) await d.lager.ta(n);
    if (nycklar.length) andrad();
  }

  /** Tar bort en kvitterad post — men bara om ingen nyare ändring lagts till medan den skickades. */
  async function kvittera(v: VantandeMarkering): Promise<boolean> {
    const kvar = await d.lager.get(v.nyckel);
    if (kvar && kvar.andrad === v.andrad) { await d.lager.ta(v.nyckel); return true; }
    return false;
  }

  async function misslyckades(v: VantandeMarkering): Promise<void> {
    const kvar = await d.lager.get(v.nyckel).catch(() => null);
    if (kvar && kvar.andrad === v.andrad) await d.lager.put({ ...kvar, forsok: kvar.forsok + 1, nastaForsok: nu() + synkBackoffMs(kvar.forsok + 1) }).catch(() => {});
  }

  /** Ett varv över kön. `tvinga` hoppar över väntetiden (nätet kom tillbaka, appen öppnades, sidan ska hämta). Ett varv i taget; kastar aldrig. */
  function kor(tvinga = false): Promise<void> {
    if (pagar) return pagar;
    pagar = (async () => {
      const alla = (await d.lager.alla()).sort((a, b) => a.andrad - b.andrad);
      const forfallna = alla.filter((v) => tvinga || v.nastaForsok <= nu());
      if (forfallna.length === 0) return;

      // Raderingar: en i taget.
      for (const v of forfallna.filter((x) => x.op === 'delete')) {
        try {
          if (await d.skrivDelete(v.objektId, v.markerId)) { if (await kvittera(v)) andrad(); } else await misslyckades(v);
        } catch { await misslyckades(v); }
      }

      // Nya/ändrade: per objekt, ett anrop för serverns tider och ett för skrivningen.
      const perObjekt = new Map<string, VantandeMarkering[]>();
      for (const v of forfallna.filter((x) => x.op === 'upsert')) perObjekt.set(v.objektId, [...(perObjekt.get(v.objektId) ?? []), v]);
      for (const [objektId, lista] of Array.from(perObjekt.entries())) {
        try {
          // Krockkontrollen (serverns andradTs) är bästa möjliga — den får aldrig blockera sparningen. Går den inte att läsa efter två försök skickas
          // ändringarna ändå utan kontroll (är nätet borta misslyckas skrivningen ändå och försöket räknas; fältdata går före en krock-kontroll).
          let info = await d.lasInfo(objektId, lista.map((v) => v.markerId));
          if (!info) {
            if (Math.max(...lista.map((v) => v.forsok)) < 2) { for (const v of lista) await misslyckades(v); continue; }
            info = new Map();
          }
          const skicka: VantandeMarkering[] = [];
          const slappta: string[] = [];
          for (const v of lista) {
            const s = info.get(v.markerId);
            if (s && s.andradTs > v.andrad) {
              // Servern har en nyare version (annan enhet): senaste ändring vinner, kön släpper vår.
              const k: Krock = { nar: nu(), objektId, markerId: v.markerId, typ: 'server_nyare', lokal: v.andrad, server: s.andradTs };
              try { d.paKrock?.(k); } catch { /* */ }
              const kvar = await d.lager.get(v.nyckel);
              if (kvar && kvar.andrad === v.andrad) slappta.push(v.nyckel);
            } else skicka.push(v);
          }
          await slapp(slappta);
          if (skicka.length === 0) continue;
          const rader = skicka.map((v) => {
            const s = info.get(v.markerId);
            const data = { ...(v.data as Record<string, any>) };
            // Ett upload-kopplat foto får aldrig skrivas bort av en äldre lokal version (fotokön patchar raden oberoende).
            if (s?.photoPath && !data.photoPath && !data.photoData) { data.photoPath = s.photoPath; if (s.photoTs != null) data.photoTs = s.photoTs; }
            return { objekt_id: objektId, marker_id: v.markerId, typ: v.typ, data };
          });
          if (await d.skrivUpsert(rader)) {
            const klara: string[] = [];
            for (const v of skicka) if (await kvittera(v)) klara.push(v.markerId);
            if (klara.length) andrad();
            try { d.paSynkad?.({ objektId, markerIds: skicka.map((v) => v.markerId) }); } catch { /* */ }
          } else for (const v of skicka) await misslyckades(v);
        } catch { for (const v of lista) await misslyckades(v); }
      }
    })().catch(() => { /* nästa trigger försöker igen */ }).finally(() => { pagar = null; });
    return pagar;
  }

  return { laggUpsert, laggDelete, vantande, kor, slapp };
}

export type MarkeringSynk = ReturnType<typeof skapaMarkeringSynk>;

// ── Lager ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Minneslager: tester, och reserv när IndexedDB inte går att öppna (privat läge). Överlever inte att appen stängs. */
export function skapaMinnesSynkLager(): SynkLager {
  const m = new Map<string, VantandeMarkering>();
  const bilder = new Map<string, ServerBild>();
  return {
    async put(v) { m.set(v.nyckel, JSON.parse(JSON.stringify(v))); },
    async get(n) { const v = m.get(n); return v ? JSON.parse(JSON.stringify(v)) : null; },
    async alla() { return Array.from(m.values()).map((v) => JSON.parse(JSON.stringify(v))); },
    async ta(n) { m.delete(n); },
    async sparaBild(b) { bilder.set(b.objektId, JSON.parse(JSON.stringify(b))); },
    async lasBild(id) { const b = bilder.get(id); return b ? JSON.parse(JSON.stringify(b)) : null; },
  };
}

const DB_NAMN = 'skogsystem-markeringar';
const STORE_VANTANDE = 'vantande';
const STORE_BILD = 'serverbild';

/** IndexedDB-lager. Ger null om IndexedDB saknas eller inte går att öppna. */
export async function skapaIndexedDbSynkLager(idb: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): Promise<SynkLager | null> {
  if (!idb) return null;
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((klar, fel) => {
      const r = idb.open(DB_NAMN, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE_VANTANDE)) r.result.createObjectStore(STORE_VANTANDE, { keyPath: 'nyckel' });
        if (!r.result.objectStoreNames.contains(STORE_BILD)) r.result.createObjectStore(STORE_BILD, { keyPath: 'objektId' });
      };
      r.onsuccess = () => klar(r.result);
      r.onerror = () => fel(r.error);
      r.onblocked = () => fel(new Error('blockerad'));
    });
  } catch { return null; }
  const tx = <T,>(store: string, lage: IDBTransactionMode, g: (s: IDBObjectStore) => IDBRequest<T>) => new Promise<T>((klar, fel) => {
    const t = db.transaction(store, lage);
    const r = g(t.objectStore(store));
    t.oncomplete = () => klar(r.result);
    t.onerror = () => fel(t.error);
    t.onabort = () => fel(t.error);
  });
  return {
    put: async (v) => { await tx(STORE_VANTANDE, 'readwrite', (s) => s.put(v)); },
    get: async (n) => ((await tx(STORE_VANTANDE, 'readonly', (s) => s.get(n))) as VantandeMarkering | undefined) ?? null,
    alla: async () => (await tx(STORE_VANTANDE, 'readonly', (s) => s.getAll())) as VantandeMarkering[],
    ta: async (n) => { await tx(STORE_VANTANDE, 'readwrite', (s) => s.delete(n)); },
    sparaBild: async (b) => { await tx(STORE_BILD, 'readwrite', (s) => s.put(b)); },
    lasBild: async (id) => ((await tx(STORE_BILD, 'readonly', (s) => s.get(id))) as ServerBild | undefined) ?? null,
  };
}
