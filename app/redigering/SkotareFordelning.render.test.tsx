// @vitest-environment jsdom
// Fördelningen per skotare (2026-10-24): svaret först, en rad per skotare, ett tryck öppnar skotaren i samma ark.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const skrivningar: { tabell: string; typ: string; data?: any }[] = [];
const ladda = vi.fn();
let insatser: any[] = [];

vi.mock('@/lib/supabase', () => {
  const kedja = (tabell: string, typ: string, data?: any) => {
    const svar = typ === 'select' ? { data: [], error: null } : { data: [{ id: 1 }], error: null };
    const k: any = {
      eq: () => k, is: () => k, or: () => k, limit: () => k, select: () => k,
      then: (r: any) => { if (typ !== 'select') skrivningar.push({ tabell, typ, data }); return Promise.resolve(svar).then(r); },
    };
    return k;
  };
  return {
    supabase: {
      from: (tabell: string) => ({
        select: () => kedja(tabell, 'select'),
        insert: (d: any) => kedja(tabell, 'insert', d),
        update: (d: any) => kedja(tabell, 'update', d),
        delete: () => kedja(tabell, 'delete'),
      }),
    },
  };
});
vi.mock('./hooks/useSkotareLass', () => ({
  useSkotareLass: () => ({ insatser, forwarders: [{ maskin_id: 'A030353', namn: 'Wisent' }, { maskin_id: 'A130743', namn: 'Elefant 26' }], laddar: false, fel: null, ladda }),
}));

import SkotareFordelning, { effektivVolym, tillUtkast, arAndrad } from './SkotareFordelning';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const insats = (o: Partial<any>) => ({
  maskinId: 'A030353', namn: 'Wisent', hemObjektId: 'o1', mattVolym: 400, mattAntalLass: 20, mattG15: 30,
  radId: null, manuellVolym: null, manuellEgen: null, manuellOmlastning: null, manuellG15: null,
  arOmlastning: false, avserObjektId: null, notering: null, ...o,
});

let root: Root | null = null;
let el: HTMLDivElement;
beforeEach(() => { skrivningar.length = 0; ladda.mockClear(); });
afterEach(() => { act(() => root?.unmount()); root = null; el?.remove(); document.body.innerHTML = ''; });

