/**
 * Serverrenderad markup = det som målas INNAN JS hunnit köra (prerender / första bildrutan på en långsam 4G-anslutning).
 * Kontrollerar att svart aldrig står utan innehåll: granen tonar in efter 1 s med RENT CSS (ingen JS behövs), och att
 * fråge-/felskärmarna alltid har text och en väg vidare.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { StartSvartSkarm, MaskinFelSkarm, MaskinSomFelSkarm } from './StartSkarmar';
import { VilkenMaskinSkarm } from './VilkenMaskinSkarm';
import { SVART_INFO_MS } from '@/lib/maskinstart';

const noop = () => {};

describe('StartSvartSkarm — första målningen (före hydrering)', () => {
  const html = renderToStaticMarkup(<StartSvartSkarm />);

  it('helsvart täckskikt, men innehållet FINNS i markupen (gran + förloppsrad), osynligt till att börja med', () => {
    expect(html).toContain('background:#000');
    expect(html).toContain('data-testid="svart-innehall"');
    expect(html).toContain('<img src="/gran-vit.png"');
    expect(html).toMatch(/data-testid="svart-innehall"[^>]*opacity:0/);   // första bildrutan: svart
  });

  it('granen tonar in efter SVART_INFO_MS (1 s) med RENT CSS — utan att JS kört', () => {
    expect(SVART_INFO_MS).toBe(1000);
    expect(html).toContain(`animation:maskinSvartTona 600ms ease ${SVART_INFO_MS}ms forwards`);
    expect(html).toContain('@keyframes maskinSvartTona');        // keyframes ligger i markupen, inte i en JS-injicerad stil
  });

  it('inget påhittat före hydrering: inget namn och ingen statustext (de kräver data)', () => {
    expect(html).not.toContain('Hämtar position');
    expect(html).not.toContain('Hämtar karta');
    expect(html).not.toContain('Väntar på nät');
  });
});

describe('MaskinFelSkarm — vad som är fel + minst en väg vidare', () => {
  it('visar texten, loggan och varje knapp', () => {
    const html = renderToStaticMarkup(<MaskinFelSkarm text="Maskinregistret gick inte att hämta." knappar={[{ etikett: 'Försök igen', onClick: noop }, { etikett: 'Till appen', onClick: noop, primar: false }]} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Maskinregistret gick inte att hämta.');
    expect(html).toContain('Försök igen');
    expect(html).toContain('Till appen');
    expect(html).toContain('/logo.png');
  });
  it('MaskinSomFelSkarm (för /maskin?som=) är oförändrad utåt: text + "Till appen"', () => {
    const html = renderToStaticMarkup(<MaskinSomFelSkarm text="Ingen maskin med det id:t." onTillbaka={noop} />);
    expect(html).toContain('Ingen maskin med det id:t.');
    expect(html).toContain('Till appen');
  });
});

describe('VilkenMaskinSkarm — varje tillstånd har innehåll och en väg vidare', () => {
  const maskiner = [
    { maskinId: 'A130743', namn: 'Elefant 26', roll: 'skotare' as const },
    { maskinId: 'R64428', namn: 'H8E -26', roll: 'skordare' as const },
  ];
  const rita = (status: 'laddar' | 'ok' | 'fel', m = maskiner) =>
    renderToStaticMarkup(<VilkenMaskinSkarm maskiner={m} status={status} onVald={noop} onForsokIgen={noop} onTillAppen={noop} />);

  it('ok: rubrik, en stor knapp per maskin med namn + roll, och Till appen', () => {
    const html = rita('ok');
    expect(html).toContain('Vilken maskin är det här?');
    expect(html).toContain('data-testid="maskinval-A130743"');
    expect(html).toContain('Elefant 26');
    expect(html).toContain('Skotare');
    expect(html).toContain('Skördare');
    expect(html).toContain('data-testid="maskinfraga-till-appen"');
  });
  it('laddar: text från första stund', () => {
    const html = rita('laddar', []);
    expect(html).toContain('Hämtar maskiner…');
    expect(html).toContain('maskinfraga-till-appen');
  });
  it('fel: säger det + Försök igen + Till appen (inte "inga maskiner")', () => {
    const html = rita('fel', []);
    expect(html).toContain('Maskinerna gick inte att hämta');
    expect(html).toContain('Försök igen');
    expect(html).not.toContain('Inga aktiva maskiner');
    expect(html).toContain('maskinfraga-till-appen');
  });
  it('ok men tomt: säger att inga aktiva maskiner finns', () => {
    const html = rita('ok', []);
    expect(html).toContain('Inga aktiva maskiner');
    expect(html).toContain('maskinfraga-till-appen');
  });
  it('knapparna är stora nog för handske/maskindator (≥ 64 px höga)', () => {
    const m = /data-testid="maskinval-A130743"[^>]*min-height:(\d+)px/.exec(rita('ok'));
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(64);
  });
});
