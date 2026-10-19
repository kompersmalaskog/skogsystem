import { describe, expect, it } from 'vitest';
import { byggLassNotis, kortNamn, lassFraga, lassNotisText, LASS_MASKIN, LASS_MAX_ALDER_MS, valjMottagare, type LassNotisRad } from './notis';

const MARTIN = { id: 'm', epost: 'martin.lindqvist@kompersmalaskog.com' };
const JOACIM = { id: 'j', epost: 'joacim.ringberg@kompersmalaskog.com' };
const BADA = [MARTIN, JOACIM];
const RUNDA = '2026-10-12T04:00:00Z';

describe('notis till RÄTT person', () => {
  it('den som var inne i appen under rundan får frågan, den andra inte', () => {
    const n = new Map<string, string | null>([['m', '2026-10-12T09:30:00Z'], ['j', '2026-10-11T08:00:00Z']]);
    expect(valjMottagare(BADA, n, RUNDA)).toEqual([MARTIN]);
    const o = new Map<string, string | null>([['m', '2026-10-10T09:30:00Z'], ['j', '2026-10-12T05:00:00Z']]);
    expect(valjMottagare(BADA, o, RUNDA)).toEqual([JOACIM]);
  });
  it('ingen har varit inne → båda', () => {
    const n = new Map<string, string | null>([['m', '2026-10-01T09:30:00Z'], ['j', null]]);
    expect(valjMottagare(BADA, n, RUNDA)).toEqual(BADA);
  });
  it('okänd närvaro (kolumnen saknas eller inga enheter) → båda', () => {
    expect(valjMottagare(BADA, new Map(), RUNDA)).toEqual(BADA);
  });
  it('båda var inne → båda', () => {
    const n = new Map<string, string | null>([['m', '2026-10-12T09:30:00Z'], ['j', '2026-10-12T10:00:00Z']]);
    expect(valjMottagare(BADA, n, RUNDA)).toEqual(BADA);
  });
  it('ett ogiltigt rundstart ger båda hellre än ingen', () => {
    expect(valjMottagare(BADA, new Map([['m', '2026-10-12T09:30:00Z']]), 'inte-en-tid')).toEqual(BADA);
  });
});

const RAD: LassNotisRad = {
  id: 'l1', status: 'vantar_maskin', status_orsak: 'sakerhet', fran_namn: 'Östra-Hoka 1:7', till_namn: 'Bågskyttebanan RP',
  lassning_tid: '2026-10-12T10:23:00Z', lossning_tid: '2026-10-12T11:46:00Z', forslag_maskin_namn: 'Elefant 26',
};
const finns = (rad: LassNotisRad | null, fel?: string) => async () => ({ rad, fel });
const NOTIS = { typ: LASS_MASKIN, payload: { lass_id: 'l1' }, skapad_at: '2026-10-12T12:00:00Z' };
const NU = Date.parse('2026-10-12T14:00:00Z');

describe('texten: "Vilken maskin? Lass [från] [tid] → [till] [tid]"', () => {
  it('svensk klocktid (sommartid +2) och kort platsnamn', () => {
    expect(lassNotisText(RAD)).toBe('Vilken maskin? Lass Östra-Hoka 1:7 12:23 → Bågskyttebanan RP 13:46');
  });
  it('saknas bara kunden är frågan en annan', () => {
    expect(lassFraga('kund_saknas')).toBe('Vilken kund?');
    expect(lassNotisText({ ...RAD, status_orsak: 'kund_saknas' })).toMatch(/^Vilken kund\? Lass/);
  });
  it('en lång trakt kortas, en saknad plats blir "okänd plats" — aldrig tom text', () => {
    expect(kortNamn('Mycket lång trakt med fastighetsbeteckning 1:23 Södra Skogen').length).toBeLessThanOrEqual(28);
    expect(kortNamn(null)).toBe('okänd plats');
  });
  it('länken öppnar sheeten på just det lasset', async () => {
    const u = await byggLassNotis(NOTIS, finns(RAD), NU);
    expect(u).toMatchObject({ typ: 'skicka', meddelande: { title: 'Lastbilen', url: '/lastbil?lass=l1', tag: 'lass-maskin-l1' } });
  });
});

describe('när notisen INTE skickas', () => {
  it('lasset är redan besvarat (den andra admin hann före) → hoppas över', async () => {
    for (const status of ['auto_flytt', 'matchad_manuell', 'avvisad']) {
      const u = await byggLassNotis(NOTIS, finns({ ...RAD, status }), NU);
      expect(u, status).toMatchObject({ typ: 'hoppa_over' });
    }
  });
  it('lasset finns inte längre → hoppas över', async () => {
    expect(await byggLassNotis(NOTIS, finns(null), NU)).toMatchObject({ typ: 'hoppa_over' });
  });
  it('ett LÄSFEL lämnar raden oskickad (nästa cron försöker igen) — det är inte "finns inte"', async () => {
    expect(await byggLassNotis(NOTIS, finns(null, 'timeout'), NU)).toEqual({ typ: 'uppskjut' });
  });
  it('köad för mer än 24 timmar sedan → hoppas över, även om läsningen skulle fela', async () => {
    const gammal = { ...NOTIS, skapad_at: new Date(NU - LASS_MAX_ALDER_MS - 60_000).toISOString() };
    expect(await byggLassNotis(gammal, finns(null, 'timeout'), NU)).toMatchObject({ typ: 'hoppa_over' });
  });
  it('notisen saknar lass_id → hoppas över, kraschar inte', async () => {
    expect(await byggLassNotis({ typ: LASS_MASKIN, payload: {} }, finns(RAD), NU)).toMatchObject({ typ: 'hoppa_over' });
  });
});
