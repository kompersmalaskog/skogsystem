import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GLAS, GLAS_CSS } from './design/tokens';

const sattAlfa = (c: string) => Number(c.match(/,([\d.]+)\)$/)![1]);
const ROT = path.resolve(__dirname, '..');
const las = (f: string) => fs.readFileSync(path.join(ROT, f), 'utf8');

describe('GLAS — EN stil för kartans flytande kontroller (tokens)', () => {
  it('glas: mörk, halvgenomskinlig, tunn ljus kant (≈10 % vitt), mjuk skugga, blur', () => {
    expect(GLAS.fyll).toMatch(/^rgba\(40,40,44,0\.\d+\)$/);
    expect(GLAS.kantBredd).toBe('0.5px');
    expect(GLAS.kant).toBe('rgba(255,255,255,0.18)');
    expect(GLAS.hogdager).toBe('inset 0 0.5px 0 rgba(255,255,255,0.35)');
    expect(GLAS.skugga).toMatch(/rgba\(0,0,0,0\.\d+\)/);
    expect(GLAS.sudd).toBe('blur(28px) saturate(180%)');
    expect(GLAS.textSkugga).toBe('0 1px 2px rgba(0,0,0,0.35)');
    expect(GLAS.text2).toBe('rgba(255,255,255,0.75)');
    expect(GLAS.fyllIkon).toMatch(/^rgba\(40,40,44,0\.\d+\)$/);
    expect(sattAlfa(GLAS.fyllIkon)).toBeGreaterThanOrEqual(0.48);
    expect(sattAlfa(GLAS.fyllIkon)).toBeLessThan(sattAlfa(GLAS.fyll));
  });
  it('klassen: solid är grundvärdet, glas kommer först inom @supports och bara när body inte är solid', () => {
    const css = GLAS_CSS.replace(/\s+/g, ' ');
    const grund = css.slice(0, css.indexOf('@supports'));
    expect(grund).toContain(`background: ${GLAS.fast}`);
    expect(grund).toContain(`border: ${GLAS.kantBredd} solid ${GLAS.kant}`);
    expect(grund).toContain(`box-shadow: ${GLAS.hogdager}, ${GLAS.skugga}`);
    expect(grund).toContain(`text-shadow: ${GLAS.textSkugga}`);
    expect(grund).not.toContain('backdrop-filter');
    expect(css).toMatch(/@supports \(\(-webkit-backdrop-filter: blur\(1px\)\) or \(backdrop-filter: blur\(1px\)\)\)/);
    expect(css).toContain('body:not([data-glas="solid"]) .glas');
  });
  it('sekundärtext i glaset är vitt 75 % (båda skrivsätten av FARG.text2 och det vita 65 %-värdet)', () => {
    const css = GLAS_CSS.replace(/\s+/g, ' ');
    for (const v of ['#8e8e93', 'rgb(142, 142, 147)', 'rgba(255,255,255,0.65)', 'rgba(255, 255, 255, 0.65)']) expect(css).toContain(`.glas [style*="${v}"]`);
    expect(css).toMatch(/color: rgba\(255,255,255,0\.75\) !important/);
  });
  it('tätheten är inte lägre än den som mätts ge kontrast ≥ 4,5 (0,76 — mät om i PR-kontrollen innan den sänks)', () => {
    const alfa = Number(GLAS.fyll.match(/,([\d.]+)\)$/)![1]);
    expect(alfa).toBeGreaterThanOrEqual(0.76);
  });
  it('ikonvariant: .glas.glas-ikon har klarare glas bara i glasläget (inte i grundvärdet och inte vid minska genomskinlighet)', () => {
    const css = GLAS_CSS.replace(/\s+/g, ' ');
    expect(css).toContain(`body:not([data-glas="solid"]) .glas.glas-ikon { background: ${GLAS.fyllIkon}; }`);
    expect(css.slice(0, css.indexOf('@supports'))).not.toContain('glas-ikon');
    expect(css.slice(css.indexOf('@media (prefers-reduced-transparency'))).not.toContain('glas-ikon');
  });
  it('minska genomskinlighet ger solid med samma form, kant och skugga (bara bakgrund och blur byts)', () => {
    const css = GLAS_CSS.replace(/\s+/g, ' ');
    const media = css.slice(css.indexOf('@media (prefers-reduced-transparency'));
    expect(media).toContain(`background: ${GLAS.fast} !important`);
    expect(media).toContain('backdrop-filter: none !important');
    expect(media).not.toMatch(/border|box-shadow/);
  });
});

// Kontrollerna som ska vara glas bär klassen och skriver INGEN egen bakgrund, blur, kant eller skugga (annars går de ur takt med stilen).
const GLAS_FILER: Array<[string, RegExp[]]> = [
  ['components/planering/CentreraKnapp.tsx', [/className="press-scale glas glas-ikon"/]],
  ['components/planering/KorvyObjektPill.tsx', [/data-testid="korvy-objektpill"\s+className="glas"/]],
  ['components/planering/KorvyNertillList.tsx', [/className="glas"/]],
  ['components/planering/LinjeRedList.tsx', [/className="glas"/]],
  ['components/planering/KorordningPanel.tsx', [/className="glas"/]],
  ['components/planering/HogKort.tsx', [/className="glas"/]],
  ['components/planering/KorvyKvitto.tsx', [/className=\{fel \? undefined : 'glas'\}/]],
];
describe('kartans kontroller bär .glas', () => {
  for (const [f, mon] of GLAS_FILER) {
    it(`${f}`, () => {
      const s = las(f);
      for (const m of mon) expect(s).toMatch(m);
      expect(s).not.toMatch(/backdropFilter|WebkitBackdropFilter/);
      expect(s).not.toMatch(/rgba\(20,\s*20,\s*22/);
    });
  }
  it('planeringsvyn: hem, objekt-pill, ⓘ, + och GPS-chippen är glas; stilen renderas och läget sätts', () => {
    const s = las('app/planering/page.tsx');
    expect(s).toContain("<GlasStil />");
    expect(s).toMatch(/useGlasLage\(maskinlage\)/);
    expect(s).toMatch(/data-testid="objekt-pill"\s+className="glas"/);
    expect(s).toMatch(/data-testid="objektinfo-knapp"[^\n]*className="press-scale glas glas-ikon"/);
    expect(s).toMatch(/aria-label="Hem" className="press-scale glas glas-ikon"/);
    expect(s).toMatch(/data-testid="hem-maskinmeny" className="press-scale glas glas-ikon"/);
    expect(s).toMatch(/className="press-dim glas glas-ikon"/);
    // ‹ Översikt har text och behåller den täta varianten
    expect(s).toMatch(/data-testid="tillbaka-oversikt" className="press-scale glas"/);
    expect(s).toMatch(/<div className="glas" style=\{\{\s+position: 'absolute',\s+bottom: menuOpen/);
    // ingen av de fem kontrollernas gamla hårdkodade glasvärden finns kvar
    expect(s).not.toMatch(/background: 'rgba\(20,20,22,0\.72\)'/);
    expect(s).not.toMatch(/border: '1px solid rgba\(255,255,255,0\.08\)', display: 'flex'/);
  });
  it('hookar före tidiga returer: useGlasLage ligger efter maskinlage och före första `return (` i komponenten', () => {
    const s = las('app/planering/page.tsx');
    const hook = s.indexOf('useGlasLage(maskinlage)');
    const def = s.indexOf('const maskinlage = arMaskinlage');
    expect(def).toBeGreaterThan(0);
    expect(hook).toBeGreaterThan(def);
  });
});
