import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { VAG_BAND_LAGER, VAG_BAND_KALLA } from './vagRisk';

// Källvakter: vägvarningen ritas bara ur lib/tmaVagar (en väg en gång per objekt) och "Återställ en del" drar med grannarna.
const sida = fs.readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8');

describe('vägvarning och återställning i planeringsvyn', () => {
  it('bandet och symbolen byggs ur samlaVagvarningar → byggVagVy — aldrig ur varje delens egna resultat', () => {
    expect(sida).toContain("from '../../lib/tmaVagar'");
    expect(sida).toMatch(/const tmaVagar = useMemo\(\(\) => samlaVagvarningar\(tmaWithRoads,/);
    expect(sida).toMatch(/const vagVy = useMemo\(\(\) => \{[\s\S]{0,1400}return byggVagVy\(tmaVagar\.vagar, tmaRisk, ringar, hinder\);/);   // ETT band och EN symbol per väg, färg ur ägarens riskbedömning; ⚠ utanför ALLA traktytor och fri från andra symboler
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
  it('⚠ placeras mot ALLA traktytor (egna gränser och Vidas ojusterade delar) och väjer för andra symboler (våra, Vidas avlägg, larmplatser)', () => {
    const i = sida.indexOf('const vagVy = useMemo(() => {');
    const kropp = sida.slice(i, i + 1500);
    expect(kropp).toMatch(/m\.lineType === 'boundary'/);                                 // egna traktgränser
    expect(kropp).toContain('traktdelDelar.filter((d) => !justeradeTraktdelar.has(d.partKey)).map((d) => d.ringLatLon)');   // Vidas delar som inte ersatts av en justerad kopia
    expect(kropp).toContain('m.isMarker && !arAlltidPrick(m.type)');                        // våra symboler
    expect(kropp).toContain('klarVidaPunkter');                                              // Vidas avlägg
    expect(kropp).toContain('larmPunkterAlla');                                              // larmplatser
  });
  it('objektinfon får en rad per väg (kort, förarens kort och Hela trakten) — och ⓘ stängs när riskbedömningen öppnas', () => {
    expect(sida).toMatch(/const vagarInfo = vagVy\.rader\.length \? \{ rader: vagVy\.rader, onOppna: \(agare: string\) => \{ stang\(\); setTmaOpen\(agare\); \} \} : null;/);
    expect((sida.match(/vagar: vagarInfo,/g) || []).length).toBe(3);   // kort, enkel (maskinens kort) och oversikt (Hela trakten)
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
