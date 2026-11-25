import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// Källvakter: vägvarningen ritas bara ur lib/tmaVagar (en väg en gång per objekt) och "Återställ en del" drar med grannarna.
const sida = fs.readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8');

describe('vägvarning och återställning i planeringsvyn', () => {
  it('röda vägen, varningslinjen och ⚠ byggs ur samlaVagvarningar — aldrig ur varje delens egna resultat', () => {
    expect(sida).toContain("from '../../lib/tmaVagar'");
    expect(sida).toMatch(/const tmaVagar = samlaVagvarningar\(tmaWithRoads,/);
    expect(sida).toMatch(/tmaVagar\.vagar\.forEach\(/);                       // röd väg: en linje per väg
    expect((sida.match(/tmaVagar\.agareAv\.forEach\(/g) || []).length).toBe(2);   // varningslinjen och ⚠: bara hos ägaren
    // gamla mönstret (en ⚠ och en linje per del) får inte komma tillbaka
    expect(sida).not.toMatch(/tmaWithRoads\.forEach\(\(\[(markerId|bmId), result\]\)/);
  });
  it('en träff bär OSM-vägens id, geometri och nära noder så att delarnas träffar kan slås ihop', () => {
    expect(sida).toMatch(/wayId: way\.id,\s*nearbyIdx: \[\.\.\.nearbySet\]/);
    expect(sida).toMatch(/wayGeom: geom,/);
  });
  it('Radera "bara den här" drar grannkopiorna till Vidas original (ateranslutGrannar) och sparar dem', () => {
    const i = sida.indexOf('const raderaJusterade = ');
    const kropp = sida.slice(i, i + 2800);
    expect(kropp).toContain('ateranslutGrannar(');
    expect(kropp).toContain('if (!alla)');             // bara när en enda del raderas (alla → ingenting att följa)
    expect(kropp).toMatch(/for \(const m of andradeGrannar\.values\(\)\) saveMarkerToDb\(m\)/);
  });
});