async function montera(avverkat = 900) {
  el = document.createElement('div'); document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => { root!.render(<SkotareFordelning objektId="o1" avverkatVolym={avverkat} />); });
}
const text = () => document.body.textContent!.replace(/ | /g, ' ');
const q = (s: string) => document.body.querySelector(s) as HTMLElement | null;
const klick = async (n: Element | null) => { expect(n).not.toBeNull(); await act(async () => { (n as HTMLElement).click(); }); await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const skriv = async (etikett: string, v: string) => {
  const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent === etikett)!;
  const inp = document.getElementById(lbl.htmlFor) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('regler', () => {
  it('ifyllt ersätter lassen, tomt = lassen, tomt på blandad = 0', () => {
    const i = insats({});
    expect(effektivVolym(i as any, tillUtkast(i as any))).toBe(400);
    expect(effektivVolym(i as any, { ...tillUtkast(i as any), egen: '350' })).toBe(350);
    expect(effektivVolym(i as any, { ...tillUtkast(i as any), blandad: true })).toBe(0);
  });
  it('gammal omlastningsrad (volym_m3 + ar_omlastning) blir omlastning, inte egen', () => {
    const u = tillUtkast(insats({ arOmlastning: true, manuellVolym: 120 }) as any);
    expect(u).toMatchObject({ blandad: true, omlastning: '120', egen: '' });
  });
  it('"350" och "350,0" är samma värde — ingen ändring', () => {
    const i = insats({ manuellEgen: 350 }) as any;
    expect(arAndrad(i, { ...tillUtkast(i), egen: '350,0' })).toBe(false);
  });
});

describe('listan', () => {
  it('svaret först: skotat stort och mot skördat', async () => {
    insatser = [insats({}), insats({ maskinId: 'A130743', namn: 'Elefant 26', mattVolym: 300, mattAntalLass: 12 })];
    await montera(900);
    expect(q('[data-fordelning-summa]')!.textContent!.replace(/ | /g, ' ')).toBe('700 m³');
    expect(text()).toContain('av 900 m³ skördat');
    expect(document.querySelectorAll('[data-fordelning-skotare]').length).toBe(2);
    expect(text()).toContain('Lassen: 400 m³ · 20 lass');
  });
  it('mer än skördat sägs i ord', async () => {
    insatser = [insats({ manuellEgen: 950 })];
    await montera(900);
    expect(text()).toContain('50 m³ mer än skördat');
    expect(text()).toContain('du skrev in');
  });
  it('en skotare som inte är med kan läggas till', async () => {
    insatser = [insats({})];
    await montera();
    await klick(q('[data-fordelning-lagg-till="A130743"]'));
    expect(q('[data-fordelning-detalj="A130743"]')).not.toBeNull();
    expect(text()).toContain('Inga lass från maskinen');
  });
});

describe('en skotare', () => {
  it('öppnas i samma ark, Spara grå tills något ändrats, sparar och går tillbaka', async () => {
    insatser = [insats({})];
    await montera();
    await klick(q('[data-fordelning-skotare="A030353"]'));
    expect(q('[data-fordelning-detalj]')).not.toBeNull();
    expect((q('[data-fordelning-spara]') as HTMLButtonElement).disabled).toBe(true);
    await skriv('Utkört', '380');
    expect((q('[data-fordelning-spara]') as HTMLButtonElement).disabled).toBe(false);
    await klick(q('[data-fordelning-spara]'));
    const ins = skrivningar.find(s => s.typ === 'insert')!;
    expect(ins.tabell).toBe('skotare_objekt_manuell');
    expect(ins.data).toMatchObject({ objekt_id: 'o1', maskin_id: 'A030353', volym_egen_skotning: 380, volym_omlastning: null, ar_omlastning: false });
    expect(ladda).toHaveBeenCalled();
    expect(q('[data-fordelning-detalj]')).toBeNull();
  });
  it('mer än skördat går inte att spara och säger vad man gör', async () => {
    insatser = [insats({}), insats({ maskinId: 'A130743', namn: 'Elefant 26', mattVolym: 500 })];
    await montera(900);
    await klick(q('[data-fordelning-skotare="A030353"]'));
    await skriv('Utkört', '450');
    expect(q('[data-over]')).not.toBeNull();
    expect((q('[data-fordelning-spara]') as HTMLButtonElement).disabled).toBe(true);
  });
  it('omlastning räknas inte mot skördat och sparas med objektet den gäller', async () => {
    insatser = [insats({}), insats({ maskinId: 'A130743', namn: 'Elefant 26', mattVolym: 500 })];
    await montera(900);
    await klick(q('[data-fordelning-skotare="A030353"]'));
    await klick(q('[role="switch"]'));
    await skriv('Egen skotning', '300');
    await skriv('Omlastning', '400');
    expect(q('[data-over]')).toBeNull();
    await klick(q('[data-fordelning-spara]'));
    expect(skrivningar.find(s => s.typ === 'insert')!.data).toMatchObject({ volym_egen_skotning: 300, volym_omlastning: 400, ar_omlastning: true });
  });
  it('"Använd lassens värden" finns bara när något är inskrivet och tömmer allt', async () => {
    insatser = [insats({ radId: 7, manuellEgen: 350, manuellG15: 28 })];
    await montera();
    await klick(q('[data-fordelning-skotare="A030353"]'));
    await klick(q('[data-fordelning-lassen]'));
    const up = skrivningar.find(s => s.typ === 'update')!;
    expect(up.data).toMatchObject({ volym_egen_skotning: null, g15_timmar: null, ar_omlastning: false });
  });
  it('utan något inskrivet finns ingen "Använd lassens värden"', async () => {
    insatser = [insats({})];
    await montera();
    await klick(q('[data-fordelning-skotare="A030353"]'));
    expect(q('[data-fordelning-lassen]')).toBeNull();
  });
  it('‹ Alla skotare går tillbaka utan att spara', async () => {
    insatser = [insats({})];
    await montera();
    await klick(q('[data-fordelning-skotare="A030353"]'));
    await skriv('Utkört', '380');
    await klick(q('[data-fordelning-tillbaka]'));
    expect(q('[data-fordelning]')).not.toBeNull();
    expect(skrivningar.length).toBe(0);
  });
});

describe('brytaren', () => {
  it('tryckytan är 44 px hög, det som syns 32 px', async () => {
    insatser = [insats({})];
    await montera();
    await klick(q('[data-fordelning-skotare="A030353"]'));
    const b = q('[role="switch"]')!;
    expect(b.style.height).toBe('44px');
    expect((b.querySelector('[data-brytare-spar]') as HTMLElement).style.height).toBe('32px');
  });
});
