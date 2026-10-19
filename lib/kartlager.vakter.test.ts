// Kartlagret per användare: källvakter för kopplingen i planeringssidan och migrationen. Beteendet testas i useKartlager.test.tsx och kartlager.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const rot = join(__dirname, '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');
const page = las('app/planering/page.tsx');

describe('kartlagret per användare: planeringssidan', () => {
  it('mapType kommer ur useKartlager (konto + enhet, Flygfoto som standard) — inte ett eget useState med Karta som standard', () => {
    expect(page).toContain('const [mapType, setMapType] = useKartlager();');
    expect(page).not.toMatch(/useState<'osm' \| 'satellite' \| 'terrain' \| 'lantmateriet'>\('lantmateriet'\)/);
  });
  it('körvyn följer SAMMA lager: ingen egen osparad baskarta, körvyns whitelist visar det valda lagret och växeln i Mer byter mapType', () => {
    expect(page).toContain('const korvyBasKarta = mapType;');
    expect(page).not.toContain('setKorvyBasKarta');
    expect(page).toContain('const SHOW = new Set<string>([KARTLAGER_LAGER_ID[korvyBasKarta]]);');
    expect(page).toContain('vaxlaBaskarta: efter(() => setMapType(nastaBaskarta(korvyBasKarta))),');
    expect(page).toContain('basKartaText: `Baskarta: ${KARTLAGER_NAMN[korvyBasKarta]} → ${KARTLAGER_NAMN[nastaBaskarta(korvyBasKarta)]}`,');
  });
  it('lämnar körvyn efter att lagret bytts där: det valda lagret är synligt, inte det som var synligt när körvyn startade', () => {
    expect(page).toMatch(/for \(const \[kl, lagerId\] of Object\.entries\(KARTLAGER_LAGER_ID\)\) \{[\s\S]{0,200}kl === korvyBasKarta \? 'visible' : 'none'/);
  });
  it('stilens baslager startar synliga efter det valda lagret (ingen blixt av fel lager före kartan är redo)', () => {
    for (const rad of [
      "{ id: 'osm-layer', type: 'raster' as const, source: 'osm', layout: { visibility: (mapType === 'osm' ? 'visible' : 'none')",
      "layout: { visibility: (mapType === 'satellite' ? 'visible' : 'none')",
      "layout: { visibility: (mapType === 'lantmateriet' ? 'visible' : 'none')",
      "layout: { visibility: (mapType === 'terrain' ? 'visible' : 'none')",
    ]) expect(page, rad).toContain(rad);
  });
  it('kartan utan valt objekt (maskinläget, första gången) får samma lager', () => {
    expect(page).toContain('<ObjektKartaTom kartlager={mapType}');
  });
  it('varje byte går genom setMapType (hookens välj) — Lager-listan och Karttyp-raden sparar därmed också', () => {
    expect(page).toContain("onTryck: () => setMapType(t.id) })),");
    expect(page).toContain("if (mapType === 'lantmateriet') setMapType('satellite');");
  });
});

describe('kartlagret per användare: migrationen (körs vid release)', () => {
  const dir = join(rot, 'supabase/migrations');
  const filer = readdirSync(dir).filter((f) => /^\d+_kartlager_\d_.*\.sql$/.test(f)).sort();
  const sql = filer.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  it('tre delar: kolumn, funktion, rättigheter', () => {
    expect(filer.map((f) => f.replace(/^\d+_/, ''))).toEqual(['kartlager_1_kolumn.sql', 'kartlager_2_satt.sql', 'kartlager_3_grant.sql']);
  });
  it('kolumnen är nullable (null = aldrig valt → Flygfoto) och bara de fyra lagren tillåts; ingen backfill', () => {
    expect(sql).toMatch(/add column if not exists kartlager text check \(kartlager is null or kartlager in \('satellite', 'lantmateriet', 'terrain', 'osm'\)\)/);
    expect(sql).not.toMatch(/^\s*update\s+medarbetare\s+set\s+kartlager\s*=\s*'[a-z]+'\s*;/im);   // ingen backfill: befintliga användare lämnas null
  });
  it('RPC:n skriver bara kartlager på EGEN rad (auth.uid()), validerar värdet och är stängd för anon', () => {
    expect(sql).toContain('update medarbetare set kartlager = p_lager where user_id = auth.uid();');
    expect(sql).toMatch(/if auth\.uid\(\) is null then raise exception/);
    expect(sql).toMatch(/p_lager not in \('satellite', 'lantmateriet', 'terrain', 'osm'\)/);
    expect(sql).toContain('revoke execute on function satt_kartlager(text) from public, anon;');
    expect(sql).toContain('grant execute on function satt_kartlager(text) to authenticated;');
  });
  it('klienten läser och skriver bara den kolumnen/RPC:n', () => {
    const hook = las('lib/hooks/useKartlager.ts');
    expect(hook).toContain(".select('kartlager')");
    expect(hook).toContain("supabase.rpc('satt_kartlager', { p_lager: kopia.val })");
    expect(hook).not.toMatch(/\.update\(|\.upsert\(|\.insert\(/);
  });
});
