// @vitest-environment jsdom
// Objektets ark: svaret först, förslaget sparas med ett tryck, Special är en brytare högt upp, källan står under fältet,
// och allt annat finns i samma ark under Mer (det gamla "Mer om objektet" är borta, 2026-10-24).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import ObjektOversikt, { type ObjektOversiktProps } from './ObjektOversikt';
import ObjektLista from './ObjektLista';
import type { ListGrupp } from '@/lib/redigering/listaVy';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); root = null; el?.remove(); document.body.innerHTML = ''; });

function montera(node: React.ReactNode) {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(node));
}
const text = () => document.body.textContent!.replace(/ | /g, ' ');
const klick = async (n: Element | null) => { expect(n).not.toBeNull(); await act(async () => { (n as HTMLElement).click(); }); };

const SKALVIKEN = { objekt_id: '11271860', object_name: 'Skälviken RP J-Hus -25', vo_nummer: '11271860', huvudtyp: 'Slutavverkning', bolag: 'Vida', cutting_method: 'ClearCutting', avtalsform: null, skogsagare: 'Anna Berg', auto_ifyllt: { bolag: 'trakt' } };

function Vy({ start = SKALVIKEN, spara, extra = {} }: { start?: any; spara: (p: any) => Promise<boolean>; extra?: Partial<ObjektOversiktProps> }) {
  const [obj, set] = useState<any>(start);
  return (
    <ObjektOversikt obj={obj} set={set} alla={[obj]}
      objektRad={{ id: 'o1', status: 'pagaende', avtalsform: 'Rp', markagare: 'Anna Berg', assigned_skordare_user_id: 'm1' }} objektRadLaddar={false}
      medarbetare={[{ id: 'm1', namn: 'Stefan Karlsson' }, { id: 'm2', namn: 'Daniel Johansson' }]}
      statusVal={[{ varde: 'pagaende', label: 'Pågående' }, { varde: 'avslutat', label: 'Avslutat' }]} bolagVal={['Vida', 'ATA']}
      skordat={678} skotat={590}
      filRader={[{ maskinId: 'G', modell: 'Giant', typ: 'skordare', antalFiler: 6, senasteData: '2026-10-14' }]} filStatus="ok"
      skordForslag={null} skotForslag={null}
      direktSpara={spara} direktSparaAvslut={async () => true}
      direktSparaMaskin={async () => true} oppnaUnder={() => {}} atgardVal={['Föryngring', 'Första gallring', 'Gallring']}
      filerSummering={{ text: '6 filer', warn: false }} dokument={null} grotSenast={null}
      sattSkotat={async () => true} taBort={async () => true} {...extra} />
  );
}

