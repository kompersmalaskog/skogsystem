import { describe, it, expect } from 'vitest';
import { klassificeraDokument } from './dokument';

const B = new Uint8Array(1);
const pdf = (namn: string) => ({ namn, bytes: B });

// Suffixmatchningen NFC-normaliserar en kopia av filnamnet (lib/trakt/dokument.ts, matchNamn). Prod 2026-10-20: de sju `_ÖK.pdf` som ligger som
// "PDF utan känt suffix" är ALLA redan NFC (U+00D6) och hör till avslutade objekt som importerades i augusti av en äldre importversion — dagens kod
// klassar dem rätt, vilket det här testet pinnar för båda kodningarna.
describe('klassificeraDokument — Ö i suffixet, NFC och NFD', () => {
  for (const [etikett, namn] of [['NFC (U+00D6)', '886981_ÖK.pdf'], ['NFD (O + U+0308)', '886981_ÖK.pdf']] as const) {
    it(`_ÖK.pdf som ${etikett} blir översiktskarta, inte "PDF utan känt suffix"`, () => {
      const k = klassificeraDokument([pdf(namn)]);
      expect(k.oversiktskarta?.namn).toBe(namn); // originalnamnet bevaras oförändrat
      expect(k.ovriga).toHaveLength(0);
      expect(k.varningar).toEqual([]);
    });
  }

  it('_TK och _TD matchas, flera blad sorteras på numret', () => {
    const k = klassificeraDokument([pdf('883966_02_TK.pdf'), pdf('883966_01_TK.pdf'), pdf('883966_TD.pdf')]);
    expect(k.traktkartor.map(b => b.ordning)).toEqual([1, 2]);
    expect(k.traktdirektiv?.namn).toBe('883966_TD.pdf');
  });

  it('en okänd PDF blir en varning; ensam okänd + Info som nämner stämplingslängd tolkas som OSÄKER stämplingslängd', () => {
    const a = klassificeraDokument([pdf('Mölleryd.pdf')]);
    expect(a.varningar).toEqual(['PDF utan känt suffix: "Mölleryd.pdf" — sparad som övrigt dokument.']);
    const b = klassificeraDokument([pdf('Skälviken.pdf')], 'Se bifogad stämplingslängd');
    expect(b.stamplingslangdOsaker).toBe(true);
    expect(b.varningar[0]).toMatch(/OSÄKER/);
  });
});
