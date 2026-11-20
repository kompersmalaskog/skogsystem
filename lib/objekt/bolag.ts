// Bolagen (kunderna): vilka som finns, att skapa ett nytt, och vilket bolag en ny beställning/ett nytt objekt FÖRIFYLLS med.
//
// Bolaget avgör vem man är skyldig virke, så det sätts aldrig av en reserv. Det gamla beställningsformuläret lät användaren välja bland bolagen
// från /api/bolag eller skriva ett nytt namn och skapa det (POST /api/bolag) — det är så en ny kund (ATA Timber) kommer in utan kodändring.
// Förifyllning (ärva bolaget från en befintlig post) är tillåtet och visas alltid, men det finns ingen "standardbolag": utan valt bolag går
// ingenting att spara.
import type { ObjektTyp } from './tackning';

export interface Bolag { id: number; namn: string }

/** Jämförelsenyckel: samma bolag oavsett versaler och mellanslag ("Vida " = "vida"). Samma regel som tabellens unika index (lower(namn)). */
export const bolagNyckel = (namn: string | null | undefined): string => (namn ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

async function lasSvar(res: Response): Promise<any> {
  let j: any = null;
  try { j = await res.json(); } catch { /* tomt svar */ }
  if (!res.ok) throw new Error(j?.error ? String(j.error) : `Bolagen kunde inte läsas (${res.status}).`);
  return j;
}

/** Alla bolag. Ett läsfel är ett fel — aldrig en tom lista som ser ut som "inga bolag". */
export async function hamtaBolag(): Promise<Bolag[]> {
  const j = await lasSvar(await fetch('/api/bolag'));
  if (!Array.isArray(j?.bolag)) throw new Error('Bolagen kunde inte läsas (oväntat svar).');
  return (j.bolag as Bolag[]).filter(b => b && typeof b.id === 'number' && typeof b.namn === 'string');
}

/** Skapar ett bolag (finns det redan, med annan versalisering, returneras det befintliga). Kräver admin — annars säger servern det. */
export async function skapaBolag(namn: string): Promise<Bolag> {
  const rent = namn.trim();
  if (!rent) throw new Error('Skriv ett namn.');
  const j = await lasSvar(await fetch('/api/bolag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namn: rent }) }));
  const b = j?.bolag;
  if (!b || typeof b.id !== 'number' || typeof b.namn !== 'string') throw new Error('Bolaget skapades inte (oväntat svar).');
  return b as Bolag;
}

/** Träffarna för en sökning, och om texten är ett NYTT namn (ingen exakt träff) som går att skapa. */
export function sokBolag(alla: readonly Bolag[], q: string): { traffar: Bolag[]; kanSkapa: boolean } {
  const nyckel = bolagNyckel(q);
  const traffar = nyckel ? alla.filter(b => bolagNyckel(b.namn).includes(nyckel)) : [...alla];
  return { traffar, kanSkapa: nyckel !== '' && !alla.some(b => bolagNyckel(b.namn) === nyckel) };
}

interface PostMedBolag { typ: string; bolag: string; bolag_id: number | null }

/**
 * Bolaget en NY post förifylls med: typens befintliga poster den här månaden om de alla är samma bolag, annars månadens alla poster om de är
 * samma bolag, annars inget (två kunder = vi vet inte vilken som menas). Bara förifyllning: raden visar bolaget och det går att byta.
 * Posten måste ha ett riktigt bolag_id (en gammal rad utan det kan inte skrivas vidare på).
 */
export function forifyllBolag(poster: readonly PostMedBolag[], typ: ObjektTyp): Bolag | null {
  const enda = (rader: readonly PostMedBolag[]): Bolag | null => {
    const med = rader.filter(p => p.bolag_id != null);
    if (med.length === 0 || med.length !== rader.length) return null;
    const forsta = med[0];
    return med.every(p => p.bolag_id === forsta.bolag_id) ? { id: forsta.bolag_id!, namn: forsta.bolag } : null;
  };
  return enda(poster.filter(p => p.typ === typ)) ?? enda(poster);
}
