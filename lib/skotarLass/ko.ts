// Lokal kö för skotarens lass: allt sparas på enheten FÖRST (IndexedDB, reserv: minne) och skickas när nätet finns.
// Föraren ser aldrig ett fel för att täckningen saknas — ett lass är "sparat" när det ligger i lagret, inte när servern svarat.
//
// Samma tanke som markeringssynken (lib/markeringSynk.ts): en post per lass, den senaste ändringen vinner lokalt, och serverns version
// skriver aldrig över en lokal ändring som inte hunnit skickas. Ren logik med injicerade beroenden (testad); kopplingen till Supabase
// ligger i ./koKopplad.
import type { Lass } from './typer';

export interface LassPost {
  id: string;
  objektId: string;
  lass: Lass;
  /** `andrad` som servern bekräftat. Skiljer den sig från lass.andrad väntar en ändring på att skickas. */
  skickadAndrad: string | null;
}

export interface AvslutPost {
  objektId: string;
  /** När föraren tryckte Färdigskotad. */
  begard: string;
  skickad: boolean;
  /** Opti-lassens volym före appens start per skördarens sortiment (m³), uträknad när föraren tryckte — skickas med till servern. Saknas på äldre poster (= ingen Opti). */
  opti?: Record<string, number>;
}

export interface KoLager {
  allaLass(): Promise<LassPost[]>;
  putLass(p: LassPost): Promise<void>;
  alltAvslut(): Promise<AvslutPost[]>;
  putAvslut(p: AvslutPost): Promise<void>;
}

export const vantar = (p: LassPost): boolean => p.skickadAndrad !== p.lass.andrad;

export function skapaMinnesKoLager(): KoLager {
  const lass = new Map<string, LassPost>();
  const avslut = new Map<string, AvslutPost>();
  return {
    allaLass: async () => Array.from(lass.values()).map((p) => structuredCloneSafe(p)),
    putLass: async (p) => { lass.set(p.id, structuredCloneSafe(p)); },
    alltAvslut: async () => Array.from(avslut.values()).map((p) => ({ ...p })),
    putAvslut: async (p) => { avslut.set(p.objektId, { ...p }); },
  };
}

const structuredCloneSafe = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const DB_NAMN = 'skogsystem-skotarlass';
const STORE_LASS = 'lass';
const STORE_AVSLUT = 'avslut';

export async function skapaIndexedDbKoLager(idb: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): Promise<KoLager | null> {
  if (!idb) return null;
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((klar, fel) => {
      const r = idb.open(DB_NAMN, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE_LASS)) r.result.createObjectStore(STORE_LASS, { keyPath: 'id' });
        if (!r.result.objectStoreNames.contains(STORE_AVSLUT)) r.result.createObjectStore(STORE_AVSLUT, { keyPath: 'objektId' });
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
    allaLass: async () => (await tx(STORE_LASS, 'readonly', (s) => s.getAll())) as LassPost[],
    putLass: async (p) => { await tx(STORE_LASS, 'readwrite', (s) => s.put(p)); },
    alltAvslut: async () => (await tx(STORE_AVSLUT, 'readonly', (s) => s.getAll())) as AvslutPost[],
    putAvslut: async (p) => { await tx(STORE_AVSLUT, 'readwrite', (s) => s.put(p)); },
  };
}

export interface KoBeroenden {
  lager: KoLager;
  /** Skickar ett lass. true = servern har det (eller har ett nyare — då är vårt inte längre aktuellt att skicka). */
  skickaLass: (l: Lass) => Promise<boolean>;
  /** Kör Färdigskotad på servern (med Opti-volymen som drogs av). true = klart. */
  skickaAvslut: (objektId: string, opti: Record<string, number>) => Promise<boolean>;
  paForandring?: () => void;
}

export interface SkotarLassKo {
  /** Sparar lasset lokalt (beständigt) — resolvar när det ligger i lagret. Kastar aldrig för saknad täckning. */
  spara(lass: Lass): Promise<void>;
  /** Alla lass (lokala + senast hämtade från servern) för trakten, struket borträknat inte — filtrera efter behov. */
  lassForObjekt(objektId: string): Promise<Lass[]>;
  /** Lägger in lass hämtade från servern. Ett lass med en lokal, oskickad ändring rörs aldrig. */
  tagEmotServer(serverLass: Lass[]): Promise<void>;
  /** Begär Färdigskotad. Skickas efter att trakten lass skickats. */
  begarAvslut(objektId: string, nu: string, opti?: Record<string, number>): Promise<void>;
  avslutSkickat(objektId: string): Promise<boolean>;
  antalVantande(): Promise<number>;
  /** Ett varv: lass först, sedan avslut. Stannar vid första felet (ingen täckning) — nästa varv försöker igen. */
  kor(): Promise<{ skickade: number; kvar: number }>;
}

