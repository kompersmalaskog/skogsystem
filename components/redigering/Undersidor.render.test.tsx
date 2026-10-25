// @vitest-environment jsdom
// Undersidorna under Mer (2026-10-24): svaret först, en rad per sak, ett tryck öppnar ett litet ark — och allt sparas direkt.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({
        data: [
          { maskin_id: 'A030353', visningsnamn: 'Wisent', maskin_typ: 'Forwarder', aktiv_till: null },
          { maskin_id: 'A130743', visningsnamn: 'Elefant 26', maskin_typ: 'Forwarder', aktiv_till: null },
          { maskin_id: 'A110148', visningsnamn: 'Elefant AF', maskin_typ: 'Forwarder', aktiv_till: '2026-07-08' },
          { maskin_id: 'G', visningsnamn: 'Giant', maskin_typ: 'Harvester', aktiv_till: null },
        ], error: null,
      }),
    }),
  },
}));
vi.mock('@/lib/ekonomi/ackordgrund', () => ({
  hamtaAckordgrundAuto: async () => ({ medelstam: 0.42, sortimentgrupper: 3, skotavstand: 310, g15Skordare: 48.8, g15Skotare: 61.6 }),
}));
vi.mock('@/lib/grot-koppling', () => ({
  hamtaRisKandidater: async () => ({ ok: true, message: '', rader: [{ objekt_id: 'h1', namn: 'Stänkelsmåla', volym_m3sub: 900, sista_datum: null }] }),
  hamtaKopplingar: async () => ({ ok: true, message: '', rader: [] }),
  sparaKopplingar: vi.fn(async () => ({ ok: true, message: '' })),
}));

import { FilerSida, PrisSida, ExternSida, SkotareSida, filSvar, appensVarde, lasTal } from './Undersidor';
import { sparaKopplingar } from '@/lib/grot-koppling';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); root = null; el?.remove(); document.body.innerHTML = ''; });

