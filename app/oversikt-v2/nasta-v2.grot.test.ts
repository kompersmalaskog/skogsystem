import { describe, it, expect } from 'vitest';
import { arGrotKo, beraknaForslag, koNamn, type MaskinRad } from './nasta-v2';
import type { MaskinKoItem, OversiktObjekt } from '../oversikt/oversikt-types';

// Minsta möjliga objekt för kö-logiken — resten av OversiktObjekt är opåverkat.
function obj(id: string, status: string, over: Partial<OversiktObjekt> = {}): OversiktObjekt {
  return { id, namn: `Objekt ${id}`, typ: 'slutavverkning', status, lat: 56.5, lng: 14.7, bolag: 'B', ...over } as OversiktObjekt;
}
const ko = (id: string, maskin: string, objekt: string, ordning: number): MaskinKoItem => ({ id, maskin_id: maskin, objekt_id: objekt, ordning });
const skotare: MaskinRad = { maskin_id: 'A030353', maskin_typ: 'Forwarder', skotar_roll: 'allt' };
const skordare: MaskinRad = { maskin_id: 'R64101', maskin_typ: 'Harvester' };

function kor(over: { objekt: OversiktObjekt[]; maskinKo: MaskinKoItem[]; grot?: Set<string> }) {
  return beraknaForslag({
    maskiner: [skotare, skordare], objekt: over.objekt, maskinKo: over.maskinKo, skord: {}, positions: new Map(),
    avstandKm: () => null, grotObjektIds: over.grot,
  });
}
const koIds = (f: ReturnType<typeof kor>, maskin: string) => (f.get(maskin)?.ko ?? []).map((p) => p.objekt.id);

describe('GROT i kön — avslutade objekt göms utom de som väntar på GROT', () => {
  const avslutad = obj('trakt', 'avslutat');
  const pagaende = obj('pag', 'pagaende');
  const rader = [ko('1', 'A030353', 'trakt', 0), ko('2', 'A030353', 'pag', 1)];

  it('utan GROT-mängd: avslutad göms (som förut), pågående syns', () => {
    const f = kor({ objekt: [avslutad, pagaende], maskinKo: rader });
    expect(koIds(f, 'A030353')).toEqual(['pag']);
  });
  it('med GROT-mängd: avslutad trakt i mängden släpps in, i kö-ordning', () => {
    const f = kor({ objekt: [avslutad, pagaende], maskinKo: rader, grot: new Set(['trakt']) });
    expect(koIds(f, 'A030353')).toEqual(['trakt', 'pag']);
    expect(f.get('A030353')!.ko[0].kalla).toBe('ko');
    expect(f.get('A030353')!.manuellKo).toBe(true);
  });
  it('en avslutad trakt som INTE är i mängden göms fortfarande', () => {
    const annan = obj('annan', 'avslutat');
    const f = kor({ objekt: [avslutad, annan], maskinKo: [ko('1', 'A030353', 'trakt', 0), ko('2', 'A030353', 'annan', 1)], grot: new Set(['trakt']) });
    expect(koIds(f, 'A030353')).toEqual(['trakt']);
  });
  it('gäller även skördarens kö (samma koUr)', () => {
    const f = kor({ objekt: [avslutad], maskinKo: [ko('1', 'R64101', 'trakt', 0)], grot: new Set(['trakt']) });
    expect(koIds(f, 'R64101')).toEqual(['trakt']);
  });
  it('mängden släpper aldrig in objekt utan koordinat', () => {
    const utanKoord = obj('trakt', 'avslutat', { lat: null, lng: null });
    const f = kor({ objekt: [utanKoord], maskinKo: [ko('1', 'A030353', 'trakt', 0)], grot: new Set(['trakt']) });
    expect(koIds(f, 'A030353')).toEqual([]);
  });
  it('ett id i mängden som inte finns som objekt ignoreras', () => {
    const f = kor({ objekt: [pagaende], maskinKo: [ko('2', 'A030353', 'pag', 0)], grot: new Set(['spöke']) });
    expect(koIds(f, 'A030353')).toEqual(['pag']);
  });
  it('en GROT-trakt i mängden som INTE ligger i kön dyker inte upp av sig själv', () => {
    const f = kor({ objekt: [avslutad], maskinKo: [], grot: new Set(['trakt']) });
    expect(koIds(f, 'A030353')).toEqual([]);
  });
});

describe('märkning', () => {
  it('avslutad i kö = GROT: namnet märks, övriga orörda', () => {
    expect(arGrotKo(obj('t', 'avslutat'))).toBe(true);
    expect(arGrotKo(obj('t', 'klar'))).toBe(true);
    expect(arGrotKo(obj('t', 'pagaende'))).toBe(false);
    expect(arGrotKo(obj('t', 'planerad'))).toBe(false);
    expect(koNamn(obj('t', 'avslutat', { namn: 'Karstorp 1:8' }))).toBe('Karstorp 1:8 · GROT');
    expect(koNamn(obj('t', 'planerad', { namn: 'Karstorp 1:8' }))).toBe('Karstorp 1:8');
  });
});
