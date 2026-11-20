// "Kommer en ambulans hit?" — larmplatserna kontrolleras av den som står där (Martin 2026-11-10).
//
// Skotaren står vid avläggen flera gånger om dagen, och Vida lägger en larmplats vid varje avlägg (lib/larmpunkter). När någon
// — förare i maskinen eller planeraren ute med telefonen — står vid en larmplats som ingen bekräftat frågar appen en gång:
// Ja = kontrollerad (vem och när), Nej = med en kort rad om varför; planeraren får en push (lib/larmKontrollNotis).
//
// En kontroll gäller en PUNKT, inte ett objekt: tabellen larmplats_kontroll har objekt + koordinaten, och en kontroll inom 50 m
// gäller punkten (samma regel som att två larmpunkter inom 50 m är samma, `SAMMA_PUNKT_M`). Senaste svaret gäller. Ren logik.
import { avstandPunktM } from './larm/geo';
import { SAMMA_PUNKT_M, type Larmpunkt } from './larmpunkter';

/** Så nära en larmplats man ska stå för att få frågan. */
export const VID_LARMPLATS_M = 50;

export interface LarmKontrollRad {
  id: string;
  lat: number;
  lng: number;
  svar: 'ja' | 'nej';
  kommentar: string | null;
  /** Förnamn eller namn på den som svarade (kan saknas om namnet inte gick att läsa). */
  vem: string | null;
  skapadAt: string;
}

const ll = (p: { lat: number; lng: number }) => ({ lat: p.lat, lon: p.lng });

/** Nyckel för en punkt: koordinaten på ~1 m. Används för "Inte nu" på enheten. */
export const punktNyckel = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

/** Senaste svaret för punkten (inom 50 m), eller null om ingen svarat. */
export function kontrollFor(p: { lat: number; lng: number }, rader: readonly LarmKontrollRad[]): LarmKontrollRad | null {
  let bast: LarmKontrollRad | null = null;
  for (const r of rader) {
    if (avstandPunktM(ll(p), ll(r)) >= SAMMA_PUNKT_M) continue;
    if (!bast || Date.parse(r.skapadAt) > Date.parse(bast.skapadAt)) bast = r;
  }
  return bast;
}

/**
 * Vilken larmplats appen ska fråga om just nu: den närmaste inom 50 m med en FÄRSK position, som ingen svarat Ja på senast och
 * som man inte redan tryckt bort/svarat på på den här enheten. null = ingen fråga. Läsfel på kontrollerna = ingen fråga
 * (`rader` null): hellre ingen fråga än att fråga om något som redan är bekräftat.
 */
export function fragaOm(
  punkter: readonly Larmpunkt[],
  rader: readonly LarmKontrollRad[] | null,
  pos: { lat: number; lng: number } | null,
  posFarsk: boolean,
  avfardade: ReadonlySet<string>,
): Larmpunkt | null {
  if (!rader || !pos || !posFarsk) return null;
  let bast: Larmpunkt | null = null; let bastM = Infinity;
  for (const p of punkter) {
    if (avfardade.has(punktNyckel(p))) continue;
    if (kontrollFor(p, rader)?.svar === 'ja') continue;
    const m = avstandPunktM(ll(pos), ll(p));
    if (m <= VID_LARMPLATS_M && m < bastM) { bast = p; bastM = m; }
  }
  return bast;
}

function datumKort(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' }).replace('.', '');
}

/** Raden under larmplatsen: "Ambulansen kommer fram · Daniel 12 nov" / "Ambulansen kommer inte fram: bommen är låst · Daniel 12 nov". */
export function kontrollText(k: LarmKontrollRad | null): { text: string; ton: 'gron' | 'orange' } | null {
  if (!k) return null;
  const vemNar = [k.vem, datumKort(k.skapadAt)].filter(Boolean).join(' ');
  if (k.svar === 'ja') return { text: `Ambulansen kommer fram${vemNar ? ` · ${vemNar}` : ''}`, ton: 'gron' };
  const varfor = k.kommentar?.trim();
  return { text: `Ambulansen kommer inte fram${varfor ? `: ${varfor}` : ''}${vemNar ? ` · ${vemNar}` : ''}`, ton: 'orange' };
}
