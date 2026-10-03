import { describe, it, expect } from 'vitest';
import { hamtaGrotRaw } from './hamta';

// Frågornas kolumnlista är ett TEXTFÄLT: en kolumn som saknas där blir tyst `undefined` i vyn, inte ett fel (PostgREST
// svarar bara med det man bad om). Det här provet läser tillbaka den faktiska select-strängen mot dim_objekt.
function falskKlient() {
  const valda: { tabell: string; kolumner: string }[] = [];
  const kedja: any = new Proxy({}, {
    get: (_t, metod) => (metod === 'range' ? async () => ({ data: [], error: null }) : () => kedja),
  });
  const sb = { from: (tabell: string) => ({ select: (kolumner: string) => { valda.push({ tabell, kolumner }); return kedja; } }) };
  return { sb, valda };
}

describe('hamtaGrotRaw — vilka dim_objekt-kolumner som läses', () => {
  it('markägarens datum och markkrav läses; skälet (grot_skal) gör det inte', async () => {
    const { sb, valda } = falskKlient();
    await hamtaGrotRaw(sb);
    const dim = valda.find((v) => v.tabell === 'dim_objekt');
    expect(dim).toBeTruthy();
    const kolumner = dim!.kolumner.split(',').map((k) => k.trim());
    expect(kolumner).toContain('grot_senast');
    expect(kolumner).toContain('grot_markkrav');
    expect(kolumner).not.toContain('grot_skal');
  });
  it('kolumnerna listan bygger på finns kvar (grot_anpassad, grot_hamtad, skordning_avslutad, skotning_avslutad)', async () => {
    const { sb, valda } = falskKlient();
    await hamtaGrotRaw(sb);
    const kolumner = valda.find((v) => v.tabell === 'dim_objekt')!.kolumner.split(',').map((k) => k.trim());
    ['objekt_id', 'object_name', 'vo_nummer', 'grot_anpassad', 'grot_hamtad', 'exkludera', 'risskotning', 'skordning_avslutad', 'skotning_avslutad']
      .forEach((k) => expect(kolumner).toContain(k));
  });
});
