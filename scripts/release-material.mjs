#!/usr/bin/env node
// Råmaterial för changelog-utkastet inför ett släpp. Kör FÖRE du för fram production
// (efter vad-slapps.mjs). Mappar varje osläppt commit (origin/production..origin/main) till sin
// PR via (#NNN), hämtar PR-titel + brödtext med gh, och skriver ut det som UNDERLAG.
//
//   node scripts/release-material.mjs
//
// Skriver INGEN changelog. Du (i Claude-sessionen) skriver om materialet i husstil — för
// FÖRAREN, inte teknikern — och godkänner manuellt. Den mänskliga grinden är hela poängen
// (se regeln överst i lib/changelog.ts). Läser bara git + gh, rör ingenting.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const g = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const ghJson = (nr) => {
  try { return JSON.parse(execSync(`gh pr view ${nr} --json number,title,body`, { encoding: 'utf8' })); }
  catch { return null; }
};

try { g('git fetch --quiet origin main production'); }
catch { console.error('Kunde inte hämta från origin.'); process.exit(1); }

const subjects = g('git log --format=%s origin/production..origin/main').split('\n').filter(Boolean);
if (subjects.length === 0) {
  console.log('\nInget osläppt — production är i kapp main.\n');
  process.exit(0);
}

// PR-nummer ur "(#NNN)" i squash-subjekten, i ordning, deduped.
const prNr = [];
for (const s of subjects) for (const m of s.matchAll(/#(\d+)/g)) if (!prNr.includes(m[1])) prNr.push(m[1]);

// Nuvarande version + bump-hint enligt policyn i changelog.ts (feat → +0.1.0, annars +0.0.1).
let nuvarande = '?';
try {
  const cl = readFileSync(new URL('../lib/changelog.ts', import.meta.url), 'utf8');
  nuvarande = (cl.match(/version:\s*'([^']+)'/) || [])[1] ?? '?';
} catch { /* strunt */ }
const harFeat = subjects.some((s) => /^feat/i.test(s));

console.log('\n=== CHANGELOG-UNDERLAG (origin/production..origin/main) ===');
console.log(`\nNuvarande version: ${nuvarande}`);
console.log(`Bump-hint (policy): ${harFeat ? '+0.1.0 (minst en feat i spannet)' : '+0.0.1 (bara fix/chore)'}  —  versionsnumret är ditt beslut.`);
console.log(`\n${prNr.length} PR i släppet. Råmaterial att skriva om FÖR FÖRAREN:\n`);

for (const nr of prNr) {
  const pr = ghJson(nr);
  console.log('─'.repeat(72));
  if (!pr) { console.log(`#${nr}  (kunde inte hämta — kolla gh/behörighet)`); continue; }
  console.log(`#${pr.number}  ${pr.title}`);
  const body = (pr.body || '').replace(/\r/g, '').split('\n')
    .filter((l) => !/^🤖|Generated with|Co-Authored-By/i.test(l))
    .join('\n').trim();
  if (body) {
    // Första ~6 meningsbärande raderna räcker som underlag.
    const kort = body.split('\n').filter(Boolean).slice(0, 6).join('\n');
    console.log('\n' + kort.split('\n').map((l) => '   ' + l).join('\n'));
  }
  console.log('');
}

// Commits utan PR-referens (direkta main-commits) — får inte tappas.
const utanPr = subjects.filter((s) => !/#\d+/.test(s));
if (utanPr.length) {
  console.log('─'.repeat(72));
  console.log(`\n⚠  ${utanPr.length} commit(s) UTAN PR-referens (direkt till main) — kolla om de ska med:\n`);
  for (const s of utanPr) console.log('   ' + s);
}
console.log('\n' + '─'.repeat(72));
console.log('Nästa steg: be Claude skriva ChangelogEntry:n ur detta (husstil, för föraren),');
console.log('redigera raderna, lägg överst i lib/changelog.ts, committa, för fram production.\n');
