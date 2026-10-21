import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Källvakter för engångskörningen av historiska lass: det som aldrig får finnas i koden, oavsett vad testerna i historik.test.ts råkar köra.

const las = (s: string) => readFileSync(s, 'utf8');
const utanKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

const HISTORIK = utanKommentarer(las('lib/lastbil/lass/historik.ts'));
const TEXT = utanKommentarer(las('lib/lastbil/lass/historikText.ts'));
const SCRIPT = utanKommentarer(las('scripts/lass-historik.ts'));
const FLODE = las('.github/workflows/lass-historik.yml').replace(/^\s*#.*$/gm, '');   // YAML-kommentarer undantagna

describe('historik.ts: aldrig en automatisk flytt, aldrig en push', () => {
  it('nämner varken skapa_flytt_ur_lass, notis_kö, koaNotis eller status auto_flytt (kommentarer undantagna)', () => {
    for (const kod of [HISTORIK, TEXT, SCRIPT]) {
      expect(kod).not.toMatch(/skapa_flytt_ur_lass/);
      expect(kod).not.toMatch(/notis_kö/);
      expect(kod).not.toMatch(/koaNotis/);
      expect(kod).not.toMatch(/auto_flytt/);
      expect(kod).not.toMatch(/besvara_lass|avvisa_lass/);   // appens svar är människans, inte körningens
    }
  });

  it('det enda databasanropet av typen rpc som körningen själv gör är fyll_flytt_ur_lass', () => {
    const rpc = [...HISTORIK.matchAll(/\.rpc\(\s*'([^']+)'/g)].map(m => m[1]);
    expect(rpc).toEqual(['fyll_flytt_ur_lass']);
  });

  it('skriver bara lastbil_lass, och bara med EN upsert (unik nyckel, ignorera dubbletter) — ingen update, insert eller delete', () => {
    expect(HISTORIK.match(/\.upsert\(/g)).toHaveLength(1);
    expect(HISTORIK).toMatch(/onConflict: 'vin,forsta_lastad_tid', ignoreDuplicates: true/);
    expect(HISTORIK).not.toMatch(/\.(update|insert|delete)\(/);
    const skriv = [...HISTORIK.matchAll(/db\.from\('([^']+)'\)\s*\.upsert/g)].map(m => m[1]);
    expect(skriv).toEqual(['lastbil_lass']);
  });

  it('läser bara tabeller cron-jobbet också läser (inga andra)', () => {
    const tabeller = new Set([...HISTORIK.matchAll(/\.from\('([^']+)'\)/g)].map(m => m[1]));
    expect([...tabeller].sort()).toEqual(['dim_maskin', 'flyttplats', 'lastbil', 'lastbil_logg', 'lastbil_lass', 'maskin_flytt', 'objekt'].sort());
  });

  it('skapad_tid sätts till lossningstiden på varje skriven rad (annars plockar cron-jobbets 24-timmarsloop raden och köar en push)', () => {
    expect([...HISTORIK.matchAll(/skapad_tid: l\.lossningTid/g)]).toHaveLength(2);
  });

  it('torrkörning är standard i scriptet och skriv-läget kräver att fel inte funnits', () => {
    expect(SCRIPT).toMatch(/arg\('--lage', 'torrkor'\)/);
    expect(HISTORIK).toMatch(/if \(skriv && !fel\.length\)/);
  });
});

describe('Action: knappen', () => {
  it('startas bara för hand (workflow_dispatch), aldrig på pull_request eller push', () => {
    expect(FLODE).toMatch(/workflow_dispatch:/);
    expect(FLODE).not.toMatch(/pull_request|^\s*push:/m);
  });
  it('torrkör är förvalt, skriv är ett val, och jobbet körs bara från main (servicenyckeln får inte nå annan kod)', () => {
    expect(FLODE).toMatch(/options: \[torrkor, skriv\]\s+default: torrkor/);
    expect(FLODE).toMatch(/if: github\.ref == 'refs\/heads\/main'/);
  });
  it('servicenyckeln är en SECRET (inte en variabel) och indata går via miljön, inte inbakad i kommandot', () => {
    expect(FLODE).toMatch(/SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
    expect(FLODE).toMatch(/--lage "\$LAGE" --fran "\$FRAN" --till "\$TILL"/);
    expect(FLODE).not.toMatch(/--lage \$\{\{/);
  });
});
