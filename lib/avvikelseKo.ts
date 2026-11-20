// Kön för avvikelser: fotot och raden sparas LOKALT direkt och skickas när nätet finns — en avvikelse tagen utan täckning får aldrig
// försvinna (samma lärdom som markeringsfotona, lib/fotoKo.ts). Logiken är fotokön (ladda upp, sedan "patcha" = skriv raden), med en egen
// IndexedDB-databas så att köerna aldrig ser varandras foton.
//
// Idempotent hela vägen: avvikelsens id skapas i appen. Fotot laddas upp utan överskrivning (finns det redan är det samma foto — dess
// SHA-256 står på raden), raden skrivs med INSERT och 23505 (finns redan) räknas som klart. Servern sätter fotograf, tid och körspår.

import { supabase } from '@/lib/supabase';
import { skapaFotoKo, skapaIndexedDbLager, skapaMinnesLager, type FotoKo, type FotoLager, type PatchSvar, type VantandeFoto } from './fotoKo';
import { AVVIKELSE_BUCKET, avvikelseSokvag, sha256Hex, type AvvikelseTyp, type KorsparFore } from './avvikelse';

/** Det som skrivs till tabellen `avvikelse` (servern lägger till skapad_at, skapad_av och korspar_fore). */
export interface AvvikelseRadIn {
  id: string;
  objekt_id: string;
  typ: AvvikelseTyp;
  kommentar: string | null;
  lat: number;
  lng: number;
  noggrannhet_m: number | null;
  foto_sokvag: string;
  foto_sha256: string;
  tagen_at: string;
}

/** En rad som den lästs ur databasen. */
export interface AvvikelseRad extends AvvikelseRadIn {
  skapad_at: string;
  skapad_av: string;
  korspar_fore: KorsparFore;
}

/** En post i kön: fotot (fotoköns fält) + raden. */
interface AvvikelsePost extends VantandeFoto { rad: AvvikelseRadIn }

export const AVVIKELSE_SPARAD_EVENT = 'avvikelse-sparad';

const lyssnare = new Set<() => void>();
export function prenumereraAvvikelseKo(fn: () => void): () => void { lyssnare.add(fn); return () => { lyssnare.delete(fn); }; }
const meddela = () => lyssnare.forEach((fn) => { try { fn(); } catch { /* */ } });

/** Bygger kön. `db` och `idb` kommer in utifrån så att testerna kör den mot en låtsasdatabas. */
export function skapaAvvikelseKo(d: {
  lager: FotoLager;
  ladda: (sokvag: string, blob: Blob) => Promise<void>;
  skriv: (rad: AvvikelseRadIn) => Promise<{ svar: PatchSvar; rad?: AvvikelseRad }>;
  paSparad?: (rad: AvvikelseRad) => void;
  nu?: () => number;
}) {
  const ko: FotoKo = skapaFotoKo({
    lager: d.lager,
    ladda: d.ladda,
    nu: d.nu,
    paForandring: meddela,
    patcha: async (f) => {
      const post = (await d.lager.get(`${f.objektId}/${f.markerId}`)) as AvvikelsePost | null;
      if (!post?.rad) return 'ok';   // posten är borta: inget kvar att skriva
      const { svar, rad } = await d.skriv(post.rad);
      if (svar === 'ok' && rad) { try { d.paSparad?.(rad); } catch { /* */ } }
      return svar;
    },
  });

  async function laggTill(rad: AvvikelseRadIn, foto: Blob): Promise<void> {
    // EN skrivning med fotot OCH raden — en kö som råkar gå mellan två skrivningar får aldrig se ett foto utan rad.
    const post: AvvikelsePost = {
      nyckel: `${rad.objekt_id}/${rad.id}`, objektId: rad.objekt_id, markerId: rad.id, sokvag: rad.foto_sokvag,
      buf: await foto.arrayBuffer(), typ: foto.type || 'image/jpeg', skapad: (d.nu ?? Date.now)(), forsok: 0, nastaForsok: 0,
      uppladdad: false, saknadSedan: null, rad,
    };
    await d.lager.put(post);
    meddela();
  }

  async function vantande(objektId: string): Promise<{ rad: AvvikelseRadIn; skapad: number }[]> {
    return ((await ko.vantande()) as AvvikelsePost[]).filter((p) => p.objektId === objektId && p.rad).map((p) => ({ rad: p.rad, skapad: p.skapad }));
  }

  return { laggTill, vantande, kor: ko.kor, lokaltFoto: ko.lokaltFoto };
}

