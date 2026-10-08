import { describe, it, expect } from 'vitest';
import { avgorMaskindatorStart, rollAvMaskintyp, implicitJa, IMPLICIT_JA_M, arMaskinlage, visaForarlista } from './maskindatorStart';

describe('rollAvMaskintyp', () => {
  it('Harvester → skördare, Forwarder → skotare', () => {
    expect(rollAvMaskintyp('Harvester')).toBe('skordare');
    expect(rollAvMaskintyp('Forwarder')).toBe('skotare');
  });
  it('okänt/null → null (auto-start slås av)', () => {
    expect(rollAvMaskintyp(null)).toBeNull();
    expect(rollAvMaskintyp('')).toBeNull();
    expect(rollAvMaskintyp('Grävmaskin')).toBeNull();
  });
});

describe('avgorMaskindatorStart — de fyra startfallen', () => {
  const bas = { enhetRoll: 'skotare' as const, harFix: true, posObjektId: null, posTilldelad: false, tilldelatObjektId: null, redanFragat: false };

  it('1. färsk fix, står i TILLDELAT objekt → körvy direkt (loggning utan tryck)', () => {
    const r = avgorMaskindatorStart({ ...bas, posObjektId: 'O1', posTilldelad: true });
    expect(r).toEqual({ typ: 'korvy', objektId: 'O1', roll: 'skotare' });
  });

  it('2. färsk fix, står i EJ tilldelat objekt → bekräftelsekort', () => {
    const r = avgorMaskindatorStart({ ...bas, posObjektId: 'O2', posTilldelad: false });
    expect(r).toEqual({ typ: 'fraga', objektId: 'O2', roll: 'skotare' });
  });

  it('3. ingen färsk fix → maskinens tilldelade objekt (A4)', () => {
    const r = avgorMaskindatorStart({ ...bas, harFix: false, tilldelatObjektId: 'OT' });
    expect(r).toEqual({ typ: 'tilldelat', objektId: 'OT', roll: 'skotare' });
  });

  it('3b. ingen fix och inget tilldelat objekt → listan', () => {
    const r = avgorMaskindatorStart({ ...bas, harFix: false });
    expect(r).toEqual({ typ: 'lista' });
  });

  it('4. färsk fix men UTANFÖR alla objekt → tilldelat objekt om det finns', () => {
    expect(avgorMaskindatorStart({ ...bas, posObjektId: null, tilldelatObjektId: 'OT' }))
      .toEqual({ typ: 'tilldelat', objektId: 'OT', roll: 'skotare' });
    expect(avgorMaskindatorStart({ ...bas, posObjektId: null, tilldelatObjektId: null }))
      .toEqual({ typ: 'lista' });
  });
});

describe('avgorMaskindatorStart — frågas en gång per objekt och maskin', () => {
  const bas = { enhetRoll: 'skotare' as const, harFix: true, posObjektId: 'O2', posTilldelad: false, tilldelatObjektId: null };

  it('första gången (ej tilldelad, ej frågat) → fraga', () => {
    expect(avgorMaskindatorStart({ ...bas, redanFragat: false }).typ).toBe('fraga');
  });

  it('kortet redan visat denna session (ej svar) → logga ändå, INGEN ny fråga', () => {
    const r = avgorMaskindatorStart({ ...bas, redanFragat: true });
    expect(r).toEqual({ typ: 'korvy', objektId: 'O2', roll: 'skotare' });
  });

  it('när maskinen blivit tilldelad (planerare eller Ja) frågas aldrig igen → körvy direkt', () => {
    // Efter Ja/planerar-tilldelning är posTilldelad=true → fall 1, oavsett redanFragat
    expect(avgorMaskindatorStart({ ...bas, posTilldelad: true, redanFragat: false }).typ).toBe('korvy');
    expect(avgorMaskindatorStart({ ...bas, posTilldelad: true, redanFragat: true }).typ).toBe('korvy');
  });
});

describe('avgorMaskindatorStart — ingen maskin bunden', () => {
  it('enhetRoll null → lista (auto-start gäller bara en bunden maskindator)', () => {
    expect(avgorMaskindatorStart({ enhetRoll: null, harFix: true, posObjektId: 'O1', posTilldelad: true, tilldelatObjektId: 'O1', redanFragat: false }))
      .toEqual({ typ: 'lista' });
  });
});

describe('implicitJa — >200 m inne räknas som ja', () => {
  it('tröskeln', () => {
    expect(IMPLICIT_JA_M).toBe(200);
    expect(implicitJa(199.9)).toBe(false);
    expect(implicitJa(200)).toBe(true);
    expect(implicitJa(350)).toBe(true);
  });
});

