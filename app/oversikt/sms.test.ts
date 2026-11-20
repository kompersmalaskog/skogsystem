import { describe, it, expect } from 'vitest';
import { arIos, forstaNamn, maskinOrd, rensaObjektnamn, smsHref, smsText } from './sms';

// Texten är beställd ord för ord — den här strängen är skriven för hand ur beställningen, inte byggd av koden som testas.
const BESTALLD = 'Hej! Anna här från Kompersmåla Skog. Vi kommer med skotaren till Kroksjömåla 1:23 A-A i morgon. Undrar du något, ring mig på det här numret. Vill du komma ut och titta? Hör av dig först, så möts vi på säkert avstånd från maskinen. Hälsningar Anna';

describe('smsText', () => {
  it('exakt den beställda texten', () => {
    expect(smsText({ fornamn: 'Anna', maskin: 'skotaren', objektnamn: 'Kroksjömåla 1:23 A-A' })).toBe(BESTALLD);
  });
  it('förnamnet står på två ställen (hälsningen först och sist), maskin och objekt där de ska', () => {
    const t = smsText({ fornamn: 'Åke', maskin: 'skördaren', objektnamn: 'Älmehult gallring 2026' });
    expect(t.startsWith('Hej! Åke här från Kompersmåla Skog. Vi kommer med skördaren till Älmehult gallring 2026 i morgon. ')).toBe(true);
    expect(t.endsWith(' Hälsningar Åke')).toBe(true);
    expect(t.match(/Åke/g)).toHaveLength(2);
  });
  it('"maskinen" när objektet öppnats utan maskin', () => {
    expect(smsText({ fornamn: 'Anna', maskin: 'maskinen', objektnamn: 'X' })).toContain('Vi kommer med maskinen till X i morgon.');
  });
  it('utan förnamn blir det företaget som skriver — aldrig en tom plats eller "undefined"', () => {
    const t = smsText({ fornamn: null, maskin: 'skotaren', objektnamn: 'X' });
    expect(t.startsWith('Hej! Det här är Kompersmåla Skog. Vi kommer med skotaren till X i morgon.')).toBe(true);
    expect(t.endsWith('Hälsningar Kompersmåla Skog')).toBe(true);
    expect(t).not.toMatch(/undefined|null|\s{2}/);
  });
  it('slutar utan punkt efter hälsningen, precis som beställt', () => {
    expect(BESTALLD.endsWith('Anna')).toBe(true);
    expect(smsText({ fornamn: 'Anna', maskin: 'skotaren', objektnamn: 'Kroksjömåla 1:23 A-A' }).endsWith('.')).toBe(false);
  });
});

describe('maskinOrd', () => {
  it('skördare → skördaren, skotare → skotaren, ingen maskin → maskinen', () => {
    expect(maskinOrd('skordare')).toBe('skördaren');
    expect(maskinOrd('skotare')).toBe('skotaren');
    expect(maskinOrd(null)).toBe('maskinen');
    expect(maskinOrd(undefined)).toBe('maskinen');
  });
});

describe('forstaNamn', () => {
  it('första ordet', () => {
    expect(forstaNamn('Anna Svensson')).toBe('Anna');
    expect(forstaNamn('  Åke   Öberg ')).toBe('Åke');
    expect(forstaNamn('Madonna')).toBe('Madonna');
  });
  it('bindestreck i förnamnet behålls', () => {
    expect(forstaNamn('Anna-Lisa Svensson')).toBe('Anna-Lisa');
    expect(forstaNamn('Kjell-Erik Lindström')).toBe('Kjell-Erik');
  });
  it('"Efternamn, Förnamn" → förnamnet', () => {
    expect(forstaNamn('Svensson, Anna')).toBe('Anna');
  });
  it('skiljetecken i kanterna städas', () => {
    expect(forstaNamn('(Anna) Svensson')).toBe('Anna');
    expect(forstaNamn('"Åke" Öberg')).toBe('Åke');
  });
  it('tomt, blankt och rena tecken → null (aldrig en tom sträng i texten)', () => {
    for (const v of [null, undefined, '', '   ', '123', '---', ', ']) expect(forstaNamn(v)).toBeNull();
  });
});

