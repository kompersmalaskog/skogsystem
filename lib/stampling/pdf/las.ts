// STÄMPLINGSRAPPORT → JSON via Claude. Bara serversidan (nyckeln får aldrig nå webbläsaren).
//
// PDF:en skickas som DOKUMENT till Messages API — samma anrop läser textlager och inskannade sidor (modellen ser
// sidbilderna). Svaret tvingas genom verktyget registrera_stamplingsrapport (rapport.ts), så vi får JSON enligt schemat
// i stället för löpande text. AI:n läser bara; kontrollen (kontroll.ts) är vanlig kod och körs av anroparen.
//
// Nyckeln: ANTHROPIC_API_KEY. Modellen: STAMPLING_LAS_MODEL, annars STANDARD_MODELL. Saknas nyckeln kastas LasFel
// 'ingen_nyckel' — rutten svarar då ärligt att läsningen inte är påslagen, och inmatning för hand finns kvar.

import Anthropic from '@anthropic-ai/sdk';
import { PROMPT, VERKTYG, VERKTYG_NAMN, parsaLasning, type Lasning } from './rapport';

/** Stark modell: att läsa siffror i inskannade tabeller är det enda stället där ett billigare val kostar tillförlitlighet. */
export const STANDARD_MODELL = 'claude-opus-5-5';
/** Messages API tar 32 MB per anrop; base64 lägger på en tredjedel. */
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_SVAR_TOKENS = 16000;
const TIDSGRANS_MS = 280_000;

export type LasKod = 'ingen_nyckel' | 'for_stor' | 'inte_pdf' | 'ai_fel' | 'avkapat' | 'otolkbart';
export class LasFel extends Error {
  constructor(public kod: LasKod, message: string) { super(message); this.name = 'LasFel'; }
}

/** Den del av SDK:t vi använder — så att testerna kan ge en fejkad klient. */
export type KlientLike = { messages: { create: (args: any, opt?: any) => Promise<any> } };

export type LasSvar = { lasning: Lasning; varningar: string[]; modell: string; tokens: { in: number; ut: number } | null };

export function kontrolleraPdf(pdf: Uint8Array): void {
  if (pdf.byteLength > MAX_BYTES) throw new LasFel('for_stor', `Filen är ${(pdf.byteLength / 1048576).toFixed(1).replace('.', ',')} MB — största tillåtna är ${MAX_BYTES / 1048576} MB.`);
  const huvud = String.fromCharCode(...Array.from(pdf.slice(0, 5)));
  if (!huvud.startsWith('%PDF')) throw new LasFel('inte_pdf', 'Filen är inte en PDF.');
}

/** Bygger anropet. Utbrutet så att testerna kan titta på exakt vad som skickas. */
export function byggAnrop(pdf: Uint8Array, modell: string) {
  return {
    model: modell,
    max_tokens: MAX_SVAR_TOKENS,
    tools: [VERKTYG],
    tool_choice: { type: 'tool', name: VERKTYG_NAMN },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(pdf).toString('base64') } },
        { type: 'text', text: PROMPT },
      ],
    }],
  };
}

export async function lasStamplingsrapport(pdf: Uint8Array, opt: { klient?: KlientLike; modell?: string } = {}): Promise<LasSvar> {
  kontrolleraPdf(pdf);
  const modell = opt.modell ?? process.env.STAMPLING_LAS_MODEL ?? STANDARD_MODELL;
  let klient = opt.klient;
  if (!klient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new LasFel('ingen_nyckel', 'Läsningen med AI är inte påslagen (ANTHROPIC_API_KEY saknas på servern).');
    klient = new Anthropic({ apiKey }) as unknown as KlientLike;
  }

  let svar: any;
  try {
    svar = await klient.messages.create(byggAnrop(pdf, modell), { timeout: TIDSGRANS_MS });
  } catch (e: any) {
    throw new LasFel('ai_fel', `Anropet till AI:n misslyckades: ${e?.message ?? String(e)}`);
  }
  if (svar?.stop_reason === 'max_tokens') throw new LasFel('avkapat', 'AI:ns svar blev för långt och kapades — rapporten har fler rader än en läsning rymmer. Mata in för hand.');
  const block = (svar?.content ?? []).find((b: any) => b?.type === 'tool_use' && b?.name === VERKTYG_NAMN);
  if (!block) throw new LasFel('otolkbart', 'AI:n svarade inte med en registrerad rapport.');
  let tolkat;
  try { tolkat = parsaLasning(block.input); } catch (e: any) { throw new LasFel('otolkbart', e?.message ?? 'Svaret gick inte att tolka.'); }
  const u = svar?.usage;
  return { lasning: tolkat.lasning, varningar: tolkat.varningar, modell, tokens: u ? { in: Number(u.input_tokens) || 0, ut: Number(u.output_tokens) || 0 } : null };
}
