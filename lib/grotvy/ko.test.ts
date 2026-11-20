import { describe, it, expect } from 'vitest';
import { koRaderAttRensa, arGrotUnderlagTillforlitligt, raderaKoRader, type KoRad, type ObjektStatusRad } from './ko';

const ko = (id: string, objekt: string, maskin = 'A030353'): KoRad => ({ id, maskin_id: maskin, objekt_id: objekt });
const obj = (id: string, status: string | null): ObjektStatusRad => ({ id, status });

describe('koRaderAttRensa — kvarlevor efter GROT (bara där körd-regeln har slagit)', () => {
  const objekt = [obj('o-avsl', 'avslutat'), obj('o-klar', 'klar'), obj('o-pag', 'pagaende'), obj('o-plan', 'planerad'), obj('o-vantar', 'avslutat'), obj('o-annan', 'avslutat'), obj('o-null', null)];

  it('avslutad trakt där körd-regeln slagit → rensas', () => {
    expect(koRaderAttRensa([ko('k1', 'o-avsl')], objekt, new Set(['o-avsl']))).toEqual(['k1']);
  });
  it('även gamla statusen "klar" räknas som avslutad', () => {
    expect(koRaderAttRensa([ko('k1', 'o-klar')], objekt, new Set(['o-klar']))).toEqual(['k1']);
  });
  it('avslutad trakt som FORTFARANDE väntar på GROT (inte körd) → kvar', () => {
    expect(koRaderAttRensa([ko('k1', 'o-vantar')], objekt, new Set(['o-avsl']))).toEqual([]);
  });
  it('avslutad trakt som aldrig var GROT → rörs inte, hur gammal kö-raden än är', () => {
    expect(koRaderAttRensa([ko('k1', 'o-annan')], objekt, new Set(['o-avsl']))).toEqual([]);
    expect(koRaderAttRensa([ko('k1', 'o-annan')], objekt, new Set())).toEqual([]);
  });
  it('pågående och planerade objekt rörs aldrig, även om GROT är körd på dem (de kan ha en vanlig kö-rad)', () => {
    expect(koRaderAttRensa([ko('k1', 'o-pag'), ko('k2', 'o-plan')], objekt, new Set(['o-pag', 'o-plan']))).toEqual([]);
  });
  it('objekt utan känd status eller utan objekt-rad lämnas ifred', () => {
    expect(koRaderAttRensa([ko('k1', 'o-null'), ko('k2', 'okänt-objekt')], objekt, new Set(['o-null', 'okänt-objekt']))).toEqual([]);
  });
  it('blandad kö: bara de körda avslutade rensas, i kö-ordning', () => {
    const rader = [ko('k1', 'o-avsl'), ko('k2', 'o-pag'), ko('k3', 'o-vantar'), ko('k4', 'o-klar', 'A110148'), ko('k5', 'o-annan')];
    expect(koRaderAttRensa(rader, objekt, new Set(['o-avsl', 'o-klar', 'o-pag']))).toEqual(['k1', 'k4']);
  });
  it('tom kö eller tom mängd → inget att rensa', () => {
    expect(koRaderAttRensa([], objekt, new Set(['o-avsl']))).toEqual([]);
    expect(koRaderAttRensa([ko('k1', 'o-avsl')], objekt, new Set())).toEqual([]);
  });
});

describe('arGrotUnderlagTillforlitligt — aldrig rensning på ett tyst tomt läsresultat', () => {
  it('kräver både trakter och skördad volym', () => {
    expect(arGrotUnderlagTillforlitligt({ dim: [1], prod: [1] })).toBe(true);
    expect(arGrotUnderlagTillforlitligt({ dim: [], prod: [1] })).toBe(false);
    expect(arGrotUnderlagTillforlitligt({ dim: [1], prod: [] })).toBe(false);
    expect(arGrotUnderlagTillforlitligt({ dim: [], prod: [] })).toBe(false);
  });
});

// Minimal kedjebar fake för maskin_ko: delete().in('id', ids) och select('id').in('id', ids).
function fakeSb(rader: { id: string }[], opt: { deleteFel?: string; deleteGorInget?: boolean; selectFel?: string } = {}) {
  const tabell = rader.slice();
  const anrop: string[] = [];
  const sb = {
    from(namn: string) {
      anrop.push(`from:${namn}`);
      return {
        delete: () => ({
          in: async (_k: string, ids: string[]) => {
            anrop.push(`delete:${ids.join(',')}`);
            if (opt.deleteFel) return { error: { message: opt.deleteFel } };
            if (!opt.deleteGorInget) for (let i = tabell.length - 1; i >= 0; i--) if (ids.indexOf(tabell[i].id) >= 0) tabell.splice(i, 1);
            return { error: null };
          },
        }),
        select: () => ({
          in: async (_k: string, ids: string[]) => {
            anrop.push(`select:${ids.join(',')}`);
            if (opt.selectFel) return { data: null, error: { message: opt.selectFel } };
            return { data: tabell.filter((r) => ids.indexOf(r.id) >= 0), error: null };
          },
        }),
      };
    },
  };
  return { sb, tabell, anrop };
}

describe('raderaKoRader — bekräftar med samma predikat', () => {
  it('raderar och bekräftar att exakt dessa id:n är borta, övriga orörda', async () => {
    const { sb, tabell, anrop } = fakeSb([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const r = await raderaKoRader(sb, ['a', 'c']);
    expect(r).toEqual({ ok: true, raderade: 2, kvar: 0, message: '' });
    expect(tabell.map((x) => x.id)).toEqual(['b']);
    expect(anrop).toEqual(['from:maskin_ko', 'delete:a,c', 'from:maskin_ko', 'select:a,c']); // samma id-mängd i delete och kontroll
  });
  it('en radering som inte landade (0 rader träffades) syns som misslyckad — aldrig tyst ok', async () => {
    const { sb } = fakeSb([{ id: 'a' }, { id: 'b' }], { deleteGorInget: true });
    const r = await raderaKoRader(sb, ['a', 'b']);
    expect(r.ok).toBe(false);
    expect(r.kvar).toBe(2);
    expect(r.message).toContain('2 av 2');
  });
  it('fel vid radering → ok:false med felet, ingen kontroll gjord', async () => {
    const { sb, anrop } = fakeSb([{ id: 'a' }], { deleteFel: 'RLS' });
    const r = await raderaKoRader(sb, ['a']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('RLS');
    expect(anrop.some((a) => a.startsWith('select'))).toBe(false);
  });
  it('fel vid bekräftelsen → ok:false (vi vet inte att det gick)', async () => {
    const { sb } = fakeSb([{ id: 'a' }], { selectFel: 'timeout' });
    const r = await raderaKoRader(sb, ['a']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('timeout');
  });
  it('inga id:n → ok utan anrop', async () => {
    const { sb, anrop } = fakeSb([{ id: 'a' }]);
    expect(await raderaKoRader(sb, [])).toEqual({ ok: true, raderade: 0, kvar: 0, message: '' });
    expect(anrop).toEqual([]);
  });
  it('många id:n delas i bitar men bekräftas var för sig', async () => {
    const rader = Array.from({ length: 120 }, (_, i) => ({ id: `k${i}` }));
    const { sb, tabell, anrop } = fakeSb(rader);
    const r = await raderaKoRader(sb, rader.map((x) => x.id));
    expect(r.ok).toBe(true);
    expect(r.raderade).toBe(120);
    expect(tabell).toHaveLength(0);
    expect(anrop.filter((a) => a.startsWith('delete')).length).toBe(3); // 50 + 50 + 20
  });
});