describe('rensaObjektnamn — utan VO-nummer och årssuffix, annars som det är', () => {
  // Riktiga objektnamn ur prod (2026-10-06) som ändras, och sådana som ska stå kvar orörda.
  const ANDRAS: [string, string][] = [
    ['400763 Akelius Tåget SA', 'Akelius Tåget SA'],
    ['Kroksjömåla 1:23 A-A -25', 'Kroksjömåla 1:23 A-A'],
    ['Vällust RP M-R -25', 'Vällust RP M-R'],
    ['Mölleryd RP J-Hus -25', 'Mölleryd RP J-Hus'],
    ['Skälviken RP J-Hus -25', 'Skälviken RP J-Hus'],
    ['Bågskyttebanan RP J-Hus- 25', 'Bågskyttebanan RP J-Hus'],
    ['Uggleboda H-A RP -24', 'Uggleboda H-A RP'],
    ['Karamåla 1:9 A-S -25', 'Karamåla 1:9 A-S'],
    ['Karstorp 1:8 O-A -25', 'Karstorp 1:8 O-A'],
    ['Husjönäs 1:18 JE-G LRK -25', 'Husjönäs 1:18 JE-G LRK'],
    ['Åkarp 1:33 Bjurbrant -25', 'Åkarp 1:33 Bjurbrant'],
    ['Östra-Hoka 1:7 A-C -25', 'Östra-Hoka 1:7 A-C'],
    ['GROT Brokamåla 1:5 V-H avd 20 -25', 'GROT Brokamåla 1:5 V-H avd 20'],
  ];
  const ORORDA = [
    'Älmehult gallring 2026', 'Betet AU 2025', 'Stänkelsmåla 2025', 'Trestensdal gallring 2025.', 'Ulfsryd AU 3:8 2025', 'Kylinge 4:17',
    'Brokamåla 1:5 V', 'Hössjömåla Gallring 25', 'Kompersmåla väggata', 'Peter Hoka', 'Kjell-Erik Lindström Steglehylte', 'Stenshult del 2',
    'Bjällerhult au + ga', 'Specialavv Uggleboda', 'odenssvalahult gallring 2026', 'Östra-Hoka',
  ];
  it.each(ANDRAS)('%s → %s', (fran, till) => { expect(rensaObjektnamn(fran)).toBe(till); });
  it.each(ORORDA)('%s lämnas som det är', (namn) => { expect(rensaObjektnamn(namn)).toBe(namn); });

  it('objektets eget vo_nummer tas bort var det än står, med eller utan "VO"', () => {
    expect(rensaObjektnamn('11251460 Kroksjömåla 1:23', '11251460')).toBe('Kroksjömåla 1:23');
    expect(rensaObjektnamn('Kroksjömåla 1:23 11251460', '11251460')).toBe('Kroksjömåla 1:23');
    expect(rensaObjektnamn('Kroksjömåla (11251460)', '11251460')).toBe('Kroksjömåla');
    expect(rensaObjektnamn('VO 11251460 Kroksjömåla', '11251460')).toBe('Kroksjömåla');
    expect(rensaObjektnamn('Kroksjömåla VO-nr 11251460', '11251460')).toBe('Kroksjömåla');
    expect(rensaObjektnamn('Kroksjömåla VO11251460')).toBe('Kroksjömåla');
    expect(rensaObjektnamn('Kroksjömåla P-1017', 'P-1017')).toBe('Kroksjömåla');
  });
  it('ett vo_nummer rörs bara som eget ord — aldrig mitt i ett annat tal', () => {
    expect(rensaObjektnamn('Skog 112514607', '11251460')).toBe('Skog');       // ≥ 5 siffror är ett id i sig …
    expect(rensaObjektnamn('Gallring 876 B', '876')).toBe('Gallring B');
    expect(rensaObjektnamn('Avd 1876', '876')).toBe('Avd 1876');
  });
  it('fastighetsbeteckningar och år är inga VO-nummer', () => {
    expect(rensaObjektnamn('Kylinge 4:17')).toBe('Kylinge 4:17');
    expect(rensaObjektnamn('2026 Gallring Betet')).toBe('2026 Gallring Betet');
    expect(rensaObjektnamn('Rössmåla 12345:6')).toBe('Rössmåla 12345:6');
  });
  it('suffix som inte är ett år lämnas', () => {
    expect(rensaObjektnamn('Skog 5-10')).toBe('Skog 5-10');
    expect(rensaObjektnamn('Skog -20')).toBe('Skog -20');
    expect(rensaObjektnamn('Avd 2-3')).toBe('Avd 2-3');
  });
  it('4-siffrigt hyphen-år tas också: "… -2025"', () => {
    expect(rensaObjektnamn('Kroksjömåla 1:23 -2025')).toBe('Kroksjömåla 1:23');
  });
  it('blir resultatet tomt returneras originalet (inget nonsens-namn)', () => {
    expect(rensaObjektnamn('-25')).toBe('-25');
    expect(rensaObjektnamn('11251460', '11251460')).toBe('11251460');
    expect(rensaObjektnamn('400763')).toBe('400763');
  });
  it('tomt in → tomt ut, utan att krascha', () => {
    expect(rensaObjektnamn('')).toBe('');
    expect(rensaObjektnamn(null)).toBe('');
    expect(rensaObjektnamn(undefined, '123')).toBe('');
  });
  it('extra blanksteg trimmas men inget annat ändras', () => {
    expect(rensaObjektnamn('  Älmehult    gallring  2026 ')).toBe('Älmehult gallring 2026');
  });
});

