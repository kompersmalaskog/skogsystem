// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const signera = vi.fn();
vi.mock('@/lib/markeringFoto', () => ({ signeraMarkeringFoto: (...a: unknown[]) => signera(...a) }));

import MarkeringFoto from './MarkeringFoto';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function rendera(el: React.ReactElement) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await act(async () => { root.render(el); });
  return div;
}

beforeEach(() => signera.mockReset());

describe('MarkeringFoto', () => {
  it('gammalt format: photoData visas direkt, ingen signering', async () => {
    const d = await rendera(<MarkeringFoto photoData="data:image/jpeg;base64,AAAA" />);
    expect(d.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
    expect(signera).not.toHaveBeenCalled();
  });

  it('photoPath vinner över photoData och signeras vid visning', async () => {
    signera.mockResolvedValue('https://x/signed?token=1');
    const d = await rendera(<MarkeringFoto photoPath="o/m.jpg" photoData="data:gammalt" />);
    expect(signera).toHaveBeenCalledWith('o/m.jpg');
    expect(d.querySelector('img')?.getAttribute('src')).toBe('https://x/signed?token=1');
  });

  it('lazy: ingen hämtning förrän tryck', async () => {
    signera.mockResolvedValue('https://x/signed?token=2');
    const d = await rendera(<MarkeringFoto lazy photoPath="o/m.jpg" />);
    expect(signera).not.toHaveBeenCalled();
    expect(d.textContent).toContain('Visa foto');
    await act(async () => { d.querySelector('button')!.click(); });
    expect(signera).toHaveBeenCalledTimes(1);
    expect(d.querySelector('img')?.getAttribute('src')).toBe('https://x/signed?token=2');
  });

  it('aktiv=false: hämtar inte', async () => {
    await rendera(<MarkeringFoto aktiv={false} photoPath="o/m.jpg" />);
    expect(signera).not.toHaveBeenCalled();
  });

  it('signering misslyckas: ärligt fel med försök igen, ingen trasig bild', async () => {
    signera.mockResolvedValueOnce(null).mockResolvedValueOnce('https://x/signed?token=3');
    const d = await rendera(<MarkeringFoto photoPath="o/m.jpg" />);
    expect(d.querySelector('img')).toBeNull();
    expect(d.textContent).toContain('Kunde inte hämta fotot');
    await act(async () => { d.querySelector('button')!.click(); });
    expect(d.querySelector('img')?.getAttribute('src')).toBe('https://x/signed?token=3');
  });

  it('onOpen får den färdiga URL:en', async () => {
    signera.mockResolvedValue('https://x/signed?token=4');
    const onOpen = vi.fn();
    const d = await rendera(<MarkeringFoto photoPath="o/m.jpg" onOpen={onOpen} />);
    await act(async () => { d.querySelector('img')!.click(); });
    expect(onOpen).toHaveBeenCalledWith('https://x/signed?token=4');
  });
});
