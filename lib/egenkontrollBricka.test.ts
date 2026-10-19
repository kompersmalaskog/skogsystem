import { describe, expect, it } from 'vitest';
import { angraForstaSvaret, utforandeKatalog, type EgenkontrollPunkt } from './egenkontroll';
import {
  BRICKA_NAMN, BRICKSTATUS, DOCK_SKYDD_MS, RAD_MAX_DVH, brickaTryck, byggBrickor, inomDockSkydd, kvarText, radHandling, radKnappar, svarsDel,
} from './egenkontrollBricka';

function punkt(over: Partial<EgenkontrollPunkt>): EgenkontrollPunkt {
  return {
    id: 'p', egenkontroll_id: 'r', ordning: 1, del: 'utforande', grupp: null, kalla: 'fast', markering_id: null,
    markering_marker_id: null, punkt_typ: 'korspar', rubrik: 'Körspår', antal_planerat: null, geometri_snapshot: null,
    plan_kommentar: null, status: null, avvikelse_typ: null, kommentar: null, varde_foreslaget: null, varde_bekraftat: null,
    lat: null, lng: null, besvarad: null, ...over,
  };
}

/** En runda som den ser ut efter generering: katalogens punkter + några planpunkter, en mätning och en observation. */
function runda(typ: 'gallring' | 'slutavverkning'): EgenkontrollPunkt[] {
  const utf = utforandeKatalog(typ).map((m, i) => punkt({ id: `u${i}`, ordning: i + 1, punkt_typ: m.slug, rubrik: m.rubrik }));
  return [
    punkt({ id: 'plan1', del: 'plan', kalla: 'markering', punkt_typ: 'hansyn', rubrik: 'Högstubbe', ordning: 1 }),
    ...utf,
    punkt({ id: 'stubbe', del: 'matning', punkt_typ: 'stubbehandling', rubrik: 'Stubbehandling', ordning: 50 }),
    punkt({ id: 'obs', del: 'observation', kalla: 'observation', ordning: 0, rubrik: 'Observation' }),
  ];
}

