// @vitest-environment node
// KÄLLVAKTER för "Nytt från …" (Martin 2026-11-24): sidans inkoppling får inte glida. Raden bara i körvyn, planeringsvyn orörd, vem som sparar stämplas, kommentarerna går på realtime
// med reserv, korten under flyttas ned, och migrationen finns (skriven, körs av Claude i chatten).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const las = (f: string) => fs.readFileSync(f, 'utf8');
const sida = las('app/planering/page.tsx');

describe('Nytt från — inkopplingen i sidan', () => {
  it('raden visas bara i körvyn och hooken är aktiv bara där', () => {
    expect(sida).toMatch(/\{korvyActive && nyttFran\.rad && \(\s*<NyttFranRad/);
    expect(sida).toMatch(/useNyttFranPlaneraren\(\{[\s\S]{0,200}aktiv: korvyActive,/);
  });
  it('markeringarna matas efter varje hämtning (onHamtad) och författaren stämplas i det som sparas', () => {
    expect(sida).toMatch(/onHamtad: \(\{ markers: laddade, farsk, efterRefetch \}\) => \{\s*nyttHamtadRef\.current\(laddade, farsk\);/);
    expect(sida).toMatch(/forfattare: \(\) => currentMedarbetare \? \{\s*id: currentMedarbetare\.id,\s*namn: andradAvNamn\(\{ upplastNamn: maskinKonto\.upplast\?\.namn \?\? null, konto: currentMedarbetare,/);
    expect(sida).toMatch(/nyttHamtadRef\.current = nyttFran\.hamtadMarkeringar;/);
  });
  it('kommentarerna går på realtime + reserv i körvyn/maskinen, planeringsvyn som förut', () => {
    expect(sida).toMatch(/live: korvyActive \|\| maskinlage,/);
  });
  it('ett tryck pausar följet, flyger dit och pulserar 5 s (NYTT_PULS_MS) med larmens puls', () => {
    const f = sida.slice(sida.indexOf('const nyttVisa = '), sida.indexOf('const nyttFran = useNyttFranPlaneraren'));
    expect(f).toContain('setKorvyFollowPaused(true)');
    expect(f).toContain('map.fitBounds(plats.bounds');
    expect(f).toContain('setYtaPuls({');
    expect(f).toContain('NYTT_PULS_MS');
  });
  it('korten under objektpillen flyttas ned med radens höjd (larm, instruktion, fastighetsgräns) — inget annat läggs över den', () => {
    const antal = (sida.match(/VIDA_RAD_HOJD_PX \+ AVSTAND\.s : 0\}px \+ \$\{nyttRadH\}px/g) ?? []).length;
    expect(antal).toBe(3);
    expect(sida).toMatch(/const nyttRadH = korvyActive && nyttFran\.rad \? NYTT_RAD_HOJD_PX \+ AVSTAND\.s : 0;/);
  });
});

describe('Nytt från — resten', () => {
  it('stämpeln läggs bara i det som skrivs, aldrig i minnets markering (annars ser den ändrad ut vid varje jämförelse)', () => {
    const h = las('lib/hooks/useMarkeringarSynk.ts');
    expect(h).toMatch(/laggMarkeringUpsert\(objektId, \(f \? stampla\(marker, f\) : marker\) as any, typAv\(marker\)\)/);
    expect(h).toMatch(/const json = JSON\.stringify\(marker\);/);
  });
  it('kommentarerna prenumererar på INSERT och UPDATE filtrerat på objektet, med reserv', () => {
    const k = las('lib/hooks/useKartkommentarer.ts');
    expect(k).toContain("table: 'kartkommentar', filter: 'objekt_id=eq.' + id");
    expect(k).toContain("['INSERT', 'UPDATE']");
    expect(k).toContain('LIVE_RESERV_MASKIN_MIN');
  });
  it('migrationen lägger kartkommentar i realtime-publikationen, idempotent, och ändrar ingen policy', () => {
    const m = las('supabase/migrations/20261124150000_kartkommentar_realtime.sql');
    expect(m).toContain('alter publication supabase_realtime add table public.kartkommentar');
    expect(m).toContain('if not exists');
    expect(m).not.toMatch(/create policy|alter policy|drop policy/i);
  });
  it('raden har ingen ljud- eller kvitteringskod', () => {
    const r = las('components/planering/NyttFranRad.tsx') + las('lib/hooks/useNyttFranPlaneraren.ts');
    expect(r).not.toMatch(/Audio|vibrate|spelaLjud|kvittera/i);
  });
});
