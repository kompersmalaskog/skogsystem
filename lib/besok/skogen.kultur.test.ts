import { describe, it, expect } from 'vitest';
import { skogRader, type SkogIndata } from './skogen';
import { SKOG_BILD } from './bilder';

const grund: SkogIndata = { typ: 'slutavverkning', cert: { fsc: true, pefc: true }, arealHa: 3.6, grot: true, evighetstrad: 2, hogstubbar: 1, harEvighetstradPos: false, harHogstubbePos: false, harKantzon: false };
const ids = (d: Partial<SkogIndata>) => skogRader({ ...grund, ...d }).map((r) => r.id);

describe('kulturstubbar på markägarens länk', () => {
  it('bara när trakten har en lämning', () => {
    expect(ids({})).not.toContain('kulturstubbe');
    expect(ids({ harKultur: true })).toEqual(['evighetstrad', 'hogstubbe', 'kulturstubbe', 'toppar', 'ris']);
  });
  it('gäller också en ocertifierad slutavverkning — men inget annat visas där', () => {
    expect(ids({ cert: { fsc: false, pefc: false }, harKultur: true })).toEqual(['kulturstubbe']);
    expect(ids({ cert: { fsc: false, pefc: false } })).toEqual([]);
  });
  it('texten säger brösthöjd och måttet 1,3–1,5 meter', () => {
    const r = skogRader({ ...grund, harKultur: true }).find((x) => x.id === 'kulturstubbe')!;
    expect(r.namn).toBe('Stubbar i brösthöjd');
    expect(r.forklaring).toContain('1,3–1,5 meter');
  });
  it('grova toppar: förklaringen är att de blir ny död ved när riset tas ut', () => {
    expect(skogRader(grund).find((x) => x.id === 'toppar')!.forklaring).toMatch(/riset tas ut.*ny död ved/);
  });
  it('varje rad som kan visas har en bild', () => {
    for (const typ of ['slutavverkning', 'gallring']) for (const r of skogRader({ ...grund, typ, harKultur: true, harKantzon: true, arealHa: 9 })) expect(SKOG_BILD[r.id]).toContain('<svg');
  });
});
