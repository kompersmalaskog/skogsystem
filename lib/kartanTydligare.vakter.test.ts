// Kartan tydligare (Martin 2026-10-27): sidans koppling till reglagen och spåren. Källvakter — beteendet är prövat i kartBas/lagerOpacitet/LagerReglage-testerna och i kartanTydligare.hytt.test.ts.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const lasa = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const sida = lasa('app/planering/page.tsx');

describe('reglagen är inkopplade i planeringssidan (planering OCH körvy/maskinläge — samma Lager-lista)', () => {
  it('sidan hämtar reglagen ur useKartReglage och bakgrundens styrka sätts på alla fyra baslager via kartBasPaint', () => {
    expect(sida).toMatch(/const kartReglage = useKartReglage\(\);/);
    expect(sida).toMatch(/for \(const l of \['satellite', 'lantmateriet', 'terrain', 'osm'\] as const\) \{[\s\S]{0,200}KARTLAGER_LAGER_ID\[l\][\s\S]{0,260}kartBasPaint\(l, styrkaFor\(kartReglage\.styrkor, l\)\)/);
  });
  it('överläggens värden läggs på kartan av tillampaLagerOpacitet, och effekten ligger EFTER trakt-effekten (så ritade lager har sitt eget värde först)', () => {
    const trakt = sida.indexOf('overlays.traktLamning, mapLibreReady, geoTyper]);');
    const eff = sida.indexOf('tillampaLagerOpacitet(map, kartReglage.lagerOp, skalaMinneRef.current);');
    expect(trakt).toBeGreaterThan(0); expect(eff).toBeGreaterThan(trakt);
  });
  it('Lager-listan: bakgrundsraderna får bakgrundReglage; Overlay- och WMS-raderna får overlayReglage (medOp); Produktionsdata, Dina markeringar och Zon-/Linjetyper får inget', () => {
    expect(sida).toMatch(/reglage: bakgrundReglage\(t\.id, kartReglage\.styrkor, kartReglage\.setStyrka\)/);
    expect(sida).toMatch(/const medOp = \(rad: LagerRad\): LagerRad => \{ const reglage = overlayReglage\(rad\.id, kartReglage\.lagerOp, kartReglage\.setLagerOp\)/);
    expect(sida).toMatch(/rader: overlayLista\.map\(\(o\) => medOp\(vaxel\(/);
    expect(sida).toMatch(/grp\.layers\.filter\(\(l\) => l\.meny !== false\)\.map\(\(l\) => medOp\(vaxel\(/);
    const prod = sida.slice(sida.indexOf("id: 'produktionsdata'"), sida.indexOf("id: 'produktionsdata'") + 1500);
    expect(prod).not.toContain('medOp(');
    const mark = sida.slice(sida.indexOf("id: 'markeringar', rubrik: 'Dina markeringar'"), sida.indexOf("id: 'markeringar', rubrik: 'Dina markeringar'") + 600);
    expect(mark).not.toContain('medOp(');
  });
  it('kartan utan valt objekt får samma styrka som planeringsvyn', () => {
    expect(sida).toMatch(/<ObjektKartaTom kartlager=\{mapType\} kartlagerStyrka=\{styrkaFor\(kartReglage\.styrkor, mapType\)\}/);
  });
  it('reglaget sitter i Lager-arket och ingen annanstans: ingen ny knapp, rad eller ruta på kartan', () => {
    for (const f of ['components/planering/KartKort.tsx', 'components/planering/ObjektInfo.tsx', 'components/planering/KorvyNertillList.tsx']) {
      expect(lasa(f), f).not.toMatch(/useKartReglage|type="range"/);
    }
    expect(lasa('components/planering/PlusArk.tsx')).toMatch(/type="range"/);
  });
});

describe('spåren: smal mörk kant i stället för den dolda ljusa, rollfärger, inga hårdkodade värden i sidan', () => {
  it('alla casing-lager läser kantens färg, bredd och opacitet ur dampatSpar', () => {
    expect(sida).not.toContain('HYTTSPAR_CASING_COLOR');
    expect(sida).not.toMatch(/'line-opacity': 0, 'line-width': dampatSpar/);
    for (const art of ["'skotare', 'hist'", "'skotare', 'egen'", "'skordare', 'andras'"]) {
      expect(sida).toContain(`'line-color': dampatSpar(${art}).kantFarg, 'line-opacity': dampatSpar(${art}).kantOpacitet as any, 'line-width': dampatSpar(${art}).kantBredd`);
    }
    expect(sida).toContain("'line-color': st.kantFarg, 'line-opacity': st.kantOpacitet as any, 'line-width': st.kantBredd");
  });
  it('produktionshögarnas lager är orörda: samma definitioner som före (ingen koppling till reglagen)', () => {
    const hogar = sida.slice(sida.indexOf("id: 'hogar-cluster'"), sida.indexOf("// === GROT-högar (separat lager) ==="));
    expect(hogar).toContain("'circle-color': '#1d9e75'");
    expect(hogar).toContain("'icon-image': ['get', 'pieIcon']");
    expect(hogar).not.toMatch(/kartReglage|lagerOp|laggPaOpacitet/);
  });
});