describe('ObjektOversikt', () => {
  it('svaret först, förslaget sparas med ett tryck, källan under fältet', async () => {
    const spara = vi.fn(async () => true);
    montera(<Vy spara={spara} />);
    expect(text()).toContain('Var står objektet?');
    expect(document.querySelector('[data-lage]')!.textContent).toBe('Pågår');
    expect(text()).toContain('Slutavverkning · Vida · VO 11271860');

    // Trakten och namnet säger Rp → "Rotpost?" och ett tryck sparar.
    const rad = document.querySelector('[data-saknas="avtalsform"]');
    expect(rad!.textContent).toContain('Rotpost?');
    await klick(rad);
    expect(spara).toHaveBeenCalledWith({ avtalsform: 'Rp' });
    expect(document.querySelector('[data-saknas="avtalsform"]')).toBeNull();
    expect(document.querySelector('[data-uppgift="avtalsform"]')!.textContent).toContain('Rotpost (Rp)');
    expect(document.querySelector('[data-uppgift="bolag"]')!.textContent).toContain('från trakten');
    expect(document.querySelector('[data-uppgift="skogsagare"]')!.textContent).toContain('samma som trakten');
  });

  it('ett misslyckat sparande tar tillbaka det som stod', async () => {
    montera(<Vy spara={async () => false} />);
    await klick(document.querySelector('[data-saknas="avtalsform"]'));
    expect(document.querySelector('[data-saknas="avtalsform"]')).not.toBeNull();
  });

  it('Special är en brytare; på visar skälet och märket', async () => {
    const spara = vi.fn(async () => true);
    montera(<Vy spara={spara} />);
    const brytare = document.querySelector('[role="switch"][aria-label="Special-objekt"]')!;
    expect(brytare.getAttribute('aria-checked')).toBe('false');
    await klick(brytare);
    expect(spara).toHaveBeenCalledWith({ special: true });
    expect(document.querySelector('[data-special-skal]')).not.toBeNull();
    expect(document.querySelector('[data-special-marke]')!.textContent).toBe('Special');
    await klick(document.querySelector('[role="switch"][aria-label="Special-objekt"]'));
    expect(spara).toHaveBeenLastCalledWith({ special: false, special_skal: null });
  });

  it('tips om vindfälle i Special-sektionen', () => {
    montera(<Vy spara={async () => true} start={{ ...SKALVIKEN, object_name: 'Stensjömåla VF' }} />);
    expect(text()).toContain('Namnet säger vindfälle eller storm. Är det ett special-objekt?');
  });

  it('maskinerna, avslutsförslaget och Mer', async () => {
    const avslut = vi.fn(async () => true);
    const under = vi.fn();
    montera(<Vy spara={async () => true} extra={{
      skordForslag: { field: 'skordning_avslutad', autoField: 'skordning_avslutad_auto', label: 'skördning', maskinTyp: 'harvester', datum: '2026-10-14', kalla: 'maskindata' },
      direktSparaAvslut: avslut, oppnaUnder: under,
    }} />);
    expect(document.querySelector('[data-maskin="G"]')!.textContent).toContain('Skördare · 6 filer · t.o.m. 14 okt');
    await klick(document.querySelector('[data-maskin="G"]'));
    expect(under).toHaveBeenCalledWith('filer');
    expect(text()).toContain('Skördning klar 14 okt?');
    await klick([...document.querySelectorAll('[data-avslut-forslag] button')].find(b => b.textContent === 'Godkänn')!);
    expect(avslut).toHaveBeenCalledWith('harvester', { skordning_avslutad: '2026-10-14', skordning_avslutad_auto: true, skordning_ej_klar: false, skordning_auto_skal: null });
    expect(document.querySelector('[data-avslut="Skördning"]')!.textContent).toContain('Klar 14 okt');
    // Mer: undersidorna öppnas från samma ark — inget "Mer om objektet" längre.
    expect(document.querySelector('[data-mer]')).toBeNull();
    expect(text()).not.toContain('Mer om objektet');
    for (const sida of ['filer', 'skotare', 'skotning', 'pris']) {
      await klick(document.querySelector(`[data-mer-rad="${sida}"]`));
      expect(under).toHaveBeenLastCalledWith(sida);
    }
  });

  it('Typ öppnar ett ark med valen; Vem kör visar namnet', async () => {
    const spara = vi.fn(async () => true);
    montera(<Vy spara={spara} />);
    expect(document.querySelector('[data-valj="Skördare"]')!.textContent).toContain('Stefan Karlsson');
    await klick(document.querySelector('[data-uppgift="huvudtyp"]'));
    expect(document.body.querySelector('[role="dialog"]')!.textContent).toContain('Vad är det för jobb?');
    await klick([...document.querySelectorAll('[role="radio"]')].find(r => r.textContent!.includes('Gallring'))!);
    await klick(document.querySelector('[data-spara]'));
    expect(spara).toHaveBeenCalledWith({ huvudtyp: 'Gallring', risskotning: false });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('ObjektOversikt — betalning, skotat och ta bort (2026-10-24)', () => {
  it('Ackord eller Timpeng sparas direkt', async () => {
    const spara = vi.fn(async () => true);
    montera(<Vy spara={spara} />);
    const flik = (t: string) => [...document.querySelectorAll('[data-betalning] [role="tab"]')].find(b => b.textContent === t)!;
    expect(flik('Ackord').getAttribute('aria-selected')).toBe('true');
    await klick(flik('Timpeng'));
    expect(spara).toHaveBeenCalledWith({ timpeng: true });
    expect(flik('Timpeng').getAttribute('aria-selected')).toBe('true');
  });

  it('skördningen klar och lassen säger mindre: ett tryck sätter skotat till skördat', async () => {
    const satt = vi.fn(async () => true);
    montera(<Vy spara={async () => true} start={{ ...SKALVIKEN, skordning_avslutad: '2026-10-14' }} extra={{ skordat: 31, skotat: 0, sattSkotat: satt }} />);
    expect(document.querySelector('[data-skotat-forslag]')!.textContent).toContain('Skotat 0 av 31 m³');
    await klick([...document.querySelectorAll('[data-skotat-forslag] button')].find(b => b.textContent === 'Sätt till 31 m³')!);
    expect(satt).toHaveBeenCalledWith(31);
  });

  it('pågående skördning: inget förslag; satt för hand visas som rad', () => {
    montera(<Vy spara={async () => true} extra={{ skordat: 31, skotat: 0 }} />);
    expect(document.querySelector('[data-skotat-forslag]')).toBeNull();
    act(() => root!.unmount()); root = null; el.remove();
    montera(<Vy spara={async () => true} start={{ ...SKALVIKEN, skordning_avslutad: '2026-10-14', skotad_volym_manuell: 31 }} extra={{ skordat: 31, skotat: 0 }} />);
    expect(document.querySelector('[data-skotat-satt]')!.textContent).toContain('31 m³');
  });

  it('Ta bort frågar först och tar bort först när man bekräftar', async () => {
    const taBort = vi.fn(async () => true);
    montera(<Vy spara={async () => true} extra={{ taBort }} />);
    await klick(document.querySelector('[data-ta-bort]'));
    expect(taBort).not.toHaveBeenCalled();
    expect(text()).toContain('Maskinernas filer finns kvar');
    await klick(document.querySelector('[data-ta-bort-bekrafta]'));
    expect(taBort).toHaveBeenCalled();
  });
});

describe('ObjektLista', () => {
  const g = (nyckel: string, x: Partial<ListGrupp>): ListGrupp => ({ nyckel, namn: nyckel, vo: nyckel, typ: 'Slutavverkning', bolag: 'Vida', pagaende: false, skordningKlar: true, skordat: 100, skotat: 100, ...x });
  const GRUPPER = [
    g('Jätsbygd', { pagaende: true, skordningKlar: false, senasteData: '2026-10-22' }),
    g('Åbogen', { skotningAvslutad: '2026-10-21' }),
    g('Rössmåla', { typ: 'Gallring', skotningAvslutad: '2026-09-12', special: true }),
    g('Tjuvön', { skotningAvslutad: '2026-08-02' }),
  ];

  it('Pågår, senaste månaden öppen, äldre månader fälls ut, typ och sök', async () => {
    const oppna = vi.fn();
    montera(<ObjektLista grupper={GRUPPER} exkluderade={[g('Test', {})]} onOppna={oppna} aldreFiler={{ antal: 3, byten: 0, maskinobjekt: 75 }} onAldreFiler={() => {}} />);
    expect(text()).toContain('Pågår');
    expect(text()).toContain('Oktober 2026');
    expect(document.querySelector('[data-rad="Rössmåla"]')).toBeNull(); // september är hopfälld
    await klick(document.querySelector('[data-manad="2026-09"] button'));
    expect(document.querySelector('[data-rad="Rössmåla"] [data-special]')).not.toBeNull();
    await klick(document.querySelector('[data-rad="Åbogen"]'));
    expect(oppna).toHaveBeenCalledWith('Åbogen');

    await klick([...document.querySelectorAll('[role="tab"]')].find(t => t.textContent === 'Gallring')!);
    expect(document.querySelector('[data-rad="Jätsbygd"]')).toBeNull();
    expect(text()).toContain('September 2026'); // enda månaden står öppen

    await klick([...document.querySelectorAll('[role="tab"]')].find(t => t.textContent === 'Alla')!);
    const sok = document.querySelector('[data-sok]') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(sok, 'tjuv');
      sok.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.querySelector('[data-rad="Tjuvön"]')).not.toBeNull();
    expect(document.querySelector('[data-rad="Åbogen"]')).toBeNull();
    // Matchning finns inte längre; de gamla maskinobjekten ligger tyst under Äldre maskinfiler.
    expect(text()).not.toContain('Matchning');
    expect(document.querySelector('[data-aldre-filer]')!.textContent).toContain('3 filer utan objekt · 75 maskinobjekt utan trakt');
  });
});

describe('ObjektOversikt — ett ark för allt (2026-10-24)', () => {
  it('markägaren rättas i ett eget ark och sparas mot routerns markagare', async () => {
    const spara = vi.fn(async () => true);
    montera(<Vy spara={spara} />);
    await klick(document.querySelector('[data-uppgift="skogsagare"]'));
    const input = document.querySelector('[data-text-falt="skogsagare"]') as HTMLInputElement;
    expect(input.value).toBe('Anna Berg');
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'Bertil Berg'); input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await klick(document.querySelector('[data-spara]'));
    expect(spara).toHaveBeenCalledWith({ markagare: 'Bertil Berg' });
  });

  it('VO-numret frågar en gång till innan det sparas', async () => {
    const spara = vi.fn(async () => true);
    montera(<Vy spara={spara} />);
    await klick(document.querySelector('[data-mer-rad="vo_nummer"]'));
    const input = document.querySelector('[data-text-falt="vo_nummer"]') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, '11999999'); input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await klick(document.querySelector('[data-spara]'));
    expect(spara).not.toHaveBeenCalled();
    expect(document.querySelector('[data-vo-fraga]')!.textContent).toBe('Vill du verkligen ändra VO-numret?');
    expect(text()).toContain('Från 11271860 till 11999999.');
    // Nej tar tillbaka utan att spara.
    await klick([...document.querySelectorAll('button')].find(b => b.textContent === 'Nej, gå tillbaka')!);
    expect(spara).not.toHaveBeenCalled();
    await klick(document.querySelector('[data-spara]'));
    await klick(document.querySelector('[data-vo-bekrafta]'));
    expect(spara).toHaveBeenCalledWith({ vo_nummer: '11999999' });
    expect(document.querySelector('[data-vo-fraga]')).toBeNull();
  });

  it('typbyte med en åtgärd: arket säger att åtgärden töms, och den töms', async () => {
    const spara = vi.fn(async () => true);
    montera(<Vy spara={spara} start={{ ...SKALVIKEN, huvudtyp: 'Gallring', atgard: 'Första gallring' }} />);
    await klick(document.querySelector('[data-uppgift="huvudtyp"]'));
    await klick([...document.querySelectorAll('[role="radio"]')].find(r => r.textContent!.includes('Slutavverkning'))!);
    expect(document.querySelector('[data-val-not]')!.textContent).toContain('Åtgärden "Första gallring" hör till typen och töms');
    await klick(document.querySelector('[data-spara]'));
    expect(spara).toHaveBeenCalledWith({ huvudtyp: 'Slutavverkning', risskotning: false, atgard: '' });
  });

  it('avslutsdatum sätts och tas bort i samma ark', async () => {
    const avslut = vi.fn(async () => true);
    montera(<Vy spara={async () => true} start={{ ...SKALVIKEN, skordning_avslutad: '2026-10-14' }} extra={{ direktSparaAvslut: avslut }} />);
    await klick(document.querySelector('[data-avslut="Skördning"]'));
    expect((document.querySelector('[data-avslut-datum]') as HTMLInputElement).value).toBe('2026-10-14');
    await klick(document.querySelector('[data-avslut-inte]'));
    expect(avslut).toHaveBeenCalledWith('harvester', { skordning_avslutad: null, skordning_avslutad_auto: false, skordning_ej_klar: true, skordning_auto_skal: null });
    expect(document.querySelector('[data-avslut="Skördning"]')!.textContent).toContain('Inte än');
    expect(document.querySelector('[data-avslut="Skördning"]')!.textContent).toContain('Du sa inte klar');
  });

  it('automatikens klar visar varför, och människan kan ta över (2026-10-24)', async () => {
    const avslut = vi.fn(async () => true);
    const skal = 'Giant körde vidare till Skälviken 22 okt';
    // Mölleryd: datumet ligger på skördarens ANDRA rad — klar-läget läses över hela objektet.
    const annan = { ...SKALVIKEN, objekt_id: 'annan', skordning_avslutad: '2026-10-21', skordning_avslutad_auto: true, skordning_auto_skal: skal };
    montera(<Vy spara={async () => true} extra={{ direktSparaAvslut: avslut, gruppRader: [SKALVIKEN, annan] }} />);
    const rad = document.querySelector('[data-avslut="Skördning"]')!;
    expect(rad.getAttribute('data-avslut-lage')).toBe('auto');
    expect(rad.textContent).toContain('Klar 21 okt');
    expect(rad.textContent).toContain(`Automatiskt · ${skal}`);
    await klick(rad);
    expect(document.querySelector('[data-avslut-text]')!.textContent).toBe(`Appen satte klar: ${skal}.`);
    expect(document.querySelector('[data-avslut-appen]')).toBeNull(); // appen avgör redan
    await klick(document.querySelector('[data-avslut-spara]'));
    expect(avslut).toHaveBeenCalledWith('harvester', { skordning_avslutad: '2026-10-21', skordning_avslutad_auto: false, skordning_ej_klar: false, skordning_auto_skal: null });
  });

  it('"Inte klar än" går att ångra med "Låt appen avgöra"', async () => {
    const avslut = vi.fn(async () => true);
    montera(<Vy spara={async () => true} start={{ ...SKALVIKEN, skordning_ej_klar: true }} extra={{ direktSparaAvslut: avslut }} />);
    await klick(document.querySelector('[data-avslut="Skördning"]'));
    expect(document.querySelector('[data-avslut-inte]')).toBeNull();
    expect(document.querySelector('[data-avslut-text]')!.textContent).toContain('Appen sätter inget förrän du väljer');
    await klick(document.querySelector('[data-avslut-appen]'));
    expect(avslut).toHaveBeenCalledWith('harvester', { skordning_avslutad: null, skordning_avslutad_auto: false, skordning_ej_klar: false, skordning_auto_skal: null });
  });

  it('egenskaperna: maskinens fält till maskinens rader, gemensamma till hela gruppen', async () => {
    const spara = vi.fn(async () => true);
    const maskin = vi.fn(async () => true);
    montera(<Vy spara={spara} extra={{ direktSparaMaskin: maskin }} />);
    expect(document.querySelector('[data-mer-rad="egenskaper"]')!.textContent).toContain('Inga');
    await klick(document.querySelector('[data-mer-rad="egenskaper"]'));
    await klick(document.querySelector('[data-egenskap="stubbbehandling"] [role="switch"]'));
    expect(maskin).toHaveBeenCalledWith({ stubbbehandling: true }, 'harvester');
    await klick(document.querySelector('[data-egenskap="extern_skordning"] [role="switch"]'));
    expect(spara).toHaveBeenCalledWith({ extern_skordning: true });
    expect(text()).not.toContain('Inköpare');
    expect(text()).not.toContain('Avverkningsform');
  });
});