export function skapaLassKo(b: KoBeroenden): SkotarLassKo {
  const meddela = () => { try { b.paForandring?.(); } catch { /* */ } };
  let kor_pagar: Promise<{ skickade: number; kvar: number }> | null = null;

  async function spara(lass: Lass): Promise<void> {
    const alla = await b.lager.allaLass();
    const finns = alla.find((p) => p.id === lass.id);
    await b.lager.putLass({ id: lass.id, objektId: lass.objektId, lass, skickadAndrad: finns?.skickadAndrad ?? null });
    meddela();
  }

  async function lassForObjekt(objektId: string): Promise<Lass[]> {
    return (await b.lager.allaLass()).filter((p) => p.objektId === objektId).map((p) => p.lass).sort((x, y) => x.lassNummer - y.lassNummer || x.skapad.localeCompare(y.skapad));
  }

  async function tagEmotServer(serverLass: Lass[]): Promise<void> {
    if (serverLass.length === 0) return;
    const lokala = new Map((await b.lager.allaLass()).map((p) => [p.id, p]));
    for (const s of serverLass) {
      const l = lokala.get(s.id);
      if (l && (vantar(l) || l.lass.andrad >= s.andrad)) continue;   // lokalt nyare eller oskickat: serverns version släpps
      await b.lager.putLass({ id: s.id, objektId: s.objektId, lass: s, skickadAndrad: s.andrad });
    }
    meddela();
  }

  async function begarAvslut(objektId: string, nu: string, opti: Record<string, number> = {}): Promise<void> {
    await b.lager.putAvslut({ objektId, begard: nu, skickad: false, opti });
    meddela();
    // Färdigskotad räknar på serverns lass: lassen först (kor() skickar dem före avslutet).
  }

  async function avslutSkickat(objektId: string): Promise<boolean> {
    return (await b.lager.alltAvslut()).some((a) => a.objektId === objektId && a.skickad);
  }

  async function antalVantande(): Promise<number> {
    const lass = (await b.lager.allaLass()).filter(vantar).length;
    const avslut = (await b.lager.alltAvslut()).filter((a) => !a.skickad).length;
    return lass + avslut;
  }

  async function varv(): Promise<{ skickade: number; kvar: number }> {
    let skickade = 0;
    try {
      const vantande = (await b.lager.allaLass()).filter(vantar).sort((x, y) => x.lass.skapad.localeCompare(y.lass.skapad));
      for (const p of vantande) {
        const skickat = p.lass.andrad;
        let ok = false;
        try { ok = await b.skickaLass(p.lass); } catch { ok = false; }
        if (!ok) return { skickade, kvar: await antalVantande() };
        // Ändrades lasset medan vi skickade ligger den nyare versionen kvar som oskickad.
        const nu = (await b.lager.allaLass()).find((x) => x.id === p.id);
        if (nu) await b.lager.putLass({ ...nu, skickadAndrad: skickat });
        skickade += 1;
      }
      for (const a of (await b.lager.alltAvslut()).filter((x) => !x.skickad)) {
        // Avslutet kräver att trakten alla lass nått servern.
        const kvarLass = (await b.lager.allaLass()).some((x) => x.objektId === a.objektId && vantar(x));
        if (kvarLass) continue;
        let ok = false;
        try { ok = await b.skickaAvslut(a.objektId, a.opti ?? {}); } catch { ok = false; }
        if (!ok) return { skickade, kvar: await antalVantande() };
        await b.lager.putAvslut({ ...a, skickad: true });
        skickade += 1;
      }
    } finally {
      meddela();
    }
    return { skickade, kvar: await antalVantande() };
  }

  return {
    spara, lassForObjekt, tagEmotServer, begarAvslut, avslutSkickat, antalVantande,
    // Ett varv i taget i denna flik: ett anrop medan ett pågår får det pågåendes resultat.
    kor: () => (kor_pagar ??= varv().finally(() => { kor_pagar = null; })),
  };
}
