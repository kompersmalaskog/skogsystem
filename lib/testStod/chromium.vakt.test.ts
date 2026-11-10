// Vakt (2026-11-10): ingen test bygger Chromiums sökväg för hand. Elva tester gjorde det ("chrome-linux/chrome"), mappen hette
// chrome-linux64 och testerna hoppades över i tysthet — fyra av dem hade hunnit bli röda utan att någon såg det.
// Alla webbläsartester går via lib/testStod/chromium.ts (Playwrights egen executablePath).
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const filer = execSync("git ls-files '*.test.ts' '*.test.tsx'", { encoding: 'utf8' }).split('\n').filter(Boolean);

describe('webbläsartesterna hittar Chromium på ett sätt', () => {
  it('ingen test bygger sökvägen till Chromium själv', () => {
    const fel = filer.filter((f) => !f.endsWith('chromium.vakt.test.ts') && /chrome-linux|PLAYWRIGHT_BROWSERS_PATH|pw-browsers/.test(fs.readFileSync(f, 'utf8')));
    expect(fel).toEqual([]);
  });
  it('varje test som startar en webbläsare gör det via hittaChromium', () => {
    const fel = filer.filter((f) => {
      const t = fs.readFileSync(f, 'utf8');
      return /chromium\.launch\(/.test(t) && !/hittaChromium/.test(t);
    });
    expect(fel).toEqual([]);
  });
});
