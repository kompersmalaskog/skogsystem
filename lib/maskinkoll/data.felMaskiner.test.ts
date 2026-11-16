import { describe, expect, it } from 'vitest';
import { felMaskiner } from './data';

const reg = [
  { maskin_id: 'R64428', visningsnamn: 'H8E -26', maskin_typ: 'Harvester' },
  { maskin_id: 'A030353', visningsnamn: 'Wisent', maskin_typ: 'Forwarder' },
  { maskin_id: 'R64101', visningsnamn: 'H8E -23', maskin_typ: 'Harvester', aktiv_till: '2026-03-11' },
  { maskin_id: 'LB1', visningsnamn: 'Lastbil', maskin_typ: 'Truck' },
  { maskin_id: 'PONS', visningsnamn: 'Giant', maskin_typ: 'Harvester' },
];

describe('felMaskiner', () => {
  it('aktiva skördare och skotare på namn; avslutade och okänd typ är inte med', () => {
    expect(felMaskiner(reg, null, '2026-11-10').map(m => m.namn)).toEqual(['Giant', 'H8E -26', 'Wisent']);
  });
  it('den egna maskinen först, också när typen är okänd', () => {
    expect(felMaskiner(reg, 'A030353', '2026-11-10').map(m => m.id)).toEqual(['A030353', 'PONS', 'R64428']);
    expect(felMaskiner(reg, 'LB1', '2026-11-10')[0]).toEqual({ id: 'LB1', namn: 'Lastbil', typ: 'Truck', modell: null });
  });
});
