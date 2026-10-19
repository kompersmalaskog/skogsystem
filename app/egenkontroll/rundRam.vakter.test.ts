// Källvakter för RUNDVYNS RAM (huvud, docka, sidokolumn, Rundan-ark). De sju avstegen från planeringsvyn (se RundDock.tsx) är MEDVETNA —
// en vakt som larmar när någon "rättar" dem till planeringens värden är det enda som hindrar det. Testar källan, inte renderingen:
// jsdom kan varken glas, lutning eller långtryck.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROT = new URL('../../', import.meta.url).pathname;
const las = (rel: string) => readFileSync(join(ROT, rel), 'utf8');
/** Utan kommentarer: en vakt som tittar efter ett ord får inte fällas av en kommentar som FÖRKLARAR varför ordet inte finns. */
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const DOCK = 'app/egenkontroll/RundDock.tsx';
const HUVUD = 'components/design/KartHuvud.tsx';
const KNAPP = 'components/design/KartKnapp.tsx';
const KARTA = 'app/egenkontroll/RundKarta.tsx';
const SIDA = 'app/egenkontroll/[objektId]/page.tsx';

describe('de sju avstegen är dokumenterade där ramen bor', () => {
  it('RundDock.tsx har rubriken och alla sju punkterna numrerade 1–7', () => {
    const s = las(DOCK);
    expect(s).toContain('SJU MEDVETNA AVSTEG FRÅN PLANERINGSVYN');
    expect(s).toContain('RÄTTA DEM INTE TILL PLANERINGENS VÄRDEN');
    for (let n = 1; n <= 7; n++) expect(s, `punkt ${n}`).toMatch(new RegExp(`^//\\s+${n}\\. [A-ZÅÄÖ]`, 'm'));
    expect(s).not.toMatch(/^\/\/\s+8\. /m);
  });

  it('huvudet och knappen hänvisar dit', () => {
    expect(las(HUVUD)).toContain('RundDock.tsx');
    expect(las(KNAPP)).toContain('RundDock.tsx');
  });
});

