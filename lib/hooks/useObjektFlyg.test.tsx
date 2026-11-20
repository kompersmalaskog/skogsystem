// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useObjektFlyg } from './useObjektFlyg';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const GEO = { features: [{ properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [[[14.70, 56.40], [14.71, 56.40], [14.71, 56.41], [14.70, 56.41], [14.70, 56.40]]] } }] };
const OBJ = { id: 'a', lat: 56.405, lng: 14.705 };
const karta = () => ({ fitBounds: vi.fn(), easeTo: vi.fn() });
let rot: Root | null = null;
function Prov(p: any) { useObjektFlyg(p); return null; }
const rendera = async (p: any) => { if (!rot) rot = createRoot(document.body.appendChild(document.createElement('div'))); await act(async () => { rot!.render(<Prov {...p} />); }); };
afterEach(async () => { await act(async () => { rot?.unmount(); }); rot = null; document.body.innerHTML = ''; });

describe('useObjektFlyg', () => {
  it('sveper till traktgränsen när objektets geometrisvar kommit', async () => {
    const k = karta();
    await rendera({ map: k, aktiv: true, objekt: OBJ, geometriHamtadFor: null, geometri: null });
    expect(k.fitBounds).not.toHaveBeenCalled();
    await rendera({ map: k, aktiv: true, objekt: OBJ, geometriHamtadFor: 'a', geometri: GEO });
    expect(k.fitBounds).toHaveBeenCalledTimes(1);
    expect(k.fitBounds.mock.calls[0][0]).toEqual([[14.70, 56.40], [14.71, 56.41]]);
  });

  it('ett ANNAT objekts geometrisvar räknas inte (objektet har bytts, svaret är det gamla)', async () => {
    const k = karta();
    await rendera({ map: k, aktiv: true, objekt: { id: 'b', lat: 56.5, lng: 14.9 }, geometriHamtadFor: 'a', geometri: GEO });
    expect(k.fitBounds).not.toHaveBeenCalled();
    expect(k.easeTo).not.toHaveBeenCalled();
  });

  it('saknad traktgräns (svaret kom, tomt) → objektets koordinat på öppningsnivån', async () => {
    const k = karta();
    await rendera({ map: k, aktiv: true, objekt: OBJ, geometriHamtadFor: 'a', geometri: null });
    expect(k.fitBounds).not.toHaveBeenCalled();
    expect(k.easeTo.mock.calls[0][0]).toMatchObject({ center: [14.705, 56.405], zoom: 16 });
  });

  it('en gång per objekt; ett nytt objekt sveps till, och tillbaka till det första sveps till igen', async () => {
    const k = karta();
    const a = { map: k, aktiv: true, objekt: OBJ, geometriHamtadFor: 'a', geometri: GEO };
    await rendera(a); await rendera({ ...a, geometri: { ...GEO } });
    expect(k.fitBounds).toHaveBeenCalledTimes(1);
    const b = { id: 'b', lat: 56.5, lng: 14.9 };
    await rendera({ ...a, objekt: b });                                        // b valt, svaret är ännu a:s
    expect(k.fitBounds).toHaveBeenCalledTimes(1);
    await rendera({ map: k, aktiv: true, objekt: b, geometriHamtadFor: 'b', geometri: GEO });
    expect(k.fitBounds).toHaveBeenCalledTimes(2);
    await rendera({ map: k, aktiv: true, objekt: OBJ, geometriHamtadFor: 'b', geometri: GEO });
    await rendera({ map: k, aktiv: true, objekt: OBJ, geometriHamtadFor: 'a', geometri: GEO });
    expect(k.fitBounds).toHaveBeenCalledTimes(3);
  });

  it('inte aktiv (körvyn, maskinläget), ingen karta eller upptagen kamera → ingenting rörs', async () => {
    const k = karta();
    const bas = { map: k, aktiv: true, objekt: OBJ, geometriHamtadFor: 'a', geometri: GEO };
    await rendera({ ...bas, aktiv: false });
    await rendera({ ...bas, aktiv: false, objekt: { ...OBJ, id: 'x' }, geometriHamtadFor: 'x' });
    await rendera({ ...bas, map: null, objekt: { ...OBJ, id: 'y' }, geometriHamtadFor: 'y' });
    await rendera({ ...bas, kameraUpptagen: () => true, objekt: { ...OBJ, id: 'z' }, geometriHamtadFor: 'z' });
    expect(k.fitBounds).not.toHaveBeenCalled();
    expect(k.easeTo).not.toHaveBeenCalled();
  });

  it('ett objekt utan gräns och utan koordinat: kameran rörs inte', async () => {
    const k = karta();
    await rendera({ map: k, aktiv: true, objekt: { id: 'q' }, geometriHamtadFor: 'q', geometri: null });
    expect(k.fitBounds).not.toHaveBeenCalled(); expect(k.easeTo).not.toHaveBeenCalled();
  });
});
