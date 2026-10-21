// Vakter för skördarförslaget i planeringsvyn: P-VO-spärren som gav Max inga produktionshögar får inte komma tillbaka, och förslaget får inte visas för skördarens egen körvy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const page = readFileSync(path.resolve(process.cwd(), 'app/planering/page.tsx'), 'utf-8');

describe('produktionshögar och Kvar att köra för jobb utan Vida-nummer (P-VO)', () => {
  it('högarna ger upp först när vo inte är siffror OCH inga extra nummer finns', () => {
    expect(page).toContain('if (!/^\\d+$/.test(vo) && altNr.length === 0) {');
    expect(page).toContain('const hogarIds = hogarObjektIds(vo, altNr);');
  });
  it('Kvar att köra letar filer under extra nummer även när vo är ett P-VO', () => {
    expect(page).toContain('const altNummer = await hamtaAltNummer(supabase, valtObjekt.id);');
    expect(page).toContain('/^\\d+$/.test(vo) || altNummer.length > 0');
  });
});

describe('förslaget', () => {
  const bit = page.slice(page.indexOf('<SkordarForslag'), page.indexOf('<SkordarForslag') + 900);
  it('visas i skotarläget eller i planeringen, aldrig i skördarens körvy eller maskinläget', () => {
    expect(bit).toContain('(skotarKorvy || (!korvyActive && !maskinlage && !maskinSomParam))');
  });
  it('en koppling läser om högarna och skotarens Kvar', () => {
    expect(bit).toContain('setHogarReload');
    expect(bit).toContain('setSkordarKopplingNr');
    expect(page).toContain('omlasning: skordarKopplingNr,');
  });
  it('ligger inte ovanpå en annan list', () => {
    for (const v of ['!placeraListSynlig', '!figur', '!prickValt', '!plusRadOppen', '!objektListaOppen']) expect(bit).toContain(v);
  });
});