describe('arIos', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const IPAD_SKRIVBORD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  it('iPhone, iPod och iPad (mobil-UA) → iOS', () => {
    expect(arIos(IPHONE)).toBe(true);
    expect(arIos('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)')).toBe(true);
    expect(arIos('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe(true);
  });
  it('iPadOS som utger sig för att vara en Mac (pekskärm) → iOS; en riktig Mac utan pekskärm → inte', () => {
    expect(arIos(IPAD_SKRIVBORD, 5)).toBe(true);
    expect(arIos(IPAD_SKRIVBORD, 0)).toBe(false);
    expect(arIos(IPAD_SKRIVBORD)).toBe(false);
  });
  it('Android och Windows → inte iOS', () => {
    expect(arIos(ANDROID, 5)).toBe(false);
    expect(arIos('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0', 10)).toBe(false);
  });
});

describe('smsHref — URL-kodning med åäö', () => {
  const NR = '0701234567';
  it('iOS skiljer med & och Android med ?', () => {
    expect(smsHref(NR, 'Hej', true)).toBe('sms:0701234567&body=Hej');
    expect(smsHref(NR, 'Hej', false)).toBe('sms:0701234567?body=Hej');
  });
  it('åäö, mellanslag, frågetecken, &, #, % och + kodas — handskriven förväntan, inte encodeURIComponent mot sig själv', () => {
    const text = 'Hör av dig först, så möts vi på säkert avstånd från maskinen. Åke & Älmehult #1 100% +x?';
    const forvantat = 'H%C3%B6r%20av%20dig%20f%C3%B6rst%2C%20s%C3%A5%20m%C3%B6ts%20vi%20p%C3%A5%20s%C3%A4kert%20avst%C3%A5nd%20fr%C3%A5n%20maskinen.%20%C3%85ke%20%26%20%C3%84lmehult%20%231%20100%25%20%2Bx%3F';
    expect(smsHref(NR, text, false)).toBe('sms:0701234567?body=' + forvantat);
    expect(smsHref(NR, text, true)).toBe('sms:0701234567&body=' + forvantat);
  });
  it('versalerna Å Ä Ö och gemenerna å ä ö får rätt UTF-8-kodning', () => {
    expect(smsHref(NR, 'ÅÄÖåäö', false)).toBe('sms:0701234567?body=%C3%85%C3%84%C3%96%C3%A5%C3%A4%C3%B6');
  });
  it('hela den beställda texten: bara URL-säkra tecken efter body=, och den avkodas tillbaka till exakt samma text', () => {
    const text = smsText({ fornamn: 'Åke', maskin: 'skördaren', objektnamn: 'Älmehult 1:23 (A&B)' });
    for (const ios of [true, false]) {
      const href = smsHref(NR, text, ios)!;
      const body = href.slice(href.indexOf('body=') + 5);
      expect(body).toMatch(/^[A-Za-z0-9\-_.!~*'()%]*$/);                  // inga mellanslag, å/ä/ö, &, ?, #, + kvar
      expect(decodeURIComponent(body)).toBe(text);
      expect(href.split('&').length - 1).toBe(ios ? 1 : 0);                // iOS: precis ett & (skiljetecknet); Android: inget
      expect(href.split('?').length - 1).toBe(ios ? 0 : 1);
    }
  });
  it('Android-formen går att tolka som en URL: numret före ?, texten i body', () => {
    const text = 'Vi ses på Kroksjömåla – hälsningar Åke';
    const u = new URL(smsHref('070-123 45 67', text, false)!);
    expect(u.protocol).toBe('sms:');
    expect(u.pathname).toBe('0701234567');
    expect(u.searchParams.get('body')).toBe(text);
  });
  it('numret rensas från mellanslag och bindestreck, landsprefix behålls', () => {
    expect(smsHref('070-123 45 67', 'x', false)).toBe('sms:0701234567?body=x');
    expect(smsHref('+46 70 123 45 67', 'x', true)).toBe('sms:+46701234567&body=x');
  });
  it('inget nummer → ingen länk', () => {
    for (const t of [null, undefined, '', '  ', '-', 'ring Anders', '12345']) expect(smsHref(t, 'x', false)).toBeNull();
  });
});
