import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lasStamplingsrapport, byggAnrop, kontrolleraPdf, LasFel, STANDARD_MODELL, MAX_BYTES, type KlientLike } from './las';
import { UTDATA_SCHEMA, parsaLasning } from './rapport';
import { kontrollera } from './kontroll';

// AI-anropet testas med en FEJKAD klient: det här bevisar plumbingen (vad som skickas, hur svaret tolkas, hur fel
// hanteras) — inte att Claude läser en riktig rapport rätt. Det kräver ANTHROPIC_API_KEY: kör
// `npx tsx scripts/las-stamplingsrapport.ts <pdf>` för en skarp läsning.
const fixtur = (fil: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', fil), 'utf-8'));
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 1, 2, 3]);   // "%PDF-1.7\n…"

const klient = (svar: any): KlientLike & { create: ReturnType<typeof vi.fn> } => {
  const create = vi.fn(async () => svar);
  return { messages: { create }, create };
};
// Strukturerade utdata: JSON i ett textblock (inte ett tool_use-block)
const jsonSvar = (obj: unknown) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }], usage: { input_tokens: 12000, output_tokens: 1800 } });

afterEach(() => { vi.unstubAllEnvs(); });

describe('anropet', () => {
  it('skickar PDF:en som dokument och ber om strukturerade utdata — inget tvingat verktygsval (nekas av claude-opus-5-5 med 400)', () => {
    const a = byggAnrop(PDF, 'm') as any;
    expect(a.output_config).toEqual({ format: { type: 'json_schema', schema: UTDATA_SCHEMA } });
    expect(a).not.toHaveProperty('tool_choice');
    expect(a).not.toHaveProperty('tools');
    const [dok, instr] = a.messages[0].content as any[];
    expect(dok).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } });
    expect(Buffer.from(dok.source.data, 'base64').equals(Buffer.from(PDF))).toBe(true);
    expect(instr.text).toMatch(/DU LÄSER — DU RÄKNAR INTE/);
    expect(instr.text).toMatch(/aldrig justera en siffra/i);
  });
  it('använder stark standardmodell, och STAMPLING_LAS_MODEL om den är satt', async () => {
    const k = klient(jsonSvar(fixtur('jeppshoka.json')));
    await lasStamplingsrapport(PDF, { klient: k });
    expect(k.create.mock.calls[0][0].model).toBe(STANDARD_MODELL);
    vi.stubEnv('STAMPLING_LAS_MODEL', 'annan-modell');
    await lasStamplingsrapport(PDF, { klient: k });
    expect(k.create.mock.calls[1][0].model).toBe('annan-modell');
  });
});

