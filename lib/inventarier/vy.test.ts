import { describe, expect, it } from 'vitest';
import type { Artikel, Inventarier, InvRad, Plats } from './typer';
import {
  antalAttBestalla, artikelForslag, artikelTitel, attBestalla, forslagKommitIn, heltal, hyllGrupper, kolladText,
  platsGrupper, platsText, sitterPaForslag, sok, underText, visadeRader,
} from './vy';

const plats = (id: string, namn: string, typ: Plats['typ'], extra: Partial<Plats> = {}): Plats => ({
  id, namn, typ, maskin_id: null, ansvarig_medarbetare_id: null, senast_kollad: null, senast_kollad_av: null, ordning: 0, aktiv: true, ...extra,
});
const artikel = (id: string, namn: string, typ: Artikel['typ'], extra: Partial<Artikel> = {}): Artikel => ({
  id, namn, typ, enhet: 'st', leverantor: null, artikelnr: null, anteckning: null, aktiv: true, maskin_id: null, sitter_pa: null, ...extra,
});
const rad = (id: string, artikel_id: string, plats_id: string, extra: Partial<InvRad> = {}): InvRad => ({
  id, artikel_id, plats_id, hylla: null, antal: null, min_antal: null, bestalld_tid: null, uppdaterad: '2026-10-21T10:00:00Z', tva_lador: false, reserv_oppnad_tid: null, reserv_oppnad_av: null, ...extra,
});

function inv(): Inventarier {
  return {
    platser: [
      plats('hall', 'Maskinhallen', 'hall', { ordning: 1 }),
      plats('lbc', 'LBC Ryd', 'verkstad', { ordning: 2 }),
      plats('bil-s', 'Stefans bil', 'bil', { ansvarig_medarbetare_id: 'stefan' }),
      plats('bil-o', 'Oskars bil', 'bil', { ansvarig_medarbetare_id: 'oskar' }),
      plats('skap-w', 'Depåskåp Wisent', 'skap', { maskin_id: 'A030353' }),
    ],
    artiklar: [
      artikel('kedja', 'Sågkedja 3/8 .404', 'forbrukning'),
      artikel('olja', 'Hydraulolja 20 L', 'forbrukning', { enhet: 'dunk' }),
      artikel('svard', 'Svärd 75 cm', 'forbrukning'),
      artikel('mutter', 'Mutterknackare', 'utrustning'),
      artikel('slang-w', 'Hydraulslang', 'utrustning', { maskin_id: 'A030353', sitter_pa: 'Hjularm vänster' }),
      artikel('slang-g', 'Hydraulslang', 'utrustning', { maskin_id: 'GIANT', sitter_pa: 'Hjularm vänster' }),
    ],
    rader: [
      rad('r-kedja', 'kedja', 'hall', { antal: 2, min_antal: 6, hylla: '3' }),
      rad('r-olja', 'olja', 'hall', { antal: 1, min_antal: 3 }),
      rad('r-svard', 'svard', 'hall', { antal: 0, min_antal: 2, bestalld_tid: '2026-10-21T08:00:00Z' }),
      rad('r-mutter', 'mutter', 'bil-s'),
      rad('r-slang-w', 'slang-w', 'hall', { hylla: 'Slanghyllan' }),
      rad('r-slang-g', 'slang-g', 'lbc'),
    ],
    maskiner: [
      { maskin_id: 'A030353', visningsnamn: 'Wisent', maskin_typ: 'Forwarder', aktiv: true },
      { maskin_id: 'GIANT', visningsnamn: 'Giant', maskin_typ: 'Harvester', aktiv: true },
    ],
    personer: [],
  };
}

describe('texter', () => {
  it('sitter på följer namnet', () => {
    expect(artikelTitel({ namn: 'Hydraulslang', sitter_pa: 'Hjularm vänster' })).toBe('Hydraulslang · Hjularm vänster');
    expect(artikelTitel({ namn: 'Mutterknackare', sitter_pa: null })).toBe('Mutterknackare');
  });
  it('hylla som bara är ett nummer skrivs "hylla 3", annat som det står', () => {
    expect(platsText({ namn: 'Maskinhallen' }, '3')).toBe('Maskinhallen · hylla 3');
    expect(platsText({ namn: 'Maskinhallen' }, 'Slanghyllan')).toBe('Maskinhallen · Slanghyllan');
    expect(platsText({ namn: 'Maskinhallen' }, null)).toBe('Maskinhallen');
  });
  it('raden under: maskin · plats', () => {
    const v = visadeRader(inv()).find(x => x.rad.id === 'r-slang-w')!;
    expect(underText(v)).toBe('Wisent · Maskinhallen · Slanghyllan');
  });
});