describe('maskinläge styrs av ENHETEN, inte rollen', () => {
  it('arMaskinlage: serial ELLER testläge', () => {
    expect(arMaskinlage(true, false)).toBe(true);
    expect(arMaskinlage(false, true)).toBe(true);
    expect(arMaskinlage(false, false)).toBe(false);
  });
  it('arMaskinlage: en enhet bunden till en maskin ÄR en maskindator (även utan serial-GPS)', () => {
    expect(arMaskinlage(false, false, 'A130743')).toBe(true);
    expect(arMaskinlage(false, false, null)).toBe(false);
    expect(arMaskinlage(false, false, undefined)).toBe(false);
    expect(arMaskinlage(false, false, '  ')).toBe(false);
  });
  it('visaForarlista: maskinläge → förarlista oavsett roll (kodbevis: admin i testläge)', () => {
    // admin (ej förare) i maskinläge → förarlistan, inte admin-väljaren
    expect(visaForarlista(false, true)).toBe(true);
    // förare utan maskinläge (telefon) → förarlistan
    expect(visaForarlista(true, false)).toBe(true);
    // admin/chef utan maskinläge (telefon/dator) → admin-väljaren
    expect(visaForarlista(false, false)).toBe(false);
  });
});

describe('avgorMaskindatorStart — startobjektet: enheten minns förarens senaste val', () => {
  const bas = { enhetRoll: 'skotare' as const, harFix: false, posObjektId: null, posTilldelad: false, tilldelatObjektId: null, redanFragat: false };

  it('senast valda objekt, ingen fix → starta där (varje gång)', () => {
    expect(avgorMaskindatorStart({ ...bas, senasteObjektId: 'OS' })).toEqual({ typ: 'senaste', objektId: 'OS', roll: 'skotare' });
  });

  it('senast valda slår maskinens tilldelade objekt (planerarens tilldelning är en gissning, förarens val är ett val)', () => {
    expect(avgorMaskindatorStart({ ...bas, tilldelatObjektId: 'OT', senasteObjektId: 'OS' }).typ).toBe('senaste');
    expect(avgorMaskindatorStart({ ...bas, tilldelatObjektId: 'OT' }).typ).toBe('tilldelat');   // utan minne: som förut
  });

  it('en GAMMAL position (sparad/hyttspår) kan inte säga emot ett val som gjordes efter den', () => {
    // harFix=true (position finns) men riktigFix=false: hyttspåret/sparade positionen pekar på ett annat objekt
    expect(avgorMaskindatorStart({ ...bas, harFix: true, riktigFix: false, posObjektId: 'OX', posTilldelad: true, senasteObjektId: 'OS' }))
      .toEqual({ typ: 'senaste', objektId: 'OS', roll: 'skotare' });
  });

  it('RIKTIG fix inne i ett ANNAT objekt → som förut: ej tilldelat = bekräftelsekort, tilldelat = körvy direkt', () => {
    expect(avgorMaskindatorStart({ ...bas, harFix: true, riktigFix: true, posObjektId: 'OX', posTilldelad: false, senasteObjektId: 'OS' }))
      .toEqual({ typ: 'fraga', objektId: 'OX', roll: 'skotare' });
    expect(avgorMaskindatorStart({ ...bas, harFix: true, riktigFix: true, posObjektId: 'OX', posTilldelad: true, senasteObjektId: 'OS' }))
      .toEqual({ typ: 'korvy', objektId: 'OX', roll: 'skotare' });
  });

  it('riktig fix inne i det senast valda objektet → starta där, INGEN fråga (även om maskinen inte är tilldelad)', () => {
    expect(avgorMaskindatorStart({ ...bas, harFix: true, riktigFix: true, posObjektId: 'OS', posTilldelad: false, senasteObjektId: 'OS' }))
      .toEqual({ typ: 'senaste', objektId: 'OS', roll: 'skotare' });
  });

  it('riktig fix UTANFÖR alla objekt → ändrar ingenting: starta på det senast valda', () => {
    expect(avgorMaskindatorStart({ ...bas, harFix: true, riktigFix: true, posObjektId: null, senasteObjektId: 'OS' }).typ).toBe('senaste');
  });

  it('inget minne (avslutat/borttaget/aldrig valt) → som förut', () => {
    expect(avgorMaskindatorStart({ ...bas, senasteObjektId: null }).typ).toBe('lista');
    expect(avgorMaskindatorStart({ ...bas, harFix: true, riktigFix: true, posObjektId: 'OX', senasteObjektId: undefined }).typ).toBe('fraga');
  });

  it('ingen bunden maskin → lista, även med ett minne', () => {
    expect(avgorMaskindatorStart({ ...bas, enhetRoll: null, senasteObjektId: 'OS' })).toEqual({ typ: 'lista' });
  });

  it('rollen följer maskinens roll — en skördare får skördar-roll', () => {
    expect(avgorMaskindatorStart({ ...bas, enhetRoll: 'skordare', senasteObjektId: 'OS' })).toEqual({ typ: 'senaste', objektId: 'OS', roll: 'skordare' });
  });
});

