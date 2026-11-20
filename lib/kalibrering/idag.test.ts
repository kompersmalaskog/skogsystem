import { describe, expect, it } from 'vitest';
import { kontrollerIdag } from './idag';
import type { FaktKalibrering, KontrollTid } from './typer';

const k = (filnamn: string, datum: string) => ({ filnamn, datum } as unknown as FaktKalibrering);
const tid = (dag: string): KontrollTid => ({ forsta: { dag, klockslag: '08:00' }, sista: { dag, klockslag: '08:10' }, urval: [], matare: null });
// onsdag 18 nov 2026; svensk tid = UTC+1
const kl = (h: number, dag = '2026-11-18') => new Date(`${dag}T${String(h - 1).padStart(2, '0')}:30:00Z`);

describe('kontrollerIdag', () => {
  it('räknar dagens kontroller på mättiden, inte filens datum', () => {
    const r = kontrollerIdag([k('a', '2026-11-17'), k('b', '2026-11-18'), k('c', '2026-11-17')], { a: tid('2026-11-18') }, kl(9));
    expect(r.antal).toBe(2);
    expect(r.text).toBe('2 av 2');
    expect(r.sen).toBe(false);
  });
  it('morgonen utan kontroll är inte sent', () => {
    expect(kontrollerIdag([], null, kl(10)).sen).toBe(false);
  });
  it('ingen kontroll efter 11 är orange', () => {
    const r = kontrollerIdag([], null, kl(11));
    expect(r).toMatchObject({ sen: true, under: 'Ingen kontroll än idag', text: '0 av 2' });
  });
  it('en kontroll är okej till 14, sedan "Dags för en till"', () => {
    const en = [k('a', '2026-11-18')];
    expect(kontrollerIdag(en, null, kl(13)).sen).toBe(false);
    expect(kontrollerIdag(en, null, kl(14))).toMatchObject({ sen: true, under: 'Dags för en till' });
  });
  it('två är klart hela dagen', () => {
    expect(kontrollerIdag([k('a', '2026-11-18'), k('b', '2026-11-18')], null, kl(16))).toMatchObject({ sen: false, under: null });
  });
  it('helg är aldrig orange', () => {
    expect(kontrollerIdag([], null, kl(15, '2026-11-21')).sen).toBe(false);
  });
});