describe('1. täckt yta, inte glas', () => {
  it.each([HUVUD, KNAPP, DOCK])('%s: ingen rgba(), ingen backdrop-filter, ingen genomskinlig bakgrund', (f) => {
    const s = utanKommentarer(las(f));
    expect(s).not.toMatch(/rgba\(/);
    expect(s).not.toMatch(/backdrop-?filter/i);
    expect(s).not.toMatch(/opacity:\s*0?\.\d/);
  });
});

describe('2. inget uppe i hörnen som man behöver', () => {
  it('sidan lägger Lager, Centrera och Notera här i den nedre delen: ovanför dockan (bottom), aldrig med top', () => {
    const s = utanKommentarer(las(SIDA));
    const lager = s.indexOf('<KartKnapp ikon="layers"');
    const sido = s.slice(s.lastIndexOf('<div', lager), s.indexOf('<RundDock'));
    expect(lager).toBeGreaterThan(0);
    expect(sido).toMatch(/bottom: `calc\(\$\{DOCK_BOTTEN\}/);
    expect(sido).not.toMatch(/\btop:/);
  });
});

describe('3. platt och nordupp', () => {
  it('RundKarta: maxPitch 0 och dragRotate av, och ingen kameraflytt sätter pitch eller bearing', () => {
    const s = utanKommentarer(las(KARTA));
    expect(s).toMatch(/maxPitch:\s*0/);
    expect(s).toMatch(/dragRotate:\s*false/);
    expect(s).not.toMatch(/\bpitch:\s*[1-9]/);
    expect(s).not.toMatch(/\bbearing:\s*[^0\s]/);
  });
});

describe('4. inga långtryck och inga draggester på kartan', () => {
  it('varken sidan eller kartan importerar planeringens långtryck, eller lyssnar på contextmenu/touch-håll', () => {
    for (const f of [SIDA, KARTA, DOCK, HUVUD, KNAPP]) {
      const s = utanKommentarer(las(f));
      expect(s, f).not.toMatch(/langtryck/i);
      expect(s, f).not.toMatch(/onContextMenu|contextmenu/);
      expect(s, f).not.toMatch(/setTimeout\([^)]*500\)/);
    }
  });
});

describe('5. få saker samtidigt', () => {
  it('sidan använder inte planeringens PlusRad/PlusArk/KorvyKvitto/NedfaldList/ObjektInfo — bara InfoRam som ram och CentreraKnapp', () => {
    const s = utanKommentarer(las(SIDA));
    for (const namn of ['PlusRad', 'PlusArk', 'KorvyKvitto', 'NedfaldList', 'ObjektInfo', 'KorvyObjektPill']) expect(s, namn).not.toContain(namn);
    expect(s).toContain("from '@/components/planering/InfoRam'");
    expect(s).toContain("from '@/components/planering/CentreraKnapp'");
  });

  it('EN Centrera-knapp (bygg ingen andra) och EN docka', () => {
    const s = utanKommentarer(las(SIDA));
    expect(s.match(/<CentreraKnapp\b/g)?.length).toBe(1);
    expect(s.match(/<RundDock\b/g)?.length).toBe(1);
  });
});

describe('6. allt står still', () => {
  it('ramens egna komponenter har inga animationer eller övergångar (CentreraKnappen är det dokumenterade undantaget)', () => {
    for (const f of [HUVUD, KNAPP, DOCK]) {
      const s = utanKommentarer(las(f));
      expect(s, f).not.toMatch(/transition/);
      expect(s, f).not.toMatch(/animation/);
      expect(s, f).not.toMatch(/tona-(in|opacity)/);
      expect(s, f).not.toMatch(/transform/);
    }
  });

  it('CentreraKnappens bottom-prop är det ENDA som ändrats i den: standardvärdet är planeringens', () => {
    const s = las('components/planering/CentreraKnapp.tsx');
    expect(s).toContain("bottom = 'calc(env(safe-area-inset-bottom, 0px) + 76px)'");
  });
});

describe('7. svarsknapparna ligger utanför kartans tryckyta', () => {
  it('dockan är ett syskon till kartan i sidan, aldrig ett barn till RundKarta', () => {
    const s = utanKommentarer(las(SIDA));
    const ritaKarta = s.indexOf('<RundKarta');
    const slutKarta = s.indexOf('/>', ritaKarta);
    const dockStart = s.indexOf('<RundDock');
    expect(ritaKarta).toBeGreaterThan(0);
    expect(dockStart).toBeGreaterThan(slutKarta);
    // RundKarta är en självstängd tagg: ingenting kan ligga inuti den.
    expect(s.slice(ritaKarta, slutKarta + 2)).not.toContain('<RundDock');
  });
});

describe('ramen i övrigt', () => {
  it('TopBar returnerar null på /egenkontroll/<id> men inte på listan /egenkontroll', () => {
    const s = utanKommentarer(las('components/TopBar.tsx'));
    expect(s).toContain("pathname.startsWith('/egenkontroll/')");
    expect(s).toMatch(/if \(pathname\.startsWith\('\/egenkontroll\/'\)\) return null/);
    expect(s).not.toMatch(/pathname === '\/egenkontroll'\)\s*return null/);
  });

  it('TillbakaTillListan är borta: pilen finns EN gång, i huvudet', () => {
    expect(existsSync(join(ROT, 'app/egenkontroll/TillbakaTillListan.tsx'))).toBe(false);
    expect(las(SIDA)).not.toContain('TillbakaTillListan');
  });

  it('en dock/lista-kopia: listsidan monteras bara när kartan inte visas', () => {
    const s = utanKommentarer(las(SIDA));
    expect(s).toMatch(/\{!kartaSynlig && \(/);
    expect(s).not.toMatch(/display: kartaSynlig \? 'none' : 'block'/);
  });

  it('RundKarta: kartPadding används av alla kameraflytter som ska hamna i den synliga delen (init, vald punkt, centrera)', () => {
    const s = utanKommentarer(las(KARTA));
    expect(s).toMatch(/fitBounds\(b2, \{ padding: padd\(24\)/);
    expect(s).toMatch(/fitBounds\(b, \{ padding: padd\(40\)/);
    expect((s.match(/padding: padd\(0\)/g) ?? []).length).toBe(2);
  });
});