/** Bygger raden ur ett taget foto. Fotots SHA-256 räknas på exakt de bytes som laddas upp. */
export async function byggAvvikelse(p: {
  id: string; objektId: string; typ: AvvikelseTyp; kommentar: string; lat: number; lng: number; noggrannhetM: number | null; tagen: Date; foto: Blob;
}): Promise<AvvikelseRadIn> {
  const buf = await p.foto.arrayBuffer();
  return {
    id: p.id,
    objekt_id: p.objektId,
    typ: p.typ,
    kommentar: p.kommentar.trim() ? p.kommentar.trim().slice(0, 1000) : null,
    lat: p.lat,
    lng: p.lng,
    noggrannhet_m: p.noggrannhetM != null && Number.isFinite(p.noggrannhetM) ? Math.round(p.noggrannhetM) : null,
    foto_sokvag: avvikelseSokvag(p.objektId, p.id),
    foto_sha256: await sha256Hex(buf),
    tagen_at: p.tagen.toISOString(),
  };
}

// ── Kopplad till appen ────────────────────────────────────────────────────────────────────────────────────────────────

const VALJ = 'id, objekt_id, typ, kommentar, lat, lng, noggrannhet_m, foto_sokvag, foto_sha256, tagen_at, skapad_at, skapad_av, korspar_fore';

async function skrivRad(rad: AvvikelseRadIn): Promise<{ svar: PatchSvar; rad?: AvvikelseRad }> {
  const { data, error } = await supabase.from('avvikelse').insert(rad).select(VALJ).maybeSingle();
  if (!error && data) return { svar: 'ok', rad: data as AvvikelseRad };
  if (error?.code === '23505') {
    const { data: fanns } = await supabase.from('avvikelse').select(VALJ).eq('id', rad.id).maybeSingle();
    return { svar: 'ok', rad: (fanns as AvvikelseRad) ?? undefined };
  }
  return { svar: 'fel' };
}

async function laddaFoto(sokvag: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from(AVVIKELSE_BUCKET).upload(sokvag, blob, { contentType: 'image/jpeg', upsert: false });
  if (!error) return;
  // Finns redan = ett tidigare försök kom fram (samma id, samma foto). Allt annat försöker kön igen.
  const s = `${(error as any).statusCode ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (s.includes('409') || s.includes('exists') || s.includes('duplicate')) return;
  throw new Error(error.message);
}

let kon: Promise<ReturnType<typeof skapaAvvikelseKo>> | null = null;
function hamtaKo() {
  if (!kon) {
    kon = (async () => {
      const lager = (await skapaIndexedDbLager(undefined, { db: 'skogsystem-avvikelser', store: 'avvikelse_ko' })) ?? skapaMinnesLager();
      return skapaAvvikelseKo({
        lager,
        ladda: laddaFoto,
        skriv: skrivRad,
        paSparad: (rad) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<AvvikelseRad>(AVVIKELSE_SPARAD_EVENT, { detail: rad })); },
      });
    })();
  }
  return kon;
}

export async function laggAvvikelseIKo(rad: AvvikelseRadIn, foto: Blob): Promise<void> {
  const ko = await hamtaKo();
  await ko.laggTill(rad, foto);
  void korAvvikelseKo(true);
}

export async function vantandeAvvikelser(objektId: string) { return (await hamtaKo()).vantande(objektId); }
export async function lokaltAvvikelseFoto(objektId: string, id: string) { return (await hamtaKo()).lokaltFoto(objektId, id); }

export async function korAvvikelseKo(tvinga = false): Promise<void> {
  try {
    const ko = await hamtaKo();
    const nav: any = typeof navigator === 'undefined' ? null : navigator;
    if (nav?.locks?.request) await nav.locks.request('avvikelse-ko', { ifAvailable: true }, async (lock: unknown) => { if (lock) await ko.kor(tvinga); });
    else await ko.kor(tvinga);
  } catch { /* nästa trigger försöker igen */ }
}

/** Startar triggers: nu, när nätet kommer tillbaka, när appen blir synlig och var 30:e sekund. Anropas EN gång (global startare). */
export function startaAvvikelseKoTriggers(): () => void {
  if (typeof window === 'undefined') return () => {};
  const online = () => { void korAvvikelseKo(true); };
  const synlig = () => { if (document.visibilityState === 'visible') void korAvvikelseKo(true); };
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) void korAvvikelseKo(false); };
  window.addEventListener('online', online);
  document.addEventListener('visibilitychange', synlig);
  const iv = window.setInterval(tick, 30_000);
  void korAvvikelseKo(true);
  return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', synlig); window.clearInterval(iv); };
}

/** Avvikelserna på ett objekt ur databasen. Ett läsfel kastar (aldrig en tom lista som ser ut som "inga avvikelser"). */
export async function hamtaAvvikelser(objektId: string): Promise<AvvikelseRad[]> {
  const { data, error } = await supabase.from('avvikelse').select(VALJ).eq('objekt_id', objektId).order('tagen_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AvvikelseRad[];
}

export async function avvikelseFotoUrl(sokvag: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(AVVIKELSE_BUCKET).createSignedUrl(sokvag, 600);
  return error ? null : data?.signedUrl ?? null;
}
