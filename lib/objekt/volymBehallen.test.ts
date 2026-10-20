import { describe, it, expect } from 'vitest';
import { volymFragor } from './filenGav';
import { saknas } from './tillstand';

const RAD = { nyckel: 'volym_behallen', sort: 'fraga', text: 'x', varde: 3495 };
const BAGSKYTTE = { typ: 'slutavverkning', volym: 1687, areal: 5.68, status: 'avslutat', import_varningar: [RAD], utfall: 1687 };
const nyckel = (o: Record<string, unknown>) => volymFragor({ ...BAGSKYTTE, ...o } as any).map(f => f.nyckel);

describe('omimporten lät en handrättad volym ligga kvar → fråga', () => {
  it('filen sa 3 495, volymen är rättad till 1 687: frågan har båda talen och gäller också en avslutad trakt', () => {
    const f = volymFragor(BAGSKYTTE as any).find(x => x.nyckel === 'volym_behallen')!;
    expect(f.text.replace(/\s/g, ' ')).toContain('Vida skickade 3 495 m³fub');
    expect(f.text.replace(/\s/g, ' ')).toContain('rättad för hand till 1 687 m³fub');
    expect(f.text).toContain('Din volym behölls');
  });

  it('frågan är levande: rättas volymen till filens tal är den avgjord', () => {
    expect(nyckel({ volym: 3495, utfall: null })).not.toContain('volym_behallen');
  });

  it('räknas i listraden', () => {
    expect(saknas({ ...BAGSKYTTE, kalla: 'envz', traktdirektiv_url: 'td.pdf' } as any)).toEqual(['1 fråga']);
  });

  it('en rad utan filens tal (äldre/trasig) ger ingen fråga', () => {
    expect(nyckel({ import_varningar: [{ nyckel: 'volym_behallen', sort: 'fraga', text: 'x' }] })).not.toContain('volym_behallen');
  });
});
