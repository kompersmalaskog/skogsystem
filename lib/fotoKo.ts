// KÖN FÖR MARKERINGSFOTON: ett taget foto sparas LOKALT och beständigt direkt, och laddas upp i bakgrunden när nätet finns — aldrig "ta om bilden".
//
// Varför: Joacim planerade Skälviken 2026-10-14 med dålig täckning. 30 markeringar och 11 kommentarer synkades, men 0 av fotona — de laddades upp
// vid fotograferingen, misslyckades, och bilden kastades. Nu skrivs fotot först till IndexedDB (överlever att appen stängs och telefonen startas
// om), markeringen visar det direkt, och kön försöker tills det är uppe.
//
// Fotot lagras som ArrayBuffer + typ, inte som Blob: Safari/iOS är opålitligt med Blob i IndexedDB. Aldrig base64 i markeringens data (orsaken till
// 9 MB-raderna förut) — markeringen får bara sin `photoPath` när fotot ligger i Storage.
//
// Den här filen är ren logik: lagret (IndexedDB / minne) och uppladdningen/patchen kommer in utifrån, så allt går att testa utan webbläsare.

export interface VantandeFoto {
  /** `${objektId}/${markerId}` */
  nyckel: string;
  objektId: string;
  markerId: string;
  /** Storage-sökväg (markering-foton) — samma för ett omtag, som skriver över */
  sokvag: string;
  buf: ArrayBuffer;
  typ: string;
  skapad: number;
  forsok: number;
  /** tidigast nästa försök (ms) */
  nastaForsok: number;
  /** Filen ligger redan i Storage; det som återstår är att sätta photoPath på markeringens rad */
  uppladdad: boolean;
  /** när markeringens rad första gången saknades efter uppladdning (för att ge upp en föräldralös) */
  saknadSedan: number | null;
}

export interface FotoLager {
  put(f: VantandeFoto): Promise<void>;
  get(nyckel: string): Promise<VantandeFoto | null>;
  alla(): Promise<VantandeFoto[]>;
  ta(nyckel: string): Promise<void>;
}

export const fotoNyckel = (objektId: string | number, markerId: string | number) => `${objektId}/${markerId}`;

export type PatchSvar = 'ok' | 'saknas' | 'fel';

export interface FotoKoDeps {
  lager: FotoLager;
  /** laddar upp till Storage (kastar vid fel) */
  ladda: (sokvag: string, blob: Blob) => Promise<void>;
  /** sätter photoPath på markeringens rad — UPDATE, aldrig upsert (får inte återuppliva en borttagen markering) */
  patcha: (f: { objektId: string; markerId: string; sokvag: string; skapad: number }) => Promise<PatchSvar>;
  nu?: () => number;
  /** något i kön ändrades (nytt foto, uppe, borttaget) */
  paForandring?: () => void;
  /** fotot ligger i Storage — sidan sätter photoPath i sitt minne */
  paUppe?: (f: { objektId: string; markerId: string; sokvag: string; skapad: number }) => void;
}

/** Väntetid före nästa försök: 30 s, 1 min, 2 min … högst 15 min. */
export const backoffMs = (forsok: number) => Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, forsok - 1));
/** En markering vars rad aldrig dyker upp ges upp efter så här länge (nattcronet städar föräldralösa filer efter 7 dagar). */
export const GE_UPP_EFTER_MS = 7 * 24 * 3600_000;

