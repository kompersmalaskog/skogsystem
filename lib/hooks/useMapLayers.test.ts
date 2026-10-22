// Sparat kartlagerläge (mapLayers_v4). Martin 2026-10-22: Fastighetsgränser syntes fast han inte tänt lagret. Orsak: standardvärdet var true och hooken skriver in standardvärdena i
// localStorage vid första körningen, så "tänt" blev ett sparat val hos alla. Nu: standard AV, och en sparning från den versionen (utan märket fastighetsgransVal) nollas EN gång.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_LAYERS, lasSparadeLager } from './useMapLayers';

describe('fastighetsgrans: standard och sparade lägen', () => {
  it('standardvärdet är AV (som alla andra lager) och märket är satt', () => {
    expect(DEFAULT_MAP_LAYERS.fastighetsgrans).toBe(false);
    expect(DEFAULT_MAP_LAYERS.fastighetsgransVal).toBe(true);
  });
  it('inget sparat, tomt, trasig JSON, ingen objekt-JSON → standard (lagret av)', () => {
    for (const raw of [null, undefined, '', '{trasig', 'null', '[]', '42', '"text"']) expect(lasSparadeLager(raw as any).fastighetsgrans, String(raw)).toBe(false);
  });
  it('GAMMALT SPARAT LÄGE: en uppsättning som första versionen skrev (fastighetsgrans: true, inget märke) ger AV — det var aldrig ett val', () => {
    const gammal = JSON.stringify({ ...DEFAULT_MAP_LAYERS, fastighetsgrans: true, fastighetsgransVal: undefined });
    expect(JSON.parse(gammal).fastighetsgransVal).toBeUndefined();
    expect(lasSparadeLager(gammal).fastighetsgrans).toBe(false);
    expect(lasSparadeLager('{"hansyn":true,"fastighetsgrans":true}').fastighetsgrans).toBe(false);
  });
  it('efter nollningen sparas märket, så ett nytt eget val (PÅ) består över nästa start', () => {
    const ettEgetVal = JSON.stringify({ ...lasSparadeLager('{"fastighetsgrans":true}'), fastighetsgrans: true });
    expect(lasSparadeLager(ettEgetVal).fastighetsgrans).toBe(true);
    expect(lasSparadeLager(JSON.stringify({ fastighetsgrans: false, fastighetsgransVal: true })).fastighetsgrans).toBe(false);
  });
  it('märket skrivs alltid som true efter nollningen (annars upprepas nollningen vid varje start och ett eget val försvinner)', () => {
    const ut = lasSparadeLager(JSON.stringify({ ...DEFAULT_MAP_LAYERS, fastighetsgrans: true, fastighetsgransVal: false }));
    expect(ut.fastighetsgrans).toBe(false);
    expect(ut.fastighetsgransVal).toBe(true);
    // Skriven tillbaka och läst igen: nu är PÅ ett eget val och består.
    expect(lasSparadeLager(JSON.stringify({ ...ut, fastighetsgrans: true })).fastighetsgrans).toBe(true);
  });
  it('en sparad uppsättning med märket men trasigt värde (inte boolean) ger standard', () => {
    expect(lasSparadeLager('{"fastighetsgransVal":true,"fastighetsgrans":"ja"}').fastighetsgrans).toBe(false);
  });
  it('Lantmäteri-rastret (fastighetsgranser) står aldrig kvar som PÅ från en äldre sparning — bara briefingen tänder det, tillfälligt', () => {
    expect(lasSparadeLager('{"fastighetsgransVal":true,"fastighetsgranser":true}').fastighetsgranser).toBe(false);
    expect(lasSparadeLager('{"fastighetsgranser":true}').fastighetsgranser).toBe(false);
  });
  it('övriga lager rörs inte: sparade val består, nya nycklar får sitt standardvärde', () => {
    const l = lasSparadeLager('{"hansyn":false,"mittSpar":false,"fastighetsgransVal":true}');
    expect(l.hansyn).toBe(false); expect(l.mittSpar).toBe(false);
    expect(l.korFara).toBe(DEFAULT_MAP_LAYERS.korFara); expect(l.traktLamning).toBe(DEFAULT_MAP_LAYERS.traktLamning);
  });
});
