// Vakt: de sju medvetna avstegen från planeringsvyn står som kodkommentarer DÄR de görs, märkta "AVSTEG n/7", med skälet. Försvinner en
// kommentar (någon "lagar" den eller flyttar koden) larmar testet — annars är det nästa person som tror att avvikelsen är ett misstag.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROT = join(__dirname, '..', '..');
const las = (f: string) => readFileSync(join(ROT, f), 'utf8');

const AVSTEG: { n: number; fil: string; ratt: string; nyckel: RegExp }[] = [
  { n: 1, fil: 'app/egenkontroll/RundDock.tsx', ratt: 'dockan med brickor', nyckel: /DOCKAN MED BRICKOR/ },
  { n: 2, fil: 'app/egenkontroll/Bricka.tsx', ratt: 'svarsstatus på varje bricka', nyckel: /SVARSSTATUS PÅ VARJE BRICKA/ },
  { n: 3, fil: 'app/egenkontroll/[objektId]/page.tsx', ratt: 'kartan navigerar inte bort när man svarar', nyckel: /KARTAN NAVIGERAR INTE BORT NAR MAN SVARAR/ },
  { n: 4, fil: 'app/egenkontroll/RundArk.tsx', ratt: 'arket stängs aldrig: dock och hel', nyckel: /ARKET STÄNGS ALDRIG/ },
  { n: 5, fil: 'lib/egenkontrollBricka.ts', ratt: 'katalogdriven, inte redigerbar punktlista', nyckel: /KATALOGDRIVEN OCH INTE REDIGERBAR/ },
  { n: 6, fil: 'app/egenkontroll/[objektId]/page.tsx', ratt: 'avslut i arket, inte i huvudet', nyckel: /AVSLUT LIGGER I ARKET OCH INTE I HUVUDET/ },
  { n: 7, fil: 'app/egenkontroll/BrickaRad.tsx', ratt: 'låstriggern gör vyn helt läsbar', nyckel: /LÅSTRIGGERN GÖR VYN HELT LÄSBAR/ },
];

describe('de sju avstegen från planeringsvyn', () => {
  for (const a of AVSTEG) {
    it(`AVSTEG ${a.n}/7 (${a.ratt}) står som kodkommentar i ${a.fil}, en gång, med sitt skäl`, () => {
      const kod = las(a.fil);
      const traffar = kod.match(new RegExp(`AVSTEG ${a.n}/7`, 'g')) ?? [];
      expect(traffar).toHaveLength(1);
      expect(kod).toMatch(a.nyckel);
      // Skälet följer med: kommentaren är mer än en rubrik (minst fyra kommentarsrader direkt efter markören).
      const i = kod.indexOf(`AVSTEG ${a.n}/7`);
      const efter = kod.slice(i).split('\n').slice(0, 8);
      expect(efter.filter((l) => l.trim().startsWith('//') || l.trim().startsWith('/*') || l.trim().startsWith('*') || l.trim().startsWith('{/*') || /^\s{2,}\S/.test(l)).length).toBeGreaterThanOrEqual(4);
    });
  }

  it('inget AVSTEG-nummer finns i en annan fil än den som äger det (ingen kopia, ingen separat "avsteg.md")', () => {
    for (const a of AVSTEG) {
      for (const andra of new Set(AVSTEG.map((x) => x.fil))) {
        if (andra === a.fil) continue;
        const kod = las(andra);
        // En fil kan äga flera avsteg (page.tsx: 3 och 6) men aldrig ett som hör hemma i en annan.
        if (AVSTEG.some((x) => x.fil === andra && x.n === a.n)) continue;
        expect(kod.includes(`AVSTEG ${a.n}/7`), `${andra} nämner AVSTEG ${a.n}/7`).toBe(false);
      }
    }
  });
});