describe('byggBrickor', () => {
  it('slutavverkning ger ELVA brickor och gallring TIO — bara del utforande, aldrig mätning, plan eller observation', () => {
    expect(byggBrickor(runda('slutavverkning'))).toHaveLength(11);
    expect(byggBrickor(runda('gallring'))).toHaveLength(10);
    for (const typ of ['slutavverkning', 'gallring'] as const) {
      const ids = byggBrickor(runda(typ)).map((b) => b.id);
      expect(ids).not.toContain('stubbe');
      expect(ids).not.toContain('plan1');
      expect(ids).not.toContain('obs');
    }
  });

  it('brickorna ligger i rundans ordning, inte i radernas ordning i listan', () => {
    const blandat = [punkt({ id: 'c', ordning: 3 }), punkt({ id: 'a', ordning: 1 }), punkt({ id: 'b', ordning: 2 })];
    expect(byggBrickor(blandat).map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });

  it('varje katalogpunkt har ett kort namn och en ikon; namnen ryms (<= 10 tecken)', () => {
    for (const typ of ['slutavverkning', 'gallring'] as const) {
      for (const m of utforandeKatalog(typ)) {
        const k = BRICKA_NAMN[m.slug];
        expect(k, m.slug).toBeDefined();
        expect(k.namn.length).toBeLessThanOrEqual(10);
        expect(k.ikon.length).toBeGreaterThan(0);
      }
    }
  });

  it('en okänd slug (äldre data) blir en bricka med rubriken — aldrig en saknad bricka', () => {
    const [b] = byggBrickor([punkt({ id: 'x', punkt_typ: 'nagot_nytt', rubrik: 'Något nytt' })]);
    expect(b.namn).toBe('Något nytt');
    expect(b.ikon).toBe('checklist');
    const [utanSlug] = byggBrickor([punkt({ id: 'y', punkt_typ: null, rubrik: 'Utan nyckel' })]);
    expect(utanSlug.namn).toBe('Utan nyckel');
  });

  it('statusen följer med oförändrad (null = obesvarad)', () => {
    const [a, b] = byggBrickor([punkt({ id: 'a', ordning: 1, status: 'godkant' }), punkt({ id: 'b', ordning: 2, status: null })]);
    expect(a.status).toBe('godkant');
    expect(b.status).toBeNull();
  });
});

describe('brickaTryck — TRYCK MARKERAR, RADEN SVARAR', () => {
  it('ett tryck markerar ALLTID den tryckta brickan', () => {
    for (const status of [null, 'bra', 'godkant', 'battre']) {
      for (const last of [false, true]) {
        expect(brickaTryck({ id: 'q', status }, last).markera).toBe('q');
      }
    }
  });

  it('obesvarad bricka på en öppen runda: tryck ger Bra', () => {
    expect(brickaTryck({ id: 'q', status: null }, false)).toEqual({ markera: 'q', svara: 'bra' });
  });

  it('BESVARAD bricka: tryck skriver INGET — vilket svar som än står', () => {
    for (const status of ['bra', 'godkant', 'battre']) {
      expect(brickaTryck({ id: 'q', status }, false).svara).toBeNull();
    }
  });

  it('avslutad runda: tryck markerar men skriver aldrig, inte ens på en obesvarad bricka', () => {
    expect(brickaTryck({ id: 'q', status: null }, true)).toEqual({ markera: 'q', svara: null });
  });
});

describe('raden', () => {
  it('utförande: Bra, Godkänt, Bättre; plan: OK, Avvikelse; mätning och okänd del: inga svarsknappar', () => {
    expect(radKnappar('utforande').map((k) => k.status)).toEqual(['bra', 'godkant', 'battre']);
    expect(radKnappar('utforande').map((k) => k.etikett)).toEqual(['Bra', 'Godkänt', 'Bättre']);
    expect(radKnappar('plan').map((k) => k.status)).toEqual(['ok', 'avvikelse']);
    expect(radKnappar('matning')).toEqual([]);
    expect(radKnappar('observation')).toEqual([]);
  });

  it('en knapp i raden SKRIVER sitt eget svar (Avvikelse öppnar formuläret i stället); en låst runda gör ingenting', () => {
    expect(radHandling('bra', false)).toBe('svara');
    expect(radHandling('godkant', false)).toBe('svara');
    expect(radHandling('battre', false)).toBe('svara');
    expect(radHandling('ok', false)).toBe('svara');
    expect(radHandling('avvikelse', false)).toBe('avvikelse-ark');
    for (const s of ['bra', 'godkant', 'battre', 'ok', 'avvikelse'] as const) expect(radHandling(s, true)).toBe('ingen');
  });

  it('svarsDel: bara plan och utförande har en svarsfunktion', () => {
    expect(svarsDel('plan')).toBe('plan');
    expect(svarsDel('utforande')).toBe('utforande');
    expect(svarsDel('matning')).toBeNull();
    expect(svarsDel('observation')).toBeNull();
  });

  it('varje svar har ett tecken OCH ett ord — färg bär aldrig ensam', () => {
    for (const s of ['bra', 'ok', 'godkant', 'battre', 'avvikelse']) {
      expect(BRICKSTATUS[s].tecken.length).toBeGreaterThan(0);
      expect(BRICKSTATUS[s].ord.length).toBeGreaterThan(0);
    }
    // Godkänt är inte grönt (Bra) och inte blått (blått är bara navigering).
    expect(BRICKSTATUS.godkant.farg).toBe('text2');
  });
});

describe('RAD_MAX_DVH — radens maxhöjd på en avslutad runda', () => {
  it('är en bestämd andel av skärmen: tillräckligt för att läsa utan scroll i vanliga fall, men så lite att dockan lämnar kartan synlig', () => {
    expect(RAD_MAX_DVH).toBeGreaterThanOrEqual(20);   // under det är en vanlig anteckning (några rader) redan en scrollruta
    expect(RAD_MAX_DVH).toBeLessThanOrEqual(35);      // över det tar dock + rad mer än två tredjedelar av en 760 px hög skärm
  });
});

describe('kvarText', () => {
  it('ETT tal: vad som återstår; Klart när inget är kvar; Avslutad på en klar runda', () => {
    expect(kvarText(5, false)).toBe('5 kvar');
    expect(kvarText(1, false)).toBe('1 kvar');
    expect(kvarText(0, false)).toBe('Klart');
    expect(kvarText(0, true)).toBe('Avslutad');
    expect(kvarText(3, true)).toBe('Avslutad');
  });
});

describe('angraForstaSvaret', () => {
  type Kedja = { ops: [string, ...any[]][] };
  function fejk(svar: (k: Kedja) => { data: any; error: any }) {
    const kedjor: Kedja[] = [];
    const klient: any = {
      from() {
        const k: Kedja = { ops: [] };
        kedjor.push(k);
        const b: any = new Proxy({}, {
          get(_t, op: string) {
            if (op === 'then') return (res: any, rej: any) => Promise.resolve(svar(k)).then(res, rej);
            return (...args: any[]) => { k.ops.push([op, ...args]); return b; };
          },
        });
        return b;
      },
    };
    return { klient, kedjor };
  }
  const har = (k: Kedja, namn: string, ...a: any[]) => k.ops.some((o) => o[0] === namn && a.every((x, i) => o[i + 1] === x));

  it('nollar status, typ och tid — men BARA om svaret fortfarande är det som skrevs', async () => {
    const { klient, kedjor } = fejk(() => ({ data: { id: 'p', status: null, besvarad: null }, error: null }));
    await angraForstaSvaret('p', 'utforande', 'bra', { klient });
    const k = kedjor[0];
    expect(k.ops.find((o) => o[0] === 'update')![1]).toEqual({ status: null, avvikelse_typ: null, besvarad: null });
    expect(har(k, 'eq', 'id', 'p')).toBe(true);
    expect(har(k, 'eq', 'del', 'utforande')).toBe(true);
    expect(har(k, 'eq', 'status', 'bra')).toBe(true);
  });

  it('noll rader tillbaka (svaret hann ändras, eller rundan avslutades) är ett FEL', async () => {
    const { klient } = fejk(() => ({ data: null, error: null }));
    await expect(angraForstaSvaret('p', 'utforande', 'bra', { klient })).rejects.toThrow('redan ändrat');
  });

  it('ett databasfel kastas med sin text; en rad som fortfarande har ett svar kastas', async () => {
    const fel = fejk(() => ({ data: null, error: { message: 'boom' } }));
    await expect(angraForstaSvaret('p', 'utforande', 'bra', { klient: fel.klient })).rejects.toThrow('boom');
    const kvar = fejk(() => ({ data: { id: 'p', status: 'bra', besvarad: '2026-10-19T08:00:00Z' }, error: null }));
    await expect(angraForstaSvaret('p', 'utforande', 'bra', { klient: kvar.klient })).rejects.toThrow('som väntat');
    // Status tom men besvarad kvar: raderna säger olika — det är ett fel, inte ett lyckat Ångra.
    const halv = fejk(() => ({ data: { id: 'p', status: null, besvarad: '2026-10-19T08:00:00Z' }, error: null }));
    await expect(angraForstaSvaret('p', 'utforande', 'bra', { klient: halv.klient })).rejects.toThrow('som väntat');
  });
});

describe('DOCK_SKYDD_MS — dubbeltrycksskyddet i dockan', () => {
  it('är kort nog att inte kännas som en fördröjning och långt nog för ett sent dubbeltryck (samma 250–500 ms som skyddet i den borttagna serien)', () => {
    expect(DOCK_SKYDD_MS).toBeGreaterThanOrEqual(250);
    expect(DOCK_SKYDD_MS).toBeLessThanOrEqual(500);
  });

  it('inomDockSkydd: inert strikt före skyddets slut, aldrig vid noll (inget skydd har startat)', () => {
    expect(inomDockSkydd(1_000, 0)).toBe(false);
    expect(inomDockSkydd(1_000, 1_000 + DOCK_SKYDD_MS)).toBe(true);
    expect(inomDockSkydd(1_000 + DOCK_SKYDD_MS - 1, 1_000 + DOCK_SKYDD_MS)).toBe(true);
    expect(inomDockSkydd(1_000 + DOCK_SKYDD_MS, 1_000 + DOCK_SKYDD_MS)).toBe(false);
  });
});
