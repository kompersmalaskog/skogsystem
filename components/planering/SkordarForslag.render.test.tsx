// @vitest-environment jsdom
// Skördarförslaget som kort nertill: frågan, ett tryck kopplar, "Inte nu" tystar, och inget syns när inget föreslås eller när det inte är aktivt.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => h.rpc(...a) } }));

import { SkordarForslag } from './SkordarForslag';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const VALLUST = { stam_objekt_id: 'PONS20SDJAA270231_132', objekt_namn: 'Gallring Vällust', skal: 'samma VO', stammar: 644, forsta: '2026-10-05', sista: '2026-10-06', avstand_m: null };

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
beforeEach(() => { localStorage.clear(); h.rpc.mockReset(); });
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null; });
const q = (id: string) => behallare!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const vanta = async () => { for (let i = 0; i < 20; i++) await act(async () => { await Promise.resolve(); }); };
async function montera(props: Partial<React.ComponentProps<typeof SkordarForslag>> = {}) {
  behallare = document.createElement('div'); document.body.appendChild(behallare);
  rot = createRoot(behallare);
  await act(async () => { rot!.render(<SkordarForslag objektId="obj-1" aktiv smal onKopplad={() => {}} {...props} />); });
  await vanta();
}

describe('SkordarForslag', () => {
  it('visar frågan med namn, stammar och dagar — och Koppla', async () => {
    h.rpc.mockResolvedValue({ data: [VALLUST], error: null });
    await montera();
    expect(h.rpc).toHaveBeenCalledWith('foresla_skordarobjekt', { p_objekt: 'obj-1' });
    expect(q('skordar-forslag')!.textContent).toContain('Skördaren har kört här: Gallring Vällust · 644 stammar · 5–6 okt');
    expect(q('skordar-forslag-ja')!.textContent).toBe('Koppla');
  });
  it('ett tryck på Koppla kopplar, säger till sidan och tar bort kortet', async () => {
    h.rpc.mockImplementation(async (namn: string) => (namn === 'foresla_skordarobjekt' ? { data: [VALLUST], error: null } : { data: { alias: 2 }, error: null }));
    let kopplad = 0;
    await montera({ onKopplad: () => { kopplad += 1; } });
    await act(async () => { q('skordar-forslag-ja')!.click(); });
    await vanta();
    expect(h.rpc).toHaveBeenCalledWith('koppla_skordarobjekt', { p_objekt: 'obj-1', p_stam_objekt_id: 'PONS20SDJAA270231_132' });
    expect(kopplad).toBe(1);
    expect(q('skordar-forslag')).toBeNull();
  });
  it('går kopplingen fel står kortet kvar med en text som säger vad man gör, och sidan läser inte om', async () => {
    h.rpc.mockImplementation(async (namn: string) => (namn === 'foresla_skordarobjekt' ? { data: [VALLUST], error: null } : { data: null, error: { message: 'x' } }));
    let kopplad = 0;
    await montera({ onKopplad: () => { kopplad += 1; } });
    await act(async () => { q('skordar-forslag-ja')!.click(); });
    await vanta();
    expect(kopplad).toBe(0);
    expect(q('skordar-forslag')!.textContent).toContain('Det gick inte att koppla. Försök igen.');
    expect(q('skordar-forslag-ja')).not.toBeNull();
  });
  it('"Inte nu" tar bort kortet och det kommer inte tillbaka för samma objekt', async () => {
    h.rpc.mockResolvedValue({ data: [VALLUST], error: null });
    await montera();
    await act(async () => { q('skordar-forslag-nej')!.click(); });
    expect(q('skordar-forslag')).toBeNull();
    act(() => { rot!.unmount(); }); behallare!.remove();
    await montera();
    expect(q('skordar-forslag')).toBeNull();
  });
  it('inget förslag, inte aktivt eller fel från databasen: inget kort', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    await montera();
    expect(q('skordar-forslag')).toBeNull();
    act(() => { rot!.unmount(); }); behallare!.remove();
    h.rpc.mockResolvedValue({ data: [VALLUST], error: null });
    await montera({ aktiv: false });
    expect(q('skordar-forslag')).toBeNull();
    act(() => { rot!.unmount(); }); behallare!.remove();
    h.rpc.mockResolvedValue({ data: null, error: { message: 'saknas' } });
    await montera();
    expect(q('skordar-forslag')).toBeNull();
  });
});