async function montera(node: React.ReactNode) {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => { root!.render(node); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}
const text = () => document.body.textContent!.replace(/ | /g, ' ');
const q = (s: string) => document.body.querySelector(s) as HTMLElement | null;
const klick = async (n: Element | null) => { expect(n).not.toBeNull(); await act(async () => { (n as HTMLElement).click(); }); await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const skriv = async (n: Element | null, v: string) => {
  expect(n).not.toBeNull();
  const inp = n as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('lasTal', () => {
  it('komma och punkt, tomt är null, annat är NaN', () => {
    expect(lasTal('0,5')).toBe(0.5);
    expect(lasTal(' 1 200 ')).toBe(1200);
    expect(lasTal('')).toBeNull();
    expect(Number.isNaN(lasTal('abc'))).toBe(true);
  });
});

describe('Filer', () => {
  const lage = { skordare: 'data', skotare: 'data', skotareEjOrsak: null, skordareEjOrsak: null, ovantadSkordardata: false, ovantadSkotardata: false } as const;
  it('svaret i ord och en rad per maskin', async () => {
    await montera(<FilerSida status="ok" lage={lage} rader={[
      { maskinId: 'G', modell: 'Giant', typ: 'skordare', antalFiler: 6, filtyper: ['HPR', 'MOM'], senasteData: '2026-10-14' },
      { maskinId: 'W', modell: 'Wisent', typ: 'skotare', antalFiler: 1, filtyper: ['FPR'], senasteData: '2026-10-21' },
    ]} />);
    expect(q('[data-svar]')!.textContent).toBe('Båda maskinerna har skickat filer');
    expect(text()).toContain('6 filer · HPR, MOM');
    expect(text()).toContain('1 fil · FPR');
  });
  it('en maskin som inte väntas säger varför, en som saknas är orange "Inget än"', () => {
    expect(filSvar({ ...lage, skotare: 'saknas' }, '2026-10-14').text).toContain('Skotaren har inte skickat något – skördningen klar');
    expect(filSvar({ ...lage, skotare: 'saknas' }).ton).toBe('gor');
    expect(filSvar({ ...lage, skotare: 'data', ovantadSkotardata: true, skotareEjOrsak: 'egen skotning' }).text).toContain('fast det står egen skotning');
  });
  it('läsfel är ett fel, aldrig "Inga filer"', async () => {
    await montera(<FilerSida status="fel" lage={null} rader={undefined} />);
    expect(text()).toContain('Filerna kunde inte läsas');
  });
});

function PrisVy({ start, spara, sparaMaskin, g15 }: { start: any; spara: any; sparaMaskin: any; g15: any }) {
  const [obj, set] = useState<any>(start);
  const med = (f: any) => async (p: any, ...r: any[]) => { const ok = await f(p, ...r); if (ok) set((o: any) => ({ ...o, ...p })); return ok; };
  return <PrisSida obj={obj} gruppIds={['1']} direktSpara={med(spara)} direktSparaMaskin={med(sparaMaskin)}
    sparaSkotarG15={async (v: number | null) => { const ok = await g15(v); if (ok) set((o: any) => ({ ...o, skotning_g15_manuell: v })); return ok; }} />;
}

describe('Pris och ersättning', () => {
  it('Ackord/Timpeng väljs INTE här (det bor i Betalning) — svaret säger bara vilket', async () => {
    await montera(<PrisVy start={{ timpeng: false }} spara={async () => true} sparaMaskin={async () => true} g15={async () => true} />);
    expect(q('[data-svar]')!.textContent).toBe('Betalas på ackord');
    expect(text()).not.toContain('Timpeng-undantag');
    expect(document.body.querySelectorAll('[role="radio"]').length).toBe(0);
  });
  it('appens värde står på raden, och ett tryck skriver in ett eget som sparas direkt', async () => {
    const spara = vi.fn(async () => true);
    await montera(<PrisVy start={{}} spara={spara} sparaMaskin={async () => true} g15={async () => true} />);
    expect(q('[data-tal-rad="medelstam_manuell"]')!.textContent).toContain('0,420 m³');
    await klick(q('[data-tal-rad="medelstam_manuell"]'));
    await skriv(q('[data-tal-falt]'), '0,5');
    await klick(q('[data-tal-spara]'));
    expect(spara).toHaveBeenCalledWith({ medelstam_manuell: 0.5 });
    expect(q('[data-tal-rad="medelstam_manuell"]')!.textContent).toContain('Du har ersatt appens värde');
    await klick(q('[data-tal-rad="medelstam_manuell"]'));
    await klick(q('[data-tal-appens]'));
    expect(spara).toHaveBeenLastCalledWith({ medelstam_manuell: null });
  });
  it('G15 per maskin: skördarens till skördarens rader, skotarens via skotarraden', async () => {
    const sparaMaskin = vi.fn(async () => true);
    const g15 = vi.fn(async () => true);
    await montera(<PrisVy start={{}} spara={async () => true} sparaMaskin={sparaMaskin} g15={g15} />);
    await klick(q('[data-tal-rad="skordning_g15_manuell"]'));
    await skriv(q('[data-tal-falt]'), '50');
    await klick(q('[data-tal-spara]'));
    expect(sparaMaskin).toHaveBeenCalledWith({ skordning_g15_manuell: 50 }, 'harvester');
    await klick(q('[data-tal-rad="skotning_g15_manuell"]'));
    await skriv(q('[data-tal-falt]'), '61,5');
    await klick(q('[data-tal-spara]'));
    expect(g15).toHaveBeenCalledWith(61.5);
  });
  it('timpeng-delens brytare finns bara när en volym är inskriven', async () => {
    const spara = vi.fn(async () => true);
    await montera(<PrisVy start={{ timpeng_undantag_volym: 120 }} spara={spara} sparaMaskin={async () => true} g15={async () => true} />);
    await klick(q('[data-dra="skotare"] [role="switch"]'));
    expect(spara).toHaveBeenCalledWith({ timpeng_undantag_dra_skotare: false });
    act(() => root?.unmount()); document.body.innerHTML = '';
    await montera(<PrisVy start={{}} spara={spara} sparaMaskin={async () => true} g15={async () => true} />);
    expect(q('[data-dra]')).toBeNull();
  });
  it('terrängen: Svår med 4 kr förvalt, steg om 1 kr, inom 1–8', async () => {
    const spara = vi.fn(async () => true);
    await montera(<PrisVy start={{}} spara={spara} sparaMaskin={async () => true} g15={async () => true} />);
    await klick(q('[data-terrang]'));
    await klick([...document.body.querySelectorAll('[role="radio"]')].find(n => n.textContent!.includes('Svår'))!);
    await klick(q('[aria-label="Mer"]'));
    await klick(q('[data-terrang-spara]'));
    expect(spara).toHaveBeenCalledWith({ terrang_kr_manuell: 5 });
    expect(q('[data-terrang]')!.textContent).toContain('Svår · 5 kr/m³');
  });
  it('appensVarde säger inget när appen inte vet', () => {
    expect(appensVarde('medelstam_manuell', null)).toBeNull();
    expect(appensVarde('skotavstand_manuell', { medelstam: null, sortimentgrupper: 0, skotavstand: null, g15Skordare: null, g15Skotare: null })).toBeNull();
  });
});

function ExternVy({ start, sparaMaskin }: { start: any; sparaMaskin: any }) {
  const [obj, set] = useState<any>(start);
  return <ExternSida obj={obj} direktSparaMaskin={async (p: any, t: any) => { const ok = await sparaMaskin(p, t); if (ok) set((o: any) => ({ ...o, ...p })); return ok; }} />;
}

describe('Extern skotare', () => {
  it('brytaren skriver ovrigt_info på skotarens rader och behåller annat i fältet', async () => {
    const sparaMaskin = vi.fn(async () => true);
    await montera(<ExternVy start={{ ovrigt_info: JSON.stringify({ annat: 1 }) }} sparaMaskin={sparaMaskin} />);
    expect(q('[data-svar]')!.textContent).toBe('Vi skotar själva');
    await klick(q('[data-extern] [role="switch"]'));
    const [patch, typ] = sparaMaskin.mock.calls[0] as any;
    expect(typ).toBe('forwarder');
    expect(JSON.parse(patch.ovrigt_info)).toMatchObject({ annat: 1, extern_skotning: true });
    expect(text()).toContain('Skriv namnet');
  });
  it('kostnaden räknas när pris och antal finns', async () => {
    const info = JSON.stringify({ extern_skotning: true, extern_foretag: 'Nilssons', extern_pris_typ: 'm3', extern_pris: 40, extern_antal: 300 });
    await montera(<ExternVy start={{ ovrigt_info: info }} sparaMaskin={async () => true} />);
    expect(q('[data-svar]')!.textContent).toBe('Nilssons skotar åt oss');
    expect(q('[data-extern-kostnad]')!.textContent!.replace(/\s/g, ' ')).toContain('12 000 kr');
  });
  it('byter till per timme i prisets ark', async () => {
    const sparaMaskin = vi.fn(async () => true);
    const info = JSON.stringify({ extern_skotning: true, extern_foretag: 'N', extern_pris_typ: 'm3', extern_pris: 40, extern_antal: 3 });
    await montera(<ExternVy start={{ ovrigt_info: info }} sparaMaskin={sparaMaskin} />);
    await klick(q('[data-extern-rad="pris"]'));
    await klick([...document.body.querySelectorAll('[role="radio"]')].find(n => n.textContent!.includes('Per timme'))!);
    await skriv(q('[data-pris-falt]'), '950');
    await klick(q('[data-pris-spara]'));
    expect(JSON.parse((sparaMaskin.mock.calls[0] as any)[0].ovrigt_info)).toMatchObject({ extern_pris_typ: 'timme', extern_pris: 950 });
  });
});

const svarOk = async () => ({ ok: true, message: '' });

describe('Skotare', () => {
  const bas = { objekt_id: '1', huvudtyp: 'Slutavverkning', tilldelad_skotare: null };
  const props = (extra: any = {}) => ({
    obj: bas, syskon: [bas], skotatLass: 561, skordatTotal: 678, skotatTotal: 561, gruppSkotningAvslutad: false,
    skotareSanderEj: false, externSkotare: false, sattFardigskotat: vi.fn(svarOk), sparaFilfri: vi.fn(svarOk), sattTilldelad: vi.fn(svarOk),
    fordelning: <div data-fordelning-innehall="">fördelning</div>, ...extra,
  });

  it('svaret först: skotat ur lassen och skördat', async () => {
    await montera(<SkotareSida {...props()} />);
    expect(q('[data-skotat-tal]')!.textContent).toBe('561 m³');
    expect(text()).toContain('Räknat ur lassen · 678 m³ skördat');
  });
  it('Färdigskotat sätter skotat till skördat med ett tryck; satt för hand går att ångra', async () => {
    const p = props();
    await montera(<SkotareSida {...p} />);
    await klick(q('[data-fardigskotat-knapp]'));
    expect(p.sattFardigskotat).toHaveBeenCalledWith(678);
    const p2 = props({ obj: { ...bas, skotad_volym_manuell: 678 } });
    act(() => root?.unmount()); document.body.innerHTML = '';
    await montera(<SkotareSida {...p2} />);
    await klick(q('[data-fardigskotat-angra]'));
    expect(p2.sattFardigskotat).toHaveBeenCalledWith(null);
  });
  it('när skotningen är klar men volym fattas säger sektionen det, och knappen blir vit', async () => {
    await montera(<SkotareSida {...props({ gruppSkotningAvslutad: true, syskon: [{ ...bas, skotning_avslutad: '2026-10-23' }] })} />);
    expect(text()).toContain('men 117 m³ fattas mot skördat');
  });
  it('vem skotar: bara aktiva maskiner, ett tryck sparar', async () => {
    const p = props();
    await montera(<SkotareSida {...p} />);
    expect(q('[data-skotare-val="A110148"]')).toBeNull();
    await klick(q('[data-skotare-val="A030353"]'));
    expect(p.sattTilldelad).toHaveBeenCalledWith('A030353');
  });
  it('filfri skotare: timmar och volym skrivs in i varsitt ark', async () => {
    const p = props({ skotareSanderEj: true, obj: { ...bas, tilldelad_skotare: 'A030353' } });
    await montera(<SkotareSida {...p} />);
    expect(text()).toContain('Wisent skickar inga filer');
    await klick(q('[data-filfri="g15"]'));
    await skriv(q('[data-tal-falt]'), '12,5');
    await klick(q('[data-tal-spara]'));
    expect(p.sparaFilfri).toHaveBeenCalledWith('g15', 12.5);
  });
  it('risjobb: frågar var riset kommer från, inte vem som skotar', async () => {
    await montera(<SkotareSida {...props({ obj: { ...bas, huvudtyp: 'Grot', risskotning: true } })} />);
    expect(text()).toContain('Var kommer riset från?');
    expect(text()).not.toContain('Vem skotar?');
    await klick(q('[data-ris="h1"]'));
    await klick(q('[data-ris-spara]'));
    expect(sparaKopplingar).toHaveBeenCalledWith('1', ['h1']);
  });
  it('fördelningen ligger bakom en rad', async () => {
    await montera(<SkotareSida {...props()} />);
    expect(q('[data-fordelning-innehall]')).toBeNull();
    await klick(q('[data-fordelning-rad]'));
    expect(q('[data-fordelning-innehall]')).not.toBeNull();
  });
});
