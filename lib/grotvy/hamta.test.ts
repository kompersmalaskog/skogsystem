import { describe, it, expect } from 'vitest';
import { hamtaGrotRaw } from './hamta';

// Frågornas kolumnlista är ett TEXTFÄLT: en kolumn som saknas där blir tyst `undefined` i vyn, inte ett fel (PostgREST
// svarar bara med det man bad om). Det här provet läser tillbaka de faktiska select-strängarna.
// En (1) trakt returneras för dim_objekt, så att hämtningen också går vidare och frågar efter objekt-raderna.
function falskKlient() {
  const valda: { tabell: string; kolumner: string }[] = [];
  const sb = {
    from: (tabell: string) => ({
      select: (kolumner: string) => {
        valda.push({ tabell, kolumner });
        const kedja: any = new Proxy({}, {
          get: (_t, metod) => (metod === 'range'
            ? async () => ({ data: tabell === 'dim_objekt' ? [{ objekt_id: 'd1', vo_nummer: 'v1' }] : [], error: null })
            : () => kedja),
        });
        return kedja;
      },
    }),
  };
  return { sb, valda };
}
const kolumnerFor = (valda: { tabell: string; kolumner: string }[], tabell: string) =>
  valda.filter((v) => v.tabell === tabell).map((v) => v.kolumner.split(',').map((k) => k.trim()));

describe('hamtaGrotRaw — vilka kolumner som läses', () => {
  it('dim_objekt: markägarens datum läses; skälet (grot_skal) och det borttagna markkravet (grot_markkrav) gör det inte', async () => {
    const { sb, valda } = falskKlient();
    await hamtaGrotRaw(sb);
    const dim = kolumnerFor(valda, 'dim_objekt');
    expect(dim.length).toBeGreaterThan(0);
    dim.forEach((kol) => {
      expect(kol).toContain('grot_senast');
      expect(kol).not.toContain('grot_skal');
      expect(kol).not.toContain('grot_markkrav');
    });
  });
  it('objekt (planeringen): bärigheten läses — det är planeringens markvillkor GROT-listan visar', async () => {
    const { sb, valda } = falskKlient();
    await hamtaGrotRaw(sb);
    const objekt = kolumnerFor(valda, 'objekt');
    expect(objekt.length).toBeGreaterThan(0); // både FK- och VO-frågan
    objekt.forEach((kol) => {
      expect(kol).toContain('barighet');
      ['id', 'vo_nummer', 'namn', 'typ', 'status', 'lat', 'lng', 'dim_objekt_id'].forEach((k) => expect(kol).toContain(k));
    });
  });
  it('kolumnerna listan bygger på finns kvar (grot_anpassad, grot_hamtad, skordning_avslutad, skotning_avslutad)', async () => {
    const { sb, valda } = falskKlient();
    await hamtaGrotRaw(sb);
    const kolumner = kolumnerFor(valda, 'dim_objekt')[0];
    ['objekt_id', 'object_name', 'vo_nummer', 'grot_anpassad', 'grot_hamtad', 'exkludera', 'risskotning', 'skordning_avslutad', 'skotning_avslutad']
      .forEach((k) => expect(kolumner).toContain(k));
  });
});
