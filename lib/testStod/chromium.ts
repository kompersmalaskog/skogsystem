// EN väg till Chromium för testerna som mäter i en riktig webbläsare (*.hytt.test.ts, *.matt.test.tsx).
//
// Varför en egen fil (2026-11-10): elva tester byggde sökvägen för hand ("chromium-NNNN/chrome-linux/chrome"). Mappen heter
// chrome-linux64 i nyare Playwright, så testerna HOPPADES ÖVER utan att någon märkte det — en skip ser ut som grönt.
// Playwright säger själv var webbläsaren ligger (executablePath); ingen ska bygga sökvägen igen (vakt i chromium.vakt.test.ts).
//
// KRAV_CHROMIUM=1 (sätts i CI-jobbet för webbläsartesterna): saknas Chromium kastar hjälpen i stället för att hoppa över,
// så ett jobb som ska mäta aldrig blir grönt utan att ha mätt.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type Chromium = { launch: (o: object) => Promise<any> };

/** WebGL i programvara — behövs för MapLibre i en webbläsare utan grafikkort. */
export const KARTA_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function lasPlaywright(): any[] {
  const vagar: Array<() => any> = [
    () => createRequire(path.join(process.cwd(), 'package.json'))('playwright'),
    () => createRequire(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'x.js'))('playwright'),
  ];
  const ut: any[] = [];
  for (const v of vagar) { try { ut.push(v()); } catch { /* nästa väg */ } }
  return ut;
}

/** Chromium via Playwright, eller null när det inte finns (testet hoppas då över — utom med KRAV_CHROMIUM=1). */
export function hittaChromium(extraArgs: string[] = []): Chromium | null {
  for (const pw of lasPlaywright()) {
    try {
      const exe = pw.chromium.executablePath();
      if (!exe || !fs.existsSync(exe)) continue;
      return { launch: (o) => pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox', ...extraArgs], ...o }) };
    } catch { /* nästa */ }
  }
  if (process.env.KRAV_CHROMIUM) throw new Error('KRAV_CHROMIUM är satt men Chromium hittades inte (installera med: npx playwright install --with-deps chromium)');
  return null;
}
