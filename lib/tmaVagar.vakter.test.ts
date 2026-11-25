import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { VAG_BAND_LAGER, VAG_BAND_KALLA } from './vagRisk';

// Källvakter: vägvarningen ritas bara ur lib/tmaVagar (en väg en gång per objekt) och "Återställ en del" drar med grannarna.
const sida = fs.readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8');

describe('vägvarning och återställning i planeringsvyn', () => {
  it('bandet och symbolen byggs ur samlaVagvarningar → byggVagVy — aldrig ur varje delens egna resultat', () => {
    expect(sida).toContain("from '../../lib/tmaVagar'");
    expect(sida).toMatch(/const tmaVagar = useMemo\(\(\) => samlaVagvarningar\(tmaWithRoads,/);
    expect(sida).toMatch(/const vagVy = useMemo\(\(\) => byggVagVy\(tmaVagar\.vagar, tmaRisk,/);   // ETT band och EN symbol per väg, färg ur ägarens riskbedömning
    expect(sida).toMatch(/features: vagVy\.band/);
    expect(sida).toMatch(/vagVy\.symboler\.forEach\(/);
    // gamla mönstret (en ⚠ och en linje per del, pulserande gräns) får inte komma tillbaka
    expect(sida).not.toMatch(/tmaWithRoads\.forEach\(\(\[(markerId|bmId), result\]\)/);
    expect(sida).not.toMatch(/tmaVagar\.agareAv\.forEach\(/);
    expect(sida).not.toContain('tma-warning');
    expect(sida).not.toContain('tma-roads-glow');
    expect(sida).not.toContain('tma-roads-line');
  });
  it('bandet ligger i körvyns lager-whitelist (maskinvyn visar samma band) och symbolen byggs av byggVagSymbolElement på vägen', () => {
    const kept = /const KEEP_PREFIX = \[([^\]]*)\]/.exec(sida)![1];
    const prefix = [...kept.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(prefix.some((p) => VAG_BAND_LAGER.startsWith(p)), `${VAG_BAND_LAGER} måste börja på ett prefix i KEEP_PREFIX`).toBe(true);
    expect(sida).toContain('map.addLayer({ id: VAG_BAND_LAGER');
    expect(sida).toContain('paint: vagBandPaint()');
    expect(sida).toContain("safeSetVisibility(VAG_BAND_LAGER,");
    expect(sida).toMatch(/const el = byggVagSymbolElement\(sym,/);
    expect(sida).toMatch(/setLngLat\(\[sym\.pos\.lon, sym\.pos\.lat\]\)/);   // symbolen ligger på vägen (byggVagVy), inte på gränsen
    expect(VAG_BAND_KALLA).toBe('tma-roads-source');
  });
  it('traktgränsen har ingen varning kvar: inget pulserande lager, ingen träfflinje, ingen requestAnimationFrame för TMA', () => {
    expect(sida).not.toMatch(/tma-warning/);
    expect(sida).not.toMatch(/Math\.sin\(t\);\s*\/\/ oscillerar/);
    expect(sida).not.toMatch(/nearCoords/);
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
