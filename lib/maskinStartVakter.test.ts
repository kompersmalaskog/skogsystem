/**
 * KÄLLKODSVAKTER för maskindatorns start (planeringsvyn är 24 000 rader och körs inte i enhetstester — de här hindrar att de
 * fel som fältet hittade (Daniel, Elefanten, 2026-10-05) smyger tillbaka). Beteendet är bevisat separat: rena beslut
 * (appStart/maskinFraga/maskindatorStart/senasteObjekt), renderingstester (AppStartVakt, StartSkarmar) och en körning av den
 * riktiga sidan i riktig MapLibre.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const las = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const page = las('app/planering/page.tsx');
const vakt = las('components/AppStartVakt.tsx');
const layout = las('app/layout.tsx');

describe('rollen kommer ur maskinregistret — aldrig en tyst reserv', () => {
  it('ingen "?? \'skotare\'"-reserv kvar i planeringsvyn (en skördare fick skotarens körvy)', () => {
    expect(page).not.toMatch(/\?\?\s*'skotare'/);
    expect(page).not.toMatch(/\|\|\s*'skotare'\s*\)/);
  });
  it('roll ur tilldelningsfältet (skordare_maskin_id === enhetMaskinId ? …) är borta ur avstämningen', () => {
    expect(page).not.toMatch(/traff\.skordare_maskin_id\s*===\s*enhetMaskinId/);
    expect(page).not.toMatch(/traff\.skotare_maskin_id\s*===\s*enhetMaskinId/);
  });
  it('enhetens roll räknas EN gång ur registret (rollForMaskin) och används av listval, volym och avstämning', () => {
    expect(page).toMatch(/const enhetRoll = enhetMaskinId \? rollForMaskin\(dimMaskiner, enhetMaskinId\) : null/);
    expect(page).toMatch(/oppnaKorvyPa\(obj, enhetRoll\)/);
    expect(page).toMatch(/startM3Kvar = valtObjekt && enhetRoll \?/);
    expect(page).toMatch(/const roll = enhetRollRef\.current;/);
  });
  it('okänd roll vid listval öppnar INGENTING (meddelande i stället)', () => {
    expect(page).toMatch(/if \(!enhetRoll\) \{\s*visaBesked\(/);
  });
  it('bekräftelsekortet följer rollen: skördare "avverkar", skotare "skotar"', () => {
    expect(page).toMatch(/maskindatorKort\.roll === 'skordare' \? 'Börja avverka här\?' : 'Börja skota här\?'/);
  });
  it('tilldelningen skrivs i rollens eget fält (kort.roll → skordare_maskin_id / skotare_maskin_id)', () => {
    expect(page).toMatch(/const col = kort\.roll === 'skordare' \? 'skordare_maskin_id' : 'skotare_maskin_id'/);
  });
});

describe('hem-knappen i maskinläge går till objektlistan, aldrig till appens meny', () => {
  it('maskinläge → knapp som kör tillObjektlistan; annars länken till "/"', () => {
    expect(page).toMatch(/maskinlage \? \(\s*<button[^>]*data-testid="hem-objektlista"[^>]*onClick=\{tillObjektlistan\}/);
    expect(page).toMatch(/<Link href="\/" aria-label="Hem"/);
  });
  it('tillObjektlistan stänger körvyn och nollar roll + objekt (som "Annat objekt")', () => {
    const m = /const tillObjektlistan = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/.exec(page);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/setKorvyActive\(false\)/);
    expect(m![1]).toMatch(/setKorvyForceRoll\(null\)/);
    expect(m![1]).toMatch(/setValtObjekt\(null\)/);
    expect(m![1]).not.toMatch(/location|router|href/);   // ingen navigering
  });
});

describe('startobjektet: förarens val minns och glöms på rätt ställen', () => {
  it('listval, Ja på kortet och avstämningsbyte kommer ihåg; avsluta glömmer', () => {
    expect(page).toMatch(/if \(!testlage\) sattSenasteObjekt\(enhetMaskinId, obj\.id\)/);
    expect(page).toMatch(/sattSenasteObjekt\(enhetMaskinId, kort\.objektId\)/);
    expect(page).toMatch(/rensaSenasteObjekt\(\{ maskinId: hamtaEnhetMaskin\(\), objektId: valtObjekt\.id \}\)/);
  });
  it('"öppna som maskin" (testflik = en annan maskins identitet) läser och skriver ALDRIG datorns minne', () => {
    // läsningen är gejtad på arTestflik, skrivningarna på testlage/testlageAktivRef
    expect(page).toMatch(/const senasteP[\s\S]{0,200}if \(arTestflik\) return null;/);
    expect(page).toMatch(/if \(!arTestflik && kalla === 'fix'\) sattSenasteObjekt/);
    expect(page).toMatch(/if \(!testlageAktivRef\.current\) sattSenasteObjekt\(enhetMaskinId, traff\.id\)/);
    expect(page).toMatch(/if \(!testlageAktivRef\.current\) sattSenasteObjekt\(enhetMaskinId, kort\.objektId\)/);
  });
  it('starten har en yttre catch som släpper svart (aldrig en sekvens som väntar 30 s på en karta som inte kommer)', () => {
    expect(page).toMatch(/\}\)\(\)\.catch\(\(e\) => \{[\s\S]{0,260}setStartIngenKarta\(true\)/);
  });
});

describe('maskinfrågan och hindren i planeringsvyn', () => {
  it('frågan visas utan vald maskin + serial-GPS (eller begärd), aldrig i testfliken', () => {
    expect(page).toMatch(/const maskinFragaSynlig = enhetMaskinLast && !enhetMaskinId && !testlage && !maskinSomParam/);
  });
  it('förar-auto-select öppnar inget objekt bakom frågan', () => {
    expect(page).toMatch(/if \(maskinFragaSynlig\) return;/);
  });
  it('sekvensen startar inte medan ett hinder visas, och släpper svart om ett uppstår', () => {
    expect(page).toMatch(/startSekvensStart != null \|\| harStartHinder\) return;/);
    expect(page).toMatch(/if \(harStartHinder\) setStartIngenKarta\(true\)/);
  });
  it('maskinregistrets läsfel är ett FEL (status), inte ett tomt register', () => {
    expect(page).toMatch(/setDimMaskinerStatus\('fel'\)/);
  });
  it('en enhet bunden till en maskin räknas som maskinläge', () => {
    expect(page).toMatch(/arMaskinlage\(serialGpsAktiv, !!testlage, enhetMaskinId\)/);
  });
});

describe('startvakten', () => {
  it('ligger i rotlayouten (gäller startsidan och /oversikt-start oavsett vy)', () => {
    expect(layout).toMatch(/import AppStartVakt from/);
    expect(layout).toMatch(/<AppStartVakt \/>/);
  });
  it('routern ligger i en ref (inte i effektens beroenden) och steg-tillståndet startar inte om klockan vid omrendering', () => {
    expect(vakt).toMatch(/routerRef\.current = router/);
    expect(vakt).not.toMatch(/\[pathname, bytSteg, router\]/);
    expect(vakt).toMatch(/prev\.steg === s \? prev :/);
  });
  it('använder inte useSearchParams (skulle tvinga fram klientrendering av HELA appen i rotlayouten)', () => {
    expect(vakt).not.toMatch(/useSearchParams/);
  });
  it('drar INTE in lib/gpsKalla (NMEA-parser + seriedrivrutin ≈ 20 kB extra JS på varje sida i appen) — bara den lilla flaggmodulen', () => {
    expect(vakt).not.toMatch(/lib\/gpsKalla['"]/);
    expect(vakt).toMatch(/lib\/gpsSerialFlagga/);
    expect(las('lib/useMaskinRegister.ts')).not.toMatch(/gpsKalla/);
    expect(las('components/maskin/VilkenMaskinSkarm.tsx')).not.toMatch(/gpsKalla/);
  });
});
