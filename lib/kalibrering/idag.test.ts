import { describe, expect, it } from 'vitest';
import { kontrollerIdag } from './idag';
import type { FaktKalibrering, KontrollTid } from './typer';

const k = (filnamn: string, datum: string) => ({ filnamn, datum } as unknown as FaktKalibrering);
const tid = (dag: string): KontrollTid => ({ forsta: { dag, klockslag: '08:00' }, sista: { dag, klockslag: '08:10' }, urval: [], matare: null });
// onsdag 18 nov 2026; svensk tid = UTC+1
const kl = (h: number, dag = '2026-11-18') => new Date(`${dag}T${String(h - 1).padStart(2, '0')}:30:00Z`);

describe('kontrollerIdag — en kontrollstam om dagen', () => {
  it('räknar dagens kontroller på mättiden, inte filens datum', () => {
    const r = kontrollerIdag([k('a', '2026-11-17'), k('b', '2026-11-18'), k('c', '2026-11-17')], { a: tid('2026-11-18') }, kl(9));
    expect(r.antal).toBe(2);
    expect(r.text).toBe('Gjord');
    expect(r.sen).toBe(false);
  });
  it('en kontroll räcker hela dagen — aldrig "Dags för en till"', () => {
    const r = kontrollerIdag([k('a', '2026-11-18')], null, kl(16));
    expect(r).toMatchObject({ antal: 1, text: 'Gjord', sen: false, under: null });
  });
  it('morgonen utan kontroll är inte sent', () => {
    expect(kontrollerIdag([], null, kl(10))).toMatchObject({ text: 'Inte än', sen: false, under: null });
  });
  it('ingen kontroll efter 11 är orange', () => {
    expect(kontrollerIdag([], null, kl(11))).toMatchObject({ sen: true, under: 'Ingen kontroll än idag', text: 'Inte än' });
  });
  it('gårdagens kontroll räknas inte idag', () => {
    expect(kontrollerIdag([k('a', '2026-11-17')], null, kl(12))).toMatchObject({ antal: 0, sen: true });
  });
  it('helg är aldrig orange', () => {
    expect(kontrollerIdag([], null, kl(15, '2026-11-21')).sen).toBe(false);
  });
});
