// @vitest-environment jsdom
// Rita om gränsen mellan första och andra gallring. jsdom ritar ingen MapLibre-karta, så kartan byts mot en stand-in
// som skickar tryck på samma sätt (onTryck med [lng, lat]); själva ritningen på kartan mäts i Chromium, inte här.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import sandasen from '@/lib/__fixtures__/sandasen_gallring_2026-10-22.json';
import { beraknaPerHa } from '@/lib/gallringPerHa';
import { foreslaDelning, type RitadDelning } from '@/lib/gallringDelar';

let tryck: ((p: [number, number]) => void) | undefined;
let ringIKartan: { punkter: [number, number][]; sluten: boolean } | null | undefined;
vi.mock('./GallradYtaKarta', () => ({
  default: (p: any) => {
    tryck = p.onTryck;
    ringIKartan = p.ring;
    return createElement('div', { 'data-gallrad-karta': '', 'data-ritar': p.onTryck ? 'ja' : 'nej' });
  },
}));

import DelningArk from './DelningArk';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  root = null;
  document.body.innerHTML = '';
});

function sandasenYta() {
  const [lo, la] = sandasen.origo as [number, number];
  const st = (sandasen.stammar_dlat_dlng_dbh as number[][]).map(([a, b, d], i) => ({ id: i, lat: la + a * 1e-5, lng: lo + b * 1e-5, dbhMm: d }));
  const p = beraknaPerHa({ ringar: sandasen.ringar as [number, number][][], volymM3fub: 300, stammar: st.length, stamrader: st, spar: [] });
  if (p.lage !== 'ok' || !p.yta) throw new Error('ingen yta');
  return { p: { ...p, yta: p.yta }, st };
}

async function montera(el: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(el); });
  return host;
}
const klick = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };

describe('Rita om', () => {
  it('ett tryck = ett hörn, ↩ tar bort det senaste, Spara skickar ringen och vilken del den gäller', async () => {
    const { p, st } = sandasenYta();
    const delning = foreslaDelning(p.yta, st)!;
    const onSvar = vi.fn(async (_s: unknown, _r?: RitadDelning) => {});
    await montera(createElement(DelningArk, { yta: p.yta, delning, arealHa: p.arealHa, svarSparas: true, onSvar, onStang: () => {} }));
    await klick(document.querySelector('[data-delning-rita]'));
    expect(document.querySelector('[data-ritar="ja"]')).not.toBeNull();
    // Förvalt: den mindre delen (väster, första gallring på Sandåsen).
    expect((document.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement).textContent).toBe('Första gallring');
    const spara = () => document.querySelector('[data-rita-spara]') as HTMLButtonElement;
    expect(spara().disabled).toBe(true);
    const horn: [number, number][] = [[14.598, 56.510], [14.609, 56.510], [14.609, 56.522], [14.598, 56.522]];
    for (const h of horn.slice(0, 3)) await act(async () => { tryck!(h); });
    expect(ringIKartan!.punkter).toHaveLength(3);
    expect(spara().disabled).toBe(false);
    await klick(document.querySelector('[data-rita-angra]'));
    expect(ringIKartan!.punkter).toHaveLength(2);
    expect(spara().disabled).toBe(true);
    await act(async () => { tryck!(horn[2]); });
    await act(async () => { tryck!(horn[3]); });
    await klick(spara());
    expect(onSvar).toHaveBeenCalledWith('ritad', { del: 'forsta', ring: horn });
    // Efter sparningen är man tillbaka i arket, utan ritläge.
    expect(document.querySelector('[data-ritar="ja"]')).toBeNull();
  });

  it('Avbryt i ritläget sparar inget och går tillbaka till arket', async () => {
    const { p, st } = sandasenYta();
    const onSvar = vi.fn(async () => {});
    await montera(createElement(DelningArk, { yta: p.yta, delning: foreslaDelning(p.yta, st)!, arealHa: p.arealHa, svarSparas: true, onSvar, onStang: () => {} }));
    await klick(document.querySelector('[data-delning-rita]'));
    await act(async () => { tryck!([14.6, 56.51]); });
    await klick(Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Avbryt')!);
    expect(onSvar).not.toHaveBeenCalled();
    expect(document.querySelector('[data-delning-forslag]')).not.toBeNull();
  });

  it('en sparad ritning syns: meningen, gränsen på kartan och Rita om är vald', async () => {
    const { p, st } = sandasenYta();
    const ring: [number, number][] = [[14.598, 56.510], [14.609, 56.510], [14.609, 56.522], [14.598, 56.522]];
    const delning = foreslaDelning(p.yta, st, 'ritad', { del: 'forsta', ring })!;
    await montera(createElement(DelningArk, { yta: p.yta, delning, arealHa: p.arealHa, svarSparas: true, onSvar: async () => {}, onStang: () => {} }));
    expect(document.querySelector('[data-delning-forslag]')!.textContent).toBe('Du har ritat gränsen.');
    expect(ringIKartan).toEqual({ punkter: ring, sluten: true });
    expect(document.querySelector('[data-delning-rita]')!.textContent).toContain('Rita om');
    expect(document.querySelector('[data-delning-aterga]')!.textContent).toBe('Återgå till appens förslag');
  });

  it('en ritning som inte delar ytan sägs', async () => {
    const { p, st } = sandasenYta();
    const allt: [number, number][] = [[14.5, 56.4], [14.7, 56.4], [14.7, 56.6], [14.5, 56.6]];
    const delning = foreslaDelning(p.yta, st, 'ritad', { del: 'forsta', ring: allt })!;
    await montera(createElement(DelningArk, { yta: p.yta, delning, arealHa: p.arealHa, svarSparas: true, onSvar: async () => {}, onStang: () => {} }));
    expect(document.querySelector('[data-ritad-delar-inte]')).not.toBeNull();
  });
});
