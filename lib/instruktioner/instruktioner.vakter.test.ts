// Källvakter för "Instruktioner till föraren": bara maskinläget, kartkortet orört, inget ljud, en additiv migration.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const rot = join(__dirname, '..', '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');

function filer(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) filer(p, ut); else if (/\.(ts|tsx)$/.test(n)) ut.push(p);
  }
  return ut;
}

describe('maskinläget — och bara det', () => {
  const sida = las('app/planering/page.tsx');
  it('hooken är aktiv bara i körvy + maskinläge (eller visa-som-maskin)', () => {
    expect(sida).toMatch(/const instruktionerAktiv = korvyActive && \(maskinlage \|\| !!maskinSomParam\);/);
    expect(sida).toMatch(/useInstruktioner\(\{\s*aktiv: instruktionerAktiv,/);
  });
  it('kortet och objektinfons rad visas bara när hooken är aktiv', () => {
    expect(sida).toMatch(/instruktioner: instruktionerAktiv \? \{ data: inst\.paTrakten, onSett: inst\.settOmraden \} : null,/);
    expect(sida).toMatch(/\{korvyActive && inst\.kort && \(\s*<InstruktionKortVy/);
  });
  it('larm och lossningskortet går före: hooken får veta när något av dem visas, och avläggsraden väntar på instruktionen', () => {
    expect(sida).toMatch(/blockerad: instruktionBlockerad\(\{ larmVisas: !!larm\.kort, lossningVisas \}\),/);
    expect(sida).toMatch(/const lossningVisas = skotarLassAktiv && \(!!skotarLass\.kort \|\| !!skotarLass\.andra \|\| !!skotarLass\.nyttAvlagg \|\| skotarKvarOppet \|\| skotarFardigOppet \|\| skotarVantarOppet\);/);
    expect(sida).toMatch(/ledigt=\{avlaggsradLedig\(\{ ledigtUtanInstruktion: [^}]+, instruktionVantar: inst\.vantar \}\)\}/);
  });
  it('testläget skriver inget', () => {
    const start = sida.indexOf('useInstruktioner({');
    const anrop = sida.slice(start, sida.indexOf('\n  });', start));
    expect(anrop).toContain('torr: !!testlage,');
    expect(anrop).toContain('blockerad: instruktionBlockerad(');
  });
  it('ingen annan fil än sidan använder hooken', () => {
    const traffar = [...filer(join(rot, 'app')), ...filer(join(rot, 'components')), ...filer(join(rot, 'lib'))]
      .filter((f) => !/\.test\./.test(f))
      .filter((f) => /import[^;]*useInstruktioner/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(rot.length + 1).replace(/\\/g, '/'));
    expect(traffar).toEqual(['app/planering/page.tsx']);
  });
});

describe('kartkortet rörs inte', () => {
  it('KartKort.tsx importerar ingenting av instruktionerna (hooken, kortet, lib/instruktioner)', () => {
    const k = las('components/planering/KartKort.tsx');
    expect(k).not.toMatch(/from ['"][^'"]*(instruktioner|useInstruktioner|InstruktionKort)[^'"]*['"]/);
    expect(k).not.toMatch(/useInstruktioner|InstruktionKortVy|InstruktionLista/);
  });
  it('sidan markerar "läst" från kartkortet och ⓘ utan att kortet vet om det', () => {
    const sida = las('app/planering/page.tsx');
    expect(sida).toMatch(/traktInfo \? traktKortNyckel : markerMenuOpen != null \? markerNyckel\(markerMenuOpen\) : null/);
    expect(sida).toMatch(/framhavdMarkering \? markerNyckel\(framhavdMarkering\.id\)/);
  });
});

describe('en regel för radbrytning', () => {
  it('instruktionerna använder kartkortets kommentarPunkter (lib/kommentarPunkter), ingen egen uppdelning', () => {
    const k = las('lib/instruktioner/instruktioner.ts');
    expect(k).toContain("from '../kommentarPunkter'");
    expect(k).toContain('kommentarPunkter(text)');
    expect(k).not.toMatch(/\.split\(\/\\r\?\\n\//);
  });
});

describe('inget ljud', () => {
  it('varken kortet eller hooken spelar ljud eller vibrerar på egen hand', () => {
    for (const f of ['components/planering/InstruktionKort.tsx', 'lib/hooks/useInstruktioner.ts', 'lib/instruktioner/instruktioner.ts', 'lib/instruktioner/sett.ts']) {
      const k = las(f);
      expect(k).not.toMatch(/AudioContext|spelaLarmLjud|new Audio|<audio/);
    }
    // Vibrationen är bara knapptryckets lilla kvitto, som larmets Sett — aldrig vid inkörning.
    expect(las('lib/hooks/useInstruktioner.ts')).not.toContain('vibrate');
  });
});

describe('migrationen är additiv', () => {
  const sql = las('supabase/migrations/20261021170000_kommentar_sett_forare.sql').replace(/--.*$/gm, '');
  it('skapar en ny tabell och rör inget befintligt', () => {
    expect(sql).toMatch(/create table if not exists public\.kommentar_sett_forare/i);
    expect(sql).not.toMatch(/\bdrop\b/i);
    expect(sql.replace(/on delete cascade/gi, "")).not.toMatch(/\bdelete\b|\btruncate\b/i);
    const alter = [...sql.matchAll(/alter table\s+(\S+)/gi)].map((m) => m[1]);
    expect(alter).toEqual(['public.kommentar_sett_forare']);
  });
  it('en förare skriver bara sina egna rader och tiden sätts av servern', () => {
    expect(sql).toMatch(/with check \(forare_id = public\.korvy_min_medarbetare\(\)\)/i);
    expect(sql).toMatch(/new\.sett_at := now\(\)/i);
    expect(sql).toMatch(/before insert or update on public\.kommentar_sett_forare/i);
    expect(sql).toMatch(/unique \(objekt_id, forare_id, kommentar_ref\)/i);
  });
  it('klienten skriver mot samma tabell och samma konfliktnyckel', () => {
    const k = las('lib/instruktioner/sett.ts');
    expect(k).toContain("SETT_TABELL = 'kommentar_sett_forare'");
    expect(k).toContain("onConflict: 'objekt_id,forare_id,kommentar_ref'");
    expect(k).not.toContain('sett_at:');   // klienten skickar ingen tid
  });
});
