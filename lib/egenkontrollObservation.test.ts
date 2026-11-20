import { describe, expect, it } from 'vitest';
import { expression, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  OBSERVATION_ORDNING, OBSERVATION_TON, OBSERVATION_TONER, OBSERVATION_TYPER, OBSERVATION_TYP_ETIKETT,
  arObservation, arObservationTon, arObservationTyp, delaObservationer, giltigPosition, nyttPunktId,
  observationText, sparaKrav,
} from './egenkontrollObservation';
import {
  OBSERVATION_KALLA, OBSERVATION_LAGER_ID, observationFeatures, observationLager, observationLagerIdn,
} from './egenkontrollkarta';
import {
  CIRKEL_RADIE, OBSERVATION_IKON, OBSERVATION_TON_FARG, OBS_RUTA, ikonPunkter, observationBildNamn,
} from './observationIkon';
import { TRAFF_RADIE_PX, traffIdFranEgenskaper, traffKindFranEgenskaper, traffRang, valjTraff } from './egenkontrollTryck';
import { AVVIKELSE_TYPER } from './egenkontroll';

describe('observationens val - samma som databasens CHECK', () => {
  it('tre toner: bra, battre, avvikelse - i den ordningen', () => {
    expect([...OBSERVATION_TONER]).toEqual(['bra', 'battre', 'avvikelse']);
  });

  it('fyra typer, och hansyn ar neutralt - inte hansyn_skadad', () => {
    expect([...OBSERVATION_TYPER]).toEqual(['korspar', 'stubbhojd', 'hansyn', 'annat']);
    // En rishog som ligger ratt far inte lagras som "skadad". Planpunktens avvikelse behaller sitt namn.
    expect(OBSERVATION_TYPER).not.toContain('hansyn_skadad');
    expect([...AVVIKELSE_TYPER]).toContain('hansyn_skadad');
  });

  it('varje val har ett ord, och varje ton ett tecken - farg ar aldrig ensam', () => {
    for (const t of OBSERVATION_TONER) {
      expect(OBSERVATION_TON[t].etikett.length).toBeGreaterThan(0);
      expect(OBSERVATION_TON[t].tecken.length).toBeGreaterThan(0);
    }
    expect(new Set(OBSERVATION_TONER.map((t) => OBSERVATION_TON[t].tecken)).size).toBe(3);
    for (const t of OBSERVATION_TYPER) expect(OBSERVATION_TYP_ETIKETT[t].length).toBeGreaterThan(0);
  });

  it('knappen heter aldrig avvikelse: tonen Avvikelse ar ett av tre val, inte namnet pa funktionen', () => {
    // Namnet pa knappen ar "Notera har" (sidan). Har kontrolleras bara att tonerna ar tre och neutrala i ordning.
    expect(OBSERVATION_TON.bra.etikett).toBe('Bra');
    expect(OBSERVATION_TON.battre.etikett).toBe('Kan bli bättre');
    expect(OBSERVATION_TON.avvikelse.etikett).toBe('Avvikelse');
  });

  it('typvakterna avvisar allt annat', () => {
    expect(arObservationTon('godkant')).toBe(false);
    expect(arObservationTon('ok')).toBe(false);
    expect(arObservationTon(null)).toBe(false);
    expect(arObservationTyp('hansyn_skadad')).toBe(false);
    expect(arObservationTyp('hansyn')).toBe(true);
  });

  it('observationer har ordning 0 - inte en plats i serien', () => {
    expect(OBSERVATION_ORDNING).toBe(0);
  });
});