export function skapaFotoKo(d: FotoKoDeps) {
  const nu = d.nu ?? (() => Date.now());
  const andrad = () => { try { d.paForandring?.(); } catch { /* */ } };
  let pagar: Promise<void> | null = null;

  async function laggTill(objektId: string, markerId: string, sokvag: string, blob: Blob): Promise<void> {
    const buf = await blobTillBuf(blob);
    await d.lager.put({
      nyckel: fotoNyckel(objektId, markerId), objektId, markerId, sokvag, buf, typ: blob.type || 'image/jpeg',
      skapad: nu(), forsok: 0, nastaForsok: 0, uppladdad: false, saknadSedan: null,
    });
    andrad();
  }

  /** Markeringen togs bort innan fotot kom upp: ta bort det väntande fotot också. */
  async function tomForMarkering(objektId: string, markerId: string): Promise<void> {
    await d.lager.ta(fotoNyckel(objektId, markerId));
    andrad();
  }

  async function lokaltFoto(objektId: string, markerId: string): Promise<Blob | null> {
    const f = await d.lager.get(fotoNyckel(objektId, markerId));
    return f ? new Blob([f.buf], { type: f.typ }) : null;
  }

  async function vantande(): Promise<VantandeFoto[]> { return d.lager.alla(); }

  /** Ett varv över kön. `tvinga` hoppar över väntetiden (nätet kom tillbaka, appen öppnades). Ett varv i taget. */
  function kor(tvinga = false): Promise<void> {
    if (pagar) return pagar;
    pagar = (async () => {
      const lista = (await d.lager.alla()).sort((a, b) => a.skapad - b.skapad);
      for (const f0 of lista) {
        const f = (await d.lager.get(f0.nyckel)) ?? null;   // kan ha tagits bort medan vi väntade
        if (!f) continue;
        if (!tvinga && f.nastaForsok > nu()) continue;
        try {
          if (!f.uppladdad) {
            await d.ladda(f.sokvag, new Blob([f.buf], { type: f.typ }));
            // Fotot kan ha bytts (omtag) eller markeringen tagits bort under uppladdningen → läs om innan vi kvitterar.
            const kvar = await d.lager.get(f.nyckel);
            if (!kvar) { andrad(); continue; }
            if (kvar.skapad !== f.skapad) continue;   // ett nyare foto väntar: nästa varv tar det
            f.uppladdad = true;
          }
          d.paUppe?.({ objektId: f.objektId, markerId: f.markerId, sokvag: f.sokvag, skapad: f.skapad });
          const svar = await d.patcha({ objektId: f.objektId, markerId: f.markerId, sokvag: f.sokvag, skapad: f.skapad });
          if (svar === 'ok') {
            const kvar = await d.lager.get(f.nyckel);
            if (kvar && kvar.skapad === f.skapad) await d.lager.ta(f.nyckel);
            andrad();
          } else {
            const saknad = svar === 'saknas' ? (f.saknadSedan ?? nu()) : f.saknadSedan;
            if (svar === 'saknas' && nu() - (saknad ?? nu()) > GE_UPP_EFTER_MS) { await d.lager.ta(f.nyckel); andrad(); continue; }
            const kvar = await d.lager.get(f.nyckel);
            if (kvar && kvar.skapad === f.skapad) await d.lager.put({ ...kvar, uppladdad: true, saknadSedan: saknad, forsok: f.forsok + 1, nastaForsok: nu() + backoffMs(f.forsok + 1) });
          }
        } catch {
          const kvar = await d.lager.get(f.nyckel).catch(() => null);
          if (kvar && kvar.skapad === f.skapad) await d.lager.put({ ...kvar, forsok: f.forsok + 1, nastaForsok: nu() + backoffMs(f.forsok + 1) }).catch(() => {});
        }
      }
    })().finally(() => { pagar = null; });
    return pagar;
  }

  return { laggTill, tomForMarkering, lokaltFoto, vantande, kor };
}

export type FotoKo = ReturnType<typeof skapaFotoKo>;

async function blobTillBuf(b: Blob): Promise<ArrayBuffer> {
  if (typeof b.arrayBuffer === 'function') return b.arrayBuffer();
  return new Promise((klar, fel) => { const r = new FileReader(); r.onload = () => klar(r.result as ArrayBuffer); r.onerror = () => fel(r.error); r.readAsArrayBuffer(b); });
}

// ── Lager ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Minneslager: tester, och reserv när IndexedDB inte går att öppna (privat läge). Överlever inte att appen stängs. */
export function skapaMinnesLager(): FotoLager {
  const m = new Map<string, VantandeFoto>();
  return {
    async put(f) { m.set(f.nyckel, { ...f }); },
    async get(n) { const f = m.get(n); return f ? { ...f } : null; },
    async alla() { return Array.from(m.values()).map((f) => ({ ...f })); },
    async ta(n) { m.delete(n); },
  };
}

const DB_NAMN = 'skogsystem-foton';
const STORE = 'markering_foto_ko';

/** IndexedDB-lager. Ger null om IndexedDB saknas eller inte går att öppna.
 *  `namn` = egen databas för en annan kö (maskinkollen), så två köer aldrig ser varandras foton. Utan = markeringarnas. */
export async function skapaIndexedDbLager(
  idb: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
  namn: { db: string; store: string } = { db: DB_NAMN, store: STORE },
): Promise<FotoLager | null> {
  if (!idb) return null;
  const STORE = namn.store;
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((klar, fel) => {
      const r = idb.open(namn.db, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'nyckel' }); };
      r.onsuccess = () => klar(r.result);
      r.onerror = () => fel(r.error);
      r.onblocked = () => fel(new Error('blockerad'));
    });
  } catch { return null; }
  const tx = <T,>(lage: IDBTransactionMode, g: (s: IDBObjectStore) => IDBRequest<T>) => new Promise<T>((klar, fel) => {
    const t = db.transaction(STORE, lage);
    const r = g(t.objectStore(STORE));
    t.oncomplete = () => klar(r.result);
    t.onerror = () => fel(t.error);
    t.onabort = () => fel(t.error);
  });
  return {
    put: async (f) => { await tx('readwrite', (s) => s.put(f)); },
    get: async (n) => ((await tx('readonly', (s) => s.get(n))) as VantandeFoto | undefined) ?? null,
    alla: async () => (await tx('readonly', (s) => s.getAll())) as VantandeFoto[],
    ta: async (n) => { await tx('readwrite', (s) => s.delete(n)); },
  };
}
