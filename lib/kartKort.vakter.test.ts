// Vakt: ALLT man kan trycka på på kartan använder EN kortkomponent (components/planering/KartKort) — egna symboler, linjer och ytor och Vidas objekt.
// Två kort med olika uppbyggnad var felet (Vidas Kraftledning hade inget larmregel-rad, ingen kommentar, inget foto). Sidan får inte bygga ett eget kort igen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sida = readFileSync(join(process.cwd(), 'app/planering/page.tsx'), 'utf8');
const kort = readFileSync(join(process.cwd(), 'components/planering/KartKort.tsx'), 'utf8');

describe('KartKort — en komponent för alla typer', () => {
  it('markeringskortet och Vidas trakt-kort renderas av KartKort', () => {
    expect(sida).toContain("from '../../components/planering/KartKort'");
    expect((sida.match(/<KartKort\b/g) ?? []).length).toBe(2);
    expect(sida).toContain('testid="marker-kort"');
    expect(sida).toContain('testid="trakt-kort"');
  });

  it('båda korten skickar larmregeln ur grupper.ts (larmRegelText) — ingen egen text', () => {
    expect((sida.match(/larmRegel=\{larmRegelText\(/g) ?? []).length).toBe(2);
  });

  it('de gamla kortens egna förklaringsrader (marker-forklaring, trakt-forklaring) och egna kommentarsfält är borta', () => {
    expect(sida).not.toContain('data-testid="marker-forklaring"');
    expect(sida).not.toContain('data-testid="trakt-forklaring"');
    expect(sida).not.toContain('Ingen kommentar\n');
    expect(sida).not.toContain('placeholder="Skriv en anteckning för den här ytan…"');
  });

  it('Vidas objekt: kommentaren och fotot sparas hos oss (sparaAnteckning / ytfoto-flödet), aldrig i Vidas data', () => {
    const trakt = sida.slice(sida.indexOf('const bet = traktKortBetydelse(traktInfo)'));
    expect(trakt).toContain('sparaAnteckning(nyckel!');
    expect(trakt).toContain('ytaFotoInputRef.current?.click()');
    expect(trakt).toContain('sparaYtaMediaText');
    expect(trakt).toContain('raderaYtaMedia');
    expect(trakt).not.toMatch(/objekt_geometri['"`]\)\s*\.\s*(update|upsert|insert)/);
  });

  it('en egen markering sparar kommentaren direkt (minnet först, sedan saveMarkerToDb) och fotot går via samma filväljare som förut', () => {
    const mark = sida.slice(sida.indexOf('testid="marker-kort"'));
    expect(mark).toContain('saveMarkerToDb({ ...marker, comment: t }');
    expect(mark).toContain('setPendingPhotoMarkerId(marker.id); fileInputRef.current?.click()');
  });

  it('komponenten läser gruppen ur grupper.ts och har ingen egen färgtabell', () => {
    expect(kort).toContain("from '@/lib/larm/grupper'");
    expect(kort).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it('kommentaren på ett Vida-objekt kommer in i larmet: sidan skickar kommentarerna till useKorvyLarm', () => {
    expect(sida).toMatch(/kommentarer:\s*vidaKommentarer/);
  });
});
