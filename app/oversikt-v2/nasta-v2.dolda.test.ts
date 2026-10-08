import { describe, it, expect } from 'vitest';
import { beraknaForslag, markeraOkanda, type MaskinRad } from './nasta-v2';
import type { MaskinKoItem, OversiktObjekt } from '../oversikt/oversikt-types';
import type { PlatsForslag } from '../maskinflytt/senastePlats';

// doldaAvslutade = hur många rader i en SKOTARES kö som göms för att objektet är avslutat och inte släpps in av GROT-listan.
// Utan GROT-listan (läsfel) kan det gömda vara GROT-trakter — då säger maskinen det i stället för "inget planerat".

function obj(id: string, status: string, over: Partial<OversiktObjekt> = {}): OversiktObjekt {
  return { id, namn: `Objekt ${id}`, typ: 'slutavverkning', status, lat: 56.5, lng: 14.7, bolag: 'B', ...over } as OversiktObjekt;
}
const ko = (id: string, maskin: string, objekt: string, ordning: number): MaskinKoItem => ({ id, maskin_id: maskin, objekt_id: objekt, ordning });
const skotare: MaskinRad = { maskin_id: 'A030353', maskin_typ: 'Forwarder', skotar_roll: 'allt' };
const skordare: MaskinRad = { maskin_id: 'R64101', maskin_typ: 'Harvester' };

function kor(over: { objekt: OversiktObjekt[]; maskinKo: MaskinKoItem[]; grot?: Set<string>; positions?: Map<string, PlatsForslag> }) {
  return beraknaForslag({
    maskiner: [skotare, skordare], objekt: over.objekt, maskinKo: over.maskinKo, skord: {}, positions: over.positions ?? new Map(),
    avstandKm: () => null, grotObjektIds: over.grot,
  });
}

describe('doldaAvslutade — rader i skotarens kö som göms för att objektet är avslutat', () => {
  const avslutad = obj('trakt', 'avslutat');
  const pagaende = obj('pag', 'pagaende');

  it('en avslutad rad utan GROT-mängd: gömd och räknad', () => {
    const f = kor({ objekt: [avslutad, pagaende], maskinKo: [ko('1', 'A030353', 'trakt', 0), ko('2', 'A030353', 'pag', 1)] });
    expect(f.get('A030353')!.ko.map((p) => p.objekt.id)).toEqual(['pag']);
    expect(f.get('A030353')!.doldaAvslutade).toBe(1);
  });

  it('två avslutade rader → 2', () => {
    const f = kor({ objekt: [avslutad, obj('t2', 'avslutat')], maskinKo: [ko('1', 'A030353', 'trakt', 0), ko('2', 'A030353', 't2', 1)] });
    expect(f.get('A030353')!.doldaAvslutade).toBe(2);
  });

  it('släpps raden in av GROT-mängden är den inte gömd → ingen räkning', () => {
    const f = kor({ objekt: [avslutad], maskinKo: [ko('1', 'A030353', 'trakt', 0)], grot: new Set(['trakt']) });
    expect(f.get('A030353')!.ko.map((p) => p.objekt.id)).toEqual(['trakt']);
    expect(f.get('A030353')!.doldaAvslutade).toBeUndefined();
  });

  it('bara den GROT-mängden inte släpper in räknas', () => {
    const f = kor({ objekt: [avslutad, obj('annan', 'avslutat')], maskinKo: [ko('1', 'A030353', 'trakt', 0), ko('2', 'A030353', 'annan', 1)], grot: new Set(['trakt']) });
    expect(f.get('A030353')!.doldaAvslutade).toBe(1);
  });

  it('en kö utan avslutade rader har inget fält alls (oförändrad form)', () => {
    const f = kor({ objekt: [pagaende], maskinKo: [ko('1', 'A030353', 'pag', 0)] });
    expect('doldaAvslutade' in f.get('A030353')!).toBe(false);
  });

  it('en rad gömd av något annat än "avslutad" (saknar koordinat) räknas inte', () => {
    const f = kor({ objekt: [obj('utan', 'planerad', { lat: null, lng: null })], maskinKo: [ko('1', 'A030353', 'utan', 0)] });
    expect(f.get('A030353')!.doldaAvslutade).toBeUndefined();
  });

  it('raden för objektet maskinen står på räknas inte (där gömmer sig inget — maskinen är redan där)', () => {
    const pos = new Map<string, PlatsForslag>([['A030353', { namn: 'Trakt', koordinat: { lat: 56.5, lng: 14.7 }, objektId: 'trakt', platsId: null, tidpunkt: '2026-10-07', kalla: 'produktion', osaker: null } as PlatsForslag]]);
    const f = kor({ objekt: [avslutad, obj('annan', 'avslutat')], maskinKo: [ko('1', 'A030353', 'trakt', 0), ko('2', 'A030353', 'annan', 1)], positions: pos });
    expect(f.get('A030353')!.doldaAvslutade).toBe(1); // bara "annan"
  });

  it('ett avslutat objekt utan koordinat räknas inte (det göms oavsett GROT-listan)', () => {
    const f = kor({ objekt: [obj('utan', 'avslutat', { lat: null, lng: null })], maskinKo: [ko('1', 'A030353', 'utan', 0)] });
    expect(f.get('A030353')!.doldaAvslutade).toBeUndefined();
  });

  it('en rad för ett objekt som inte finns räknas inte', () => {
    const f = kor({ objekt: [], maskinKo: [ko('1', 'A030353', 'spöke', 0)] });
    expect(f.get('A030353')!.doldaAvslutade).toBeUndefined();
  });

  it('bara skotare: en skördares gömda avslutade rader räknas inte (de är kvarlevor)', () => {
    const f = kor({ objekt: [avslutad], maskinKo: [ko('1', 'R64101', 'trakt', 0)] });
    expect('doldaAvslutade' in f.get('R64101')!).toBe(false);
  });

  it('andra maskiners rader räknas inte', () => {
    const f = kor({ objekt: [avslutad], maskinKo: [ko('1', 'ANNAN', 'trakt', 0)] });
    expect(f.get('A030353')!.doldaAvslutade).toBeUndefined();
  });

  it('räkningen ändrar inte vad som visas: samma rader som förut', () => {
    const f = kor({ objekt: [avslutad, pagaende], maskinKo: [ko('1', 'A030353', 'trakt', 0), ko('2', 'A030353', 'pag', 1)] });
    expect(f.get('A030353')!.ko.map((p) => p.objekt.id)).toEqual(['pag']);
    expect(f.get('A030353')!.manuellKo).toBe(true);
  });
});

