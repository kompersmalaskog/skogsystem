// @vitest-environment jsdom
// Planeringsvyns start, adress och minne: öppna utan objekt → listan; välj → kartan; ladda om → samma objekt; startsidan och tillbaka → samma objekt.
// Bakåtknappen, delad länk, borttaget objekt och maskinläget (hooken inaktiv). Verklig history/localStorage i jsdom; sidan själv monteras inte (22 000 rader).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import { usePlaneringsObjekt, type HamtaObjektSvar } from './usePlaneringsObjekt';
import { hamtaSenastePlanering, sattSenastePlanering } from '../senastePlanering';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Obj = { id: string; namn: string };
const OBJ: Record<string, Obj> = { a: { id: 'a', namn: 'Ekeby' }, b: { id: 'b', namn: 'Björkhult' } };

let kontroll: { valt: Obj | null; startKlar: boolean; valj: (o: Obj | null) => void };
function Sida(p: { aktiv?: boolean; anvandarId?: string | null; hoppa?: boolean; hamta: (id: string) => Promise<HamtaObjektSvar<Obj>> }) {
  const [valt, setValt] = useState<Obj | null>(null);
  const { startKlar } = usePlaneringsObjekt<Obj>({
    aktiv: p.aktiv ?? true, anvandarId: p.anvandarId === undefined ? 'anna' : p.anvandarId, hoppaStartval: p.hoppa,
    valtObjektId: valt?.id ?? null, hamtaObjekt: p.hamta, onValj: setValt,
  });
  kontroll = { valt, startKlar, valj: setValt };
  return null;
}

const alla = () => vi.fn(async (i: string): Promise<HamtaObjektSvar<Obj>> => (OBJ[i] ? { typ: 'hittad', objekt: OBJ[i] } : { typ: 'saknas' }));

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
async function montera(props: Parameters<typeof Sida>[0]) {
  behallare = document.createElement('div');
  document.body.appendChild(behallare);
  rot = createRoot(behallare);
  await act(async () => { rot!.render(<Sida {...props} />); });
  await flush();
}
async function avmontera() { await act(async () => { rot?.unmount(); }); behallare?.remove(); rot = null; }
async function flush() { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); }); }
const sok = () => window.location.search;

beforeEach(() => { localStorage.clear(); window.history.replaceState(null, '', '/planering'); });
afterEach(async () => { await avmontera(); });

