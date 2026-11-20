import { describe, it, expect } from 'vitest';
import { arNumrerad, kommentarPunkter, vidaMeningar } from './kommentarPunkter';

describe('kommentarPunkter — varje radbrytning är en punkt', () => {
  it('en rad → en punkt, ingen numrering', () => {
    expect(kommentarPunkter('Lämna kantzon mot sjön')).toEqual(['Lämna kantzon mot sjön']);
    expect(arNumrerad(kommentarPunkter('Lämna kantzon mot sjön'))).toBe(false);
  });
  it('två eller fler rader → numrerade', () => {
    const p = kommentarPunkter('Kör inte i kanten\nLämna tallarna\nHusruin i nordöstra delen');
    expect(p).toEqual(['Kör inte i kanten', 'Lämna tallarna', 'Husruin i nordöstra delen']);
    expect(arNumrerad(p)).toBe(true);
  });
  it('tomma rader och blanksteg ignoreras (också \\r\\n från Vida) — två rader med en tom emellan är två punkter', () => {
    expect(kommentarPunkter('avverkning av frötallar.\r\nLämn kantzon mot sjön. Lämna enstaka utspridda tallar.')).toHaveLength(2);
    expect(kommentarPunkter('  A  \n\n   \n B \r\n')).toEqual(['A', 'B']);
    expect(kommentarPunkter('\n\n')).toEqual([]);
    expect(arNumrerad(kommentarPunkter('A\n\n\nB'))).toBe(true);
  });
  it('appen delar ALDRIG upp en mening själv: punkt, komma och semikolon på en rad ger EN punkt', () => {
    const rad = 'Lämn kantzon mot sjön. Lämna enstaka utspridda tallar; spara 10 per ha, husruin i nordöstra delen.';
    expect(kommentarPunkter(rad)).toEqual([rad]);
  });
  it('null och undefined är inga punkter', () => {
    expect(kommentarPunkter(null)).toEqual([]);
    expect(kommentarPunkter(undefined)).toEqual([]);
  });
});

describe('vidaMeningar — Vidas traktdirektiv delas vid meningsslut (punkt + mellanslag + versal)', () => {
  const DIREKTIV = 'Obs tjärdal enligt karta. Lämna ca 50-70 tallar per ha . Lämna fina ekar och några bokar. Två hänsynsområde enligt karta. Gräns mot reservat, gäller den mindre avv i öster. En del fällning pga brant terräng.';
  it('Hålabäck au 2025:s riktiga direktiv blir sex punkter', () => {
    expect(vidaMeningar(DIREKTIV)).toEqual([
      'Obs tjärdal enligt karta.',
      'Lämna ca 50-70 tallar per ha .',
      'Lämna fina ekar och några bokar.',
      'Två hänsynsområde enligt karta.',
      'Gräns mot reservat, gäller den mindre avv i öster.',
      'En del fällning pga brant terräng.',
    ]);
    expect(arNumrerad(vidaMeningar(DIREKTIV))).toBe(true);
  });
  it('delar aldrig mitt i en mening: punkt följd av gemen, siffra eller inget mellanslag', () => {
    expect(vidaMeningar('Spara ca. 10 träd per ha. spara fler vid bäcken.')).toEqual(['Spara ca. 10 träd per ha. spara fler vid bäcken.']);
    expect(vidaMeningar('Version 1.2 gäller. Se karta.')).toEqual(['Version 1.2 gäller.', 'Se karta.']);
    expect(vidaMeningar('Se www.vida.se/trakt för mer.')).toEqual(['Se www.vida.se/trakt för mer.']);
  });
  it('! och ? avslutar också en mening; å/ä/ö räknas som versaler', () => {
    expect(vidaMeningar('Obs! Ändra inte stickvägen? Ja.')).toEqual(['Obs!', 'Ändra inte stickvägen?', 'Ja.']);
  });
  it('en text utan meningsslut är EN punkt; tom text ger inga', () => {
    expect(vidaMeningar('Säljaren skotar')).toEqual(['Säljaren skotar']);
    expect(vidaMeningar('')).toEqual([]);
    expect(vidaMeningar(null)).toEqual([]);
  });
  it('radbrytningar i texten gäller först, varje rad delas sedan för sig', () => {
    expect(vidaMeningar('Första raden. Andra meningen.\nTredje raden')).toEqual(['Första raden.', 'Andra meningen.', 'Tredje raden']);
  });
  it('delar aldrig före en versal utan meningsslut framför (egennamn mitt i en mening)', () => {
    expect(vidaMeningar('Spara Ekar vid Bäcken och Ön')).toEqual(['Spara Ekar vid Bäcken och Ön']);
  });
  it('en radbrytning utan punkt är ändå en punkt', () => {
    expect(vidaMeningar('Stanna vid stenen\nGå runt blötan')).toEqual(['Stanna vid stenen', 'Gå runt blötan']);
  });
  it('en EGEN kommentar delas aldrig vid meningsslut — bara på radbrytning (kommentarPunkter)', () => {
    expect(kommentarPunkter('Stanna vid stenen. Gå runt blötan.')).toEqual(['Stanna vid stenen. Gå runt blötan.']);
  });
});