describe('att beställa', () => {
  it('ej beställda först, längst under min först; beställda sist', () => {
    const lista = attBestalla(visadeRader(inv())).map(v => v.rad.id);
    expect(lista).toEqual(['r-kedja', 'r-olja', 'r-svard']);
  });
  it('talet räknar bara det som inte redan är beställt', () => {
    expect(antalAttBestalla(visadeRader(inv()))).toBe(2);
  });
  it('utrustning och rader utan minnivå är aldrig att beställa', () => {
    const i = inv();
    i.rader.push(rad('r-utan-min', 'kedja', 'lbc', { antal: 0, min_antal: null }));
    expect(attBestalla(visadeRader(i)).map(v => v.rad.id)).not.toContain('r-utan-min');
    expect(attBestalla(visadeRader(i)).map(v => v.rad.id)).not.toContain('r-mutter');
  });
  it('exakt på min är inte under min', () => {
    const i = inv();
    i.rader[0].antal = 6;
    expect(attBestalla(visadeRader(i)).map(v => v.rad.id)).not.toContain('r-kedja');
  });
  it('kommit in föreslår upp till minnivån, minst 1', () => {
    expect(forslagKommitIn({ antal: 2, min_antal: 6 })).toBe(4);
    expect(forslagKommitIn({ antal: 6, min_antal: 6 })).toBe(1);
  });
});

describe('sök', () => {
  const rader = visadeRader(inv());
  it('hittar mutterknackaren i Stefans bil på "mutter"', () => {
    const t = sok(rader, 'mutter');
    expect(t.map(v => v.rad.id)).toEqual(['r-mutter']);
    expect(t[0].plats.namn).toBe('Stefans bil');
  });
  it('"hjularm" hittar båda slangarna, "wisent hjularm" bara Wisents', () => {
    expect(sok(rader, 'hjularm').map(v => v.rad.id).sort()).toEqual(['r-slang-g', 'r-slang-w']);
    expect(sok(rader, 'wisent hjularm').map(v => v.rad.id)).toEqual(['r-slang-w']);
  });
  it('versaler och å/ä/ö spelar ingen roll', () => {
    expect(sok(rader, 'SÅGKEDJA').map(v => v.rad.id)).toEqual(['r-kedja']);
  });
  it('tom sökning ger inga träffar (då visas platserna)', () => {
    expect(sok(rader, '   ')).toEqual([]);
  });
});

describe('platser', () => {
  it('hall och verkstad först, bilar med min egen först, sist depåskåp', () => {
    const g = platsGrupper(inv().platser, 'oskar');
    expect(g.map(x => x.rubrik)).toEqual(['Hall och verkstad', 'Bilar', 'Depåskåp']);
    expect(g[0].platser.map(p => p.id)).toEqual(['hall', 'lbc']);
    expect(g[1].platser.map(p => p.id)).toEqual(['bil-o', 'bil-s']);
  });
  it('en tom grupp visas inte', () => {
    const p = inv().platser.filter(x => x.typ !== 'skap');
    expect(platsGrupper(p, null).map(x => x.rubrik)).toEqual(['Hall och verkstad', 'Bilar']);
  });
  it('aldrig kollad och äldre än 60 dagar är gammal; färskare är det inte', () => {
    const nu = new Date('2026-10-21T12:00:00Z');
    expect(kolladText({ senast_kollad: null }, null, nu)).toEqual({ text: 'Aldrig kollad', gammal: true });
    expect(kolladText({ senast_kollad: '2026-07-02T10:00:00Z' }, 'Stefan Karlsson', nu))
      .toEqual({ text: 'Senast kollad 2 jul av Stefan', gammal: true });
    expect(kolladText({ senast_kollad: '2026-10-14T10:00:00Z' }, null, nu))
      .toEqual({ text: 'Senast kollad 14 okt', gammal: false });
  });
  it('grupperar på hylla bara när någon rad har hylla; utan hylla sist', () => {
    const hall = visadeRader(inv()).filter(v => v.plats.id === 'hall');
    expect(hyllGrupper(hall, 'hall').map(g => g.rubrik)).toEqual(['Hylla 3', 'Slanghyllan', 'Utan hylla']);
    const bil = visadeRader(inv()).filter(v => v.plats.id === 'bil-s');
    expect(hyllGrupper(bil, 'bil').map(g => g.rubrik)).toEqual(['I bilen']);
  });
});

describe('lägg till', () => {
  it('föreslår befintliga artiklar medan man skriver (minst två tecken)', () => {
    const a = inv().artiklar;
    expect(artikelForslag(a, 'm')).toEqual([]);
    expect(artikelForslag(a, 'mutt').map(x => x.id)).toEqual(['mutter']);
  });
  it('sitter på föreslås bara för SAMMA maskin', () => {
    const a = inv().artiklar;
    expect(sitterPaForslag(a, 'A030353', 'hjul')).toEqual(['Hjularm vänster']);
    expect(sitterPaForslag(a, null, 'hjul')).toEqual([]);
  });
  it('heltal: bara siffror', () => {
    expect(heltal('6')).toBe(6);
    expect(heltal(' 12 ')).toBe(12);
    expect(heltal('1,5')).toBeNull();
    expect(heltal('')).toBeNull();
    expect(heltal('-1')).toBeNull();
  });
});
