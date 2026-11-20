import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { medTidsgrans, TIDSGRANS_KARN, TIDSGRANS_SEKUNDAR } from './tidsgrans';

describe('medTidsgrans — ett anrop som aldrig svarar blir ett fel', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('ett svar före tidsgränsen kommer fram, och tidtagaren städas bort', async () => {
    await expect(medTidsgrans(Promise.resolve(42), 1000)).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('inget svar inom tidsgränsen → avslag med tiden i texten, inte en sekund före', async () => {
    const p = medTidsgrans(new Promise<number>(() => {}), 1000);
    let avslagen = false;
    const r = p.catch((e: Error) => { avslagen = true; return e; });
    await vi.advanceTimersByTimeAsync(999);
    expect(avslagen).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(avslagen).toBe(true);
    expect(((await r) as Error).message).toBe('inget svar inom 1000 ms');
  });

  it('ett fel före tidsgränsen kommer fram oförändrat (inte som tidsgränsfel), och tidtagaren städas bort', async () => {
    const fel = new Error('nätverk');
    await expect(medTidsgrans(Promise.reject(fel), 1000)).rejects.toBe(fel);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ett svar som kommer EFTER tidsgränsen ändrar ingenting: löftet är redan avslaget', async () => {
    let lev: (v: number) => void = () => {};
    const p = medTidsgrans(new Promise<number>((r) => { lev = r; }), 500);
    const r = p.then(() => 'lyckades', (e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(500);
    expect(await r).toBe('inget svar inom 500 ms');
    lev(7); await vi.advanceTimersByTimeAsync(10);
    await expect(p).rejects.toThrow('inget svar inom 500 ms');
  });

  it('tar emot en PromiseLike (som ett supabase-anrop), inte bara riktiga löften', async () => {
    const lank = { then: (res: (v: string) => unknown) => Promise.resolve('klart').then(res) } as PromiseLike<string>;
    await expect(medTidsgrans(lank, 1000)).resolves.toBe('klart');
  });

  it('tidsgränserna är ändliga, och kärndatans är kortare än de sekundära läsningarnas (som har flera steg)', () => {
    expect(Number.isFinite(TIDSGRANS_KARN) && TIDSGRANS_KARN > 0).toBe(true);
    expect(Number.isFinite(TIDSGRANS_SEKUNDAR) && TIDSGRANS_SEKUNDAR > TIDSGRANS_KARN).toBe(true);
  });
});