describe('svaret', () => {
  it('Jeppshoka-läsningen tolkas och klarar kontrollen', async () => {
    const r = await lasStamplingsrapport(PDF, { klient: klient(jsonSvar(fixtur('jeppshoka.json'))) });
    expect(r.lasning.tradslag.map(t => t.namn)).toEqual(['Tall', 'Gran', 'Övrigt barr']);
    expect(r.tokens).toEqual({ in: 12000, ut: 1800 });
    expect(kontrollera(r.lasning).klart).toBe(true);
  });
  it('Bågskyttebanan-läsningen tolkas och klarar kontrollen, torra träd utanför', async () => {
    const r = await lasStamplingsrapport(PDF, { klient: klient(jsonSvar(fixtur('bagskyttebanan.json'))) });
    const k = kontrollera(r.lasning);
    expect(k.klart).toBe(true); expect(k.ejIModellen).toHaveLength(1);
  });
  it('en felläsning från AI:n går igenom tolkningen men stoppas av kontrollen', async () => {
    const f = fixtur('jeppshoka.json');
    f.tradslag[1].klasser[5].antal += 3;
    const r = await lasStamplingsrapport(PDF, { klient: klient(jsonSvar(f)) });
    expect(kontrollera(r.lasning).klart).toBe(false);
  });
  it('svar utan registrerad rapport är ett fel — aldrig ett tyst tomt resultat', async () => {
    await expect(lasStamplingsrapport(PDF, { klient: klient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Här är rapporten …' }] }) })).rejects.toMatchObject({ kod: 'otolkbart', message: expect.stringMatching(/giltig JSON/) });
    await expect(lasStamplingsrapport(PDF, { klient: klient({ stop_reason: 'end_turn', content: [] }) })).rejects.toMatchObject({ kod: 'otolkbart' });
    await expect(lasStamplingsrapport(PDF, { klient: klient(jsonSvar({ post: {}, tradslag: [] })) })).rejects.toMatchObject({ kod: 'otolkbart' });
  });
  it('JSON i flera textblock och tankeblock före svaret hanteras; en avvisning (refusal) är ett fel', async () => {
    const delar = JSON.stringify(fixtur('jeppshoka.json'));
    const k = klient({ stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text: delar.slice(0, 500) }, { type: 'text', text: delar.slice(500) }] });
    expect(kontrollera((await lasStamplingsrapport(PDF, { klient: k })).lasning).klart).toBe(true);
    await expect(lasStamplingsrapport(PDF, { klient: klient({ stop_reason: 'refusal', content: [] }) })).rejects.toMatchObject({ kod: 'otolkbart', message: expect.stringMatching(/avböjde/) });
  });
  it('ett avkapat svar (max_tokens) är ett fel som säger vad man gör', async () => {
    const k = klient({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"tradslag":[' }] });
    await expect(lasStamplingsrapport(PDF, { klient: k })).rejects.toMatchObject({ kod: 'avkapat', message: expect.stringMatching(/Mata in för hand/) });
  });
  it('API-fel blir LasFel med orsaken, inte en rå stacktrace', async () => {
    const create = vi.fn(async () => { throw new Error('529 overloaded'); });
    await expect(lasStamplingsrapport(PDF, { klient: { messages: { create } } })).rejects.toMatchObject({ kod: 'ai_fel', message: expect.stringMatching(/529 overloaded/) });
  });
});

describe('innan något skickas', () => {
  it('saknas nyckeln säger det rakt ut — och inget anrop görs', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(lasStamplingsrapport(PDF)).rejects.toMatchObject({ kod: 'ingen_nyckel', message: expect.stringMatching(/ANTHROPIC_API_KEY saknas/) });
  });
  it('filen måste vara en PDF och rymmas i ett anrop', () => {
    expect(() => kontrolleraPdf(new Uint8Array([1, 2, 3, 4, 5, 6]))).toThrowError(LasFel);
    expect(() => kontrolleraPdf(new Uint8Array(MAX_BYTES + 1))).toThrowError(/största tillåtna/);
    expect(() => kontrolleraPdf(PDF)).not.toThrow();
  });
});

// Modellens EGEN utdata från den första skarpa läsningen (claude-opus-5-5, 2026-10-04, scripts/las-stamplingsrapport.ts):
// bevisar att riktigt svar tolkas, klarar kontrollen och har exakt samma rader som facit — inte bara att fixturerna gör det.
describe('riktiga läsningar (claude-opus-5-5, 2026-10-04)', () => {
  it.each(['jeppshoka', 'bagskyttebanan'])('%s: modellens utdata klarar kontrollen och har samma rader som facit', async (namn) => {
    const r = await lasStamplingsrapport(PDF, { klient: klient(jsonSvar(fixtur(`${namn}_live.json`))) });
    expect(kontrollera(r.lasning).klart).toBe(true);
    const rader = (l: any) => l.tradslag.map((t: any) => [t.namn, t.klasser.map((c: any) => [c.diameter_cm, c.antal, c.volym_m3sk])]);
    expect(rader(r.lasning)).toEqual(rader(parsaLasning(fixtur(`${namn}.json`)).lasning));
  });
});
