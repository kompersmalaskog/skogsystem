#!/usr/bin/env node
// Vad ligger i main men inte i production? Kör INNAN du för fram production-branchen.
// Visar (1) commits som skulle släppas och (2) — viktigast — vilka MIGRATIONER som tillkommit
// sedan förra releasen. Migrationer måste vara körda i prod-databasen FÖRE production förs fram.
//
//   node scripts/vad-slapps.mjs
//
// Läser bara git (origin/main vs origin/production), rör ingenting.

import { execSync } from 'node:child_process';

const g = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

try {
  g('git fetch --quiet origin main production');
} catch {
  console.error('Kunde inte hämta från origin (kolla nätet/behörighet).');
  process.exit(1);
}

const commits = g('git log --oneline origin/production..origin/main');
const migrationer = g('git diff --name-only origin/production..origin/main -- supabase/migrations/')
  .split('\n').filter(Boolean);

console.log('\n=== VAD SOM SLÄPPS (origin/main → origin/production) ===\n');

if (!commits) {
  console.log('  Inget. production är i kapp main — inget att släppa.\n');
  process.exit(0);
}

const antal = commits.split('\n').length;
console.log(`  ${antal} commit${antal === 1 ? '' : 's'} osläppta:\n`);
console.log(commits.split('\n').map((r) => '    ' + r).join('\n'));

console.log('\n=== MIGRATIONER SEDAN FÖRRA RELEASEN ===\n');
if (migrationer.length === 0) {
  console.log('  Inga nya migrationer. Trygg release.\n');
} else {
  console.log(`  ⚠  ${migrationer.length} migration${migrationer.length === 1 ? '' : 'er'} MÅSTE vara körd${migrationer.length === 1 ? '' : 'a'} i prod-databasen FÖRE du för fram production:\n`);
  for (const m of migrationer) console.log('    ' + m);
  console.log('\n  Additiva (ADD COLUMN IF NOT EXISTS) → kör dem nu, tidigt är alltid säkert.\n');
}