describe('GROT-läsningen felade (markeraOkanda grot) — en skotare vars gömda rader kan vara GROT säger det', () => {
  const avslutad = obj('trakt', 'avslutat');
  const lasFel = { ko: false, skord: false, pos: false, grot: true };

  it('skotare utan synliga rader men med gömd avslutad rad → okand = grot', () => {
    const f = kor({ objekt: [avslutad], maskinKo: [ko('1', 'A030353', 'trakt', 0)] });
    const ut = markeraOkanda(f, lasFel);
    expect(ut.get('A030353')!.okand).toBe('grot');
    expect(ut.get('A030353')!.doldaAvslutade).toBe(1);
  });

  it('skotare utan kö alls har inget att sakna → inte okänd ("inget planerat" är sant)', () => {
    const f = kor({ objekt: [avslutad], maskinKo: [] });
    expect(markeraOkanda(f, lasFel).get('A030353')!.okand).toBeUndefined();
  });

  it('skotare med en synlig rad → inte okänd (raden visas; arket noterar det gömda)', () => {
    const f = kor({ objekt: [avslutad, obj('pag', 'pagaende')], maskinKo: [ko('1', 'A030353', 'trakt', 0), ko('2', 'A030353', 'pag', 1)] });
    const ut = markeraOkanda(f, lasFel);
    expect(ut.get('A030353')!.okand).toBeUndefined();
    expect(ut.get('A030353')!.ko).toHaveLength(1);
    expect(ut.get('A030353')!.doldaAvslutade).toBe(1);
  });

  it('en skördare rörs inte', () => {
    const f = kor({ objekt: [avslutad], maskinKo: [ko('1', 'R64101', 'trakt', 0)] });
    expect(markeraOkanda(f, lasFel).get('R64101')!.okand).toBeUndefined();
  });

  it('utan GROT-fel är en gömd rad bara en gömd rad', () => {
    const f = kor({ objekt: [avslutad], maskinKo: [ko('1', 'A030353', 'trakt', 0)] });
    expect(markeraOkanda(f, { ko: false, skord: false, pos: false, grot: false })).toBe(f);
  });
});