describe('delaObservationer - observationer ar tillagg, inte punkter', () => {
  const rad = (id: string, kalla: string, besvarad: string | null = null) => ({ id, kalla, besvarad });

  it('delar vid kallan: planpunkter, utforande och matning pa ena sidan, observationer pa den andra', () => {
    const { punkter, observationer } = delaObservationer([
      rad('a', 'markering'), rad('b', 'fast'), rad('o1', 'observation'), rad('c', 'fast'),
    ]);
    expect(punkter.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(observationer.map((p) => p.id)).toEqual(['o1']);
  });

  it('en observation hamnar ALDRIG bland punkterna, vad den an heter', () => {
    const { punkter } = delaObservationer([rad('o1', 'observation'), rad('o2', 'observation')]);
    expect(punkter).toEqual([]);
  });

  it('observationerna i den ordning de gjordes: aldst forst, id avgor lika tid', () => {
    const { observationer } = delaObservationer([
      rad('c', 'observation', '2026-10-17T10:30:00Z'),
      rad('a', 'observation', '2026-10-17T09:00:00Z'),
      rad('b2', 'observation', '2026-10-17T10:00:00Z'),
      rad('b1', 'observation', '2026-10-17T10:00:00Z'),
    ]);
    expect(observationer.map((o) => o.id)).toEqual(['a', 'b1', 'b2', 'c']);
  });

  it('tomt in, tomt ut', () => {
    expect(delaObservationer([])).toEqual({ punkter: [], observationer: [] });
  });

  it('arObservation tal null och undefined', () => {
    expect(arObservation(null)).toBe(false);
    expect(arObservation(undefined)).toBe(false);
    expect(arObservation({ kalla: 'fast' })).toBe(false);
    expect(arObservation({ kalla: 'observation' })).toBe(true);
  });
});

describe('sparaKrav - EN regel for knappen och skrivningen', () => {
  const ok = { ton: 'bra' as const, typ: 'korspar' as const, antalFoton: 0, harPosition: true };

  it('bra eller kan bli battre racker utan foto', () => {
    expect(sparaKrav(ok)).toEqual({ kan: true, saknas: null });
    expect(sparaKrav({ ...ok, ton: 'battre' }).kan).toBe(true);
  });

  it('AVVIKELSE KRAVER FOTO', () => {
    const r = sparaKrav({ ...ok, ton: 'avvikelse' });
    expect(r.kan).toBe(false);
    expect(r.saknas).toBe('En avvikelse behöver ett foto.');
    expect(sparaKrav({ ...ok, ton: 'avvikelse', antalFoton: 1 }).kan).toBe(true);
  });

  it('ton och typ kravs, och det forsta som saknas sags forst', () => {
    expect(sparaKrav({ ...ok, ton: null }).saknas).toMatch(/bra, kan bli bättre eller en avvikelse/);
    expect(sparaKrav({ ...ok, typ: null }).saknas).toBe('Välj vad det gäller.');
    expect(sparaKrav({ ...ok, ton: null, typ: null }).saknas).toMatch(/bra/);
  });

  it('POSITION KRAVS - utan den gar det inte att spara', () => {
    const r = sparaKrav({ ...ok, harPosition: false });
    expect(r.kan).toBe(false);
    expect(r.saknas).toMatch(/Positionen saknas/);
  });

  it('varje saknad sak ar en uppmaning, aldrig en forklaring av vad som gick fel', () => {
    for (const k of [
      { ...ok, ton: null }, { ...ok, typ: null }, { ...ok, ton: 'avvikelse' as const }, { ...ok, harPosition: false },
    ]) {
      expect(sparaKrav(k).saknas).toMatch(/^(Välj|En avvikelse behöver|Positionen saknas)/);
    }
  });
});

describe('giltigPosition', () => {
  it('riktiga koordinater duger', () => {
    expect(giltigPosition(56.1234, 14.5678)).toBe(true);
    expect(giltigPosition(-33.9, 151.2)).toBe(true);
  });
  it('NaN, Infinity, utanfor jorden, strang och noll/noll dugar inte', () => {
    expect(giltigPosition(NaN, 14)).toBe(false);
    expect(giltigPosition(56, Infinity)).toBe(false);
    expect(giltigPosition(91, 14)).toBe(false);
    expect(giltigPosition(56, 181)).toBe(false);
    expect(giltigPosition('56', '14')).toBe(false);
    expect(giltigPosition(null, null)).toBe(false);
    expect(giltigPosition(0, 0)).toBe(false);
  });
});

describe('observationText + nyttPunktId', () => {
  it('"Bra · Korspar" i ord', () => {
    expect(observationText({ status: 'bra', avvikelse_typ: 'korspar' })).toBe('Bra · Körspår');
    expect(observationText({ status: 'avvikelse', avvikelse_typ: 'hansyn' })).toBe('Avvikelse · Hänsyn');
  });
  it('okand ton eller typ visas som den ar - aldrig ett tomt falt', () => {
    expect(observationText({ status: 'x', avvikelse_typ: null })).toBe('x · Okänd typ');
    expect(observationText({ status: null, avvikelse_typ: 'y' })).toBe('Okänd ton · y');
  });
  it('ett nytt id ar ett uuid, och tva ar aldrig lika', () => {
    const a = nyttPunktId();
    const b = nyttPunktId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe('observationernas ikoner - formen skiljer, inte bara fargen', () => {
  it('tre olika former och tre olika tecken', () => {
    const former = OBSERVATION_TONER.map((t) => OBSERVATION_IKON[t].form);
    const tecken = OBSERVATION_TONER.map((t) => OBSERVATION_IKON[t].glyf);
    expect(new Set(former).size).toBe(3);
    expect(new Set(tecken).size).toBe(3);
  });

  it('tre olika fyllningar - och ingen ar bla (blatt ar positionen och provytan)', () => {
    const fyllningar = OBSERVATION_TONER.map((t) => OBSERVATION_IKON[t].fyllning.toLowerCase());
    expect(new Set(fyllningar).size).toBe(3);
    expect(fyllningar).not.toContain('#0a84ff');
    expect(OBSERVATION_TON_FARG.bra).toBe(OBSERVATION_IKON.bra.fyllning);
  });

  it('allt ritat ryms i ikonens ruta, kanten inraknad', () => {
    const m = OBS_RUTA / 2;
    for (const t of OBSERVATION_TONER) {
      const kant = OBSERVATION_IKON[t].kantBredd / 2;
      for (const [dx, dy] of ikonPunkter(t)) {
        expect(m + dx + kant).toBeLessThanOrEqual(OBS_RUTA);
        expect(m + dx - kant).toBeGreaterThanOrEqual(0);
        expect(m + dy + kant).toBeLessThanOrEqual(OBS_RUTA);
        expect(m + dy - kant).toBeGreaterThanOrEqual(0);
      }
    }
    expect(CIRKEL_RADIE + OBSERVATION_IKON.bra.kantBredd).toBeLessThan(m);
  });

  it('bildnamnen ar unika per ton och matchar lagrets uttryck', () => {
    const namn = OBSERVATION_TONER.map(observationBildNamn);
    expect(new Set(namn).size).toBe(3);
    // Lagret bygger namnet som 'observation-' + ton - ur samma funktion ar det samma namn.
    const lager = observationLager()[0];
    const uttryck = expression.createExpression(lager.layout['icon-image']);
    expect(uttryck.result).toBe('success');
    for (const t of OBSERVATION_TONER) {
      const v = (uttryck as any).value.evaluate({ zoom: 15 }, { type: 1, properties: { ton: t } });
      expect(v).toBe(observationBildNamn(t));
    }
  });
});

describe('observationFeatures - ritas dar de gjordes', () => {
  const obs = (over: Partial<{ id: string; status: string | null; avvikelse_typ: string | null; lat: number | null; lng: number | null }> = {}) => ({
    id: 'o1', status: 'bra', avvikelse_typ: 'korspar', lat: 56.1234, lng: 14.5678, ...over,
  });

  it('en feature per observation, i observationens EGNA WGS84-position (lng, lat)', () => {
    const [f] = observationFeatures([obs()]);
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [14.5678, 56.1234] });
    expect(f.properties).toMatchObject({ id: 'o1', kind: 'observation', ton: 'bra', typ: 'korspar' });
  });

  it('ritar inte det som saknar riktig position eller har en okand ton', () => {
    expect(observationFeatures([obs({ lat: null })])).toEqual([]);
    expect(observationFeatures([obs({ lng: NaN })])).toEqual([]);
    expect(observationFeatures([obs({ lat: 0, lng: 0 })])).toEqual([]);
    expect(observationFeatures([obs({ status: 'godkant' })])).toEqual([]);
    expect(observationFeatures([obs({ status: null })])).toEqual([]);
  });

  it('en okand typ ritas anda - som annat, aldrig en forsvunnen observation', () => {
    const [f] = observationFeatures([obs({ avvikelse_typ: 'nagot_nytt' })]);
    expect(f.properties.typ).toBe('annat');
  });

  it('alla tre toner far varsin feature med sin ton', () => {
    const fs = observationFeatures([
      obs({ id: '1', status: 'bra' }), obs({ id: '2', status: 'battre' }), obs({ id: '3', status: 'avvikelse' }),
    ]);
    expect(fs.map((f) => f.properties.ton)).toEqual(['bra', 'battre', 'avvikelse']);
  });
});

describe('observationslagret ar giltigt enligt MapLibres egen stil-spec', () => {
  const stil = {
    version: 8 as const,
    sources: { [OBSERVATION_KALLA]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } } as any,
    layers: observationLager(),
  };

  it('inga fel utom att bilderna laggs till vid korning', () => {
    const fel = validateStyleMin(stil as any).map((f: any) => `${f.message}`).filter((m: string) => !/sprite/i.test(m));
    expect(fel).toEqual([]);
  });

  it('ett lager, med ett id som tryckhanteraren kan', () => {
    expect(observationLager()).toHaveLength(1);
    expect(observationLager()[0].id).toBe(OBSERVATION_LAGER_ID);
    expect(observationLagerIdn()).toEqual([OBSERVATION_LAGER_ID]);
    // Tryckhanteraren filtrerar pa 'ek-p-' (kontrollpunkterna): observationen far INTE heta sa.
    expect(OBSERVATION_LAGER_ID.startsWith('ek-p-')).toBe(false);
  });

  it('allow-overlap: en observation ritas alltid, aven bredvid en kontrollpunkt', () => {
    const l = observationLager()[0];
    expect(l.layout['icon-allow-overlap']).toBe(true);
    expect(l.layout['icon-ignore-placement']).toBe(true);
  });
});

describe('tryck pa en observation', () => {
  it('kind observation kanns igen, med sitt id', () => {
    expect(traffKindFranEgenskaper({ kind: 'observation', id: 'abc' })).toBe('observation');
    expect(traffIdFranEgenskaper({ kind: 'observation', id: 'abc' })).toBe('abc');
  });

  it('rankas som en symbol: en observation ovanpa en basvag ar den man menade', () => {
    expect(traffRang('observation')).toBe(traffRang('symbol'));
    expect(traffRang('observation')).toBeLessThan(traffRang('linje'));
  });

  it('traffytan ar 44 pt-kvadrat kring fingret - lika for observationen som for allt annat', () => {
    expect(TRAFF_RADIE_PX * 2).toBeGreaterThanOrEqual(44);
    const t = valjTraff([
      { id: 'vag', kind: 'linje', dPx: 3 },
      { id: 'obs', kind: 'observation', dPx: TRAFF_RADIE_PX - 1 },
    ]);
    expect(t?.id).toBe('obs');
    expect(valjTraff([{ id: 'obs', kind: 'observation', dPx: TRAFF_RADIE_PX + 1 }])).toBeNull();
  });
});