describe('start', () => {
  it('öppna planering utan objekt (första gången) → listan: inget objekt valt, start klar, adressen orörd', async () => {
    const hamta = alla();
    await montera({ hamta });
    expect(kontroll.startKlar).toBe(true);
    expect(kontroll.valt).toBeNull();
    expect(hamta).not.toHaveBeenCalled();
    expect(sok()).toBe('');
  });

  it('välj objekt → kartan (valt) + adressen får ?objekt= + minnet sparas — utan ny historikpost (bakåt går till föregående sida)', async () => {
    await montera({ hamta: alla() });
    const langd = window.history.length;
    await act(async () => { kontroll.valj(OBJ.a); });
    expect(kontroll.valt?.id).toBe('a');
    expect(sok()).toBe('?objekt=a');
    expect(hamtaSenastePlanering('anna')).toBe('a');
    expect(window.history.length).toBe(langd);
  });

  it('ladda om → samma objekt (ur adressen)', async () => {
    await montera({ hamta: alla() });
    await act(async () => { kontroll.valj(OBJ.a); });
    await avmontera();
    const hamta = alla();
    await montera({ hamta });                       // omladdning: ny komponent, samma adress och localStorage
    expect(hamta).toHaveBeenCalledWith('a');
    expect(kontroll.valt?.id).toBe('a');
    expect(kontroll.startKlar).toBe(true);
  });

  it('gå till startsidan och tillbaka (adressen utan ?objekt=) → samma objekt (ur minnet), och adressen får ?objekt= igen', async () => {
    await montera({ hamta: alla() });
    await act(async () => { kontroll.valj(OBJ.a); });
    await avmontera();
    window.history.pushState(null, '', '/');                // startsidan
    window.history.pushState(null, '', '/planering');       // tillbaka till Planering via menyn
    expect(sok()).toBe('');
    const hamta = alla();
    await montera({ hamta });
    expect(hamta).toHaveBeenCalledWith('a');
    expect(kontroll.valt?.id).toBe('a');
    expect(sok()).toBe('?objekt=a');
  });

  it('delad länk: adressens objekt vinner över minnet', async () => {
    sattSenastePlanering('anna', 'a');
    window.history.replaceState(null, '', '/planering?objekt=b');
    const hamta = alla();
    await montera({ hamta });
    expect(hamta).toHaveBeenCalledWith('b');
    expect(kontroll.valt?.id).toBe('b');
    expect(hamtaSenastePlanering('anna')).toBe('b');
  });

  it('en annan medarbetares minne på samma enhet öppnas inte', async () => {
    sattSenastePlanering('bo', 'a');
    const hamta = alla();
    await montera({ hamta });
    expect(hamta).not.toHaveBeenCalled();
    expect(kontroll.valt).toBeNull();
  });

  it('objektet är borttaget → listan öppnas, minnet och adressens parameter rensas', async () => {
    sattSenastePlanering('anna', 'forsvunnet');
    window.history.replaceState(null, '', '/planering?objekt=forsvunnet');
    await montera({ hamta: alla() });
    expect(kontroll.valt).toBeNull();
    expect(kontroll.startKlar).toBe(true);
    expect(hamtaSenastePlanering('anna')).toBeNull();
    expect(sok()).toBe('');
  });

  it('hämtfel (nätet) → listan, men minnet behålls', async () => {
    sattSenastePlanering('anna', 'a');
    await montera({ hamta: vi.fn(async () => ({ typ: 'fel' as const })) });
    expect(kontroll.valt).toBeNull();
    expect(kontroll.startKlar).toBe(true);
    expect(hamtaSenastePlanering('anna')).toBe('a');
  });

  it('hoppaStartval (auto-uppdateringen återställer objektet): ingen hämtning, men valt objekt skrivs till adress och minne', async () => {
    sattSenastePlanering('anna', 'a');
    const hamta = alla();
    await montera({ hamta, hoppa: true });
    expect(hamta).not.toHaveBeenCalled();
    expect(kontroll.startKlar).toBe(true);
    await act(async () => { kontroll.valj(OBJ.b); });
    expect(sok()).toBe('?objekt=b');
    expect(hamtaSenastePlanering('anna')).toBe('b');
  });
});

describe('bakåtknappen', () => {
  it('byte från ett objekt till ett annat = ny historikpost; bakåt tar tillbaka förra objektet', async () => {
    await montera({ hamta: alla() });
    await act(async () => { kontroll.valj(OBJ.a); });
    const langd = window.history.length;
    await act(async () => { kontroll.valj(OBJ.b); });
    expect(window.history.length).toBe(langd + 1);
    expect(sok()).toBe('?objekt=b');
    await act(async () => { window.history.back(); await new Promise((r) => setTimeout(r, 30)); });
    await flush();
    expect(sok()).toBe('?objekt=a');
    expect(kontroll.valt?.id).toBe('a');
  });

  it('lämnar man sidan (startsidan) rör bakåt/framåt-lyssnaren ingenting — inget objekt släpps så listan blinkar förbi', async () => {
    await montera({ hamta: alla() });
    await act(async () => { kontroll.valj(OBJ.a); });
    window.history.pushState(null, '', '/');
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    await flush();
    expect(kontroll.valt?.id).toBe('a');
  });
});

describe('inaktiv hook (maskinläge, /maskin, maskinfrågan)', () => {
  it('aktiv=false: ingen hämtning, ingen adress, inget minne, start aldrig klar', async () => {
    sattSenastePlanering('anna', 'a');
    window.history.replaceState(null, '', '/planering?objekt=b');
    const hamta = alla();
    await montera({ hamta, aktiv: false });
    expect(hamta).not.toHaveBeenCalled();
    expect(kontroll.startKlar).toBe(false);
    expect(kontroll.valt).toBeNull();
    await act(async () => { kontroll.valj(OBJ.a); });
    expect(sok()).toBe('?objekt=b');                          // orörd
    expect(hamtaSenastePlanering('anna')).toBe('a');           // orört (samma som innan)
  });

  it('okänd användare (inloggningen ej läst) → väntar, gör ingenting', async () => {
    sattSenastePlanering('anna', 'a');
    const hamta = alla();
    await montera({ hamta, anvandarId: null });
    expect(hamta).not.toHaveBeenCalled();
    expect(kontroll.startKlar).toBe(false);
  });
});
