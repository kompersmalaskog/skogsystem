/**
 * Markägarens anmälan → push till MASKINENS prenumerationer. Riktig route + riktig skapaAnmalan mot en tabellfake; web-push är fejkad.
 * Bevisar: anmälan sparas och pushen går till maskinens enheter (inte förarens telefon, oavsett vem som är inloggad), och att en misslyckad push aldrig fäller anmälan.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ sb: null as any, skickat: [] as { endpoint: string; payload: any }[], sendFel: false, vapid: 'privat' as string | undefined }));

vi.mock('@/lib/besok/tjanst', async (orig) => ({ ...(await orig<typeof import('@/lib/besok/tjanst')>()), tjanstKlient: () => h.sb }));
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: any, payload: string) => {
      if (h.sendFel) throw new Error('push nere');
      h.skickat.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    },
  },
}));
vi.mock('@/lib/push/vapid', async (orig) => ({ ...(await orig<typeof import('@/lib/push/vapid')>()), vapidPrivatNyckel: () => h.vapid ?? null }));

import { NextRequest } from 'next/server';
import { fakeSb } from '@/lib/besok/fakeSb.testStod';
import { rensaBesokCache } from '@/lib/besok/server';
import { POST } from './route';

const TOKEN = 'T'.repeat(40);
const OBJ = '00000000-0000-4000-8000-0000000000aa';
const sub = (id: string, maskin_id: string | null, medarbetare_id: string) => ({ id, subscription: { endpoint: `https://push/${id}` }, maskin_id, medarbetare_id });

function varld(subs: any[]) {
  return fakeSb({
    objekt_besok_lank: [{ token: TOKEN, objekt_id: OBJ, aktiv: true }],
    objekt: [{ id: OBJ, namn: 'Skälviken', status: 'pagaende', skordare_maskin_id: null, skotare_maskin_id: 'A130743' }],
    objekt_besok: [], hyttspar: [],
    dim_maskin: [{ maskin_id: 'A130743', visningsnamn: 'Elefant 26', maskin_typ: 'Forwarder' }],
    push_subscriptions: subs,
  });
}
const anmal = () => POST(new NextRequest(`http://x/api/besok/${TOKEN}/anmal`, { method: 'POST', body: JSON.stringify({ namn: 'Anna Svensson', telefon: '0701234567', nar: 'nu' }) }), { params: { token: TOKEN } });

beforeEach(() => { rensaBesokCache(); h.skickat = []; h.sendFel = false; h.vapid = 'privat'; });

describe('POST /api/besok/<token>/anmal — push till maskinen', () => {
  it('anmälan sparas och Elefantens dator (anmäld under Daniel) får notisen; förarens telefon och en annan förares maskin-prenumeration utanför objektet får ingenting', async () => {
    h.sb = varld([sub('dator', 'A130743', 'daniel'), sub('telefon', null, 'oskar'), sub('annan-dator', 'PONS20SDJAA270231', 'max')]);
    const res = await anmal();
    expect(res.status).toBe(200);
    expect(h.sb._loggar.filter((l: any) => l.tabell === 'objekt_besok' && l.op === 'insert')).toHaveLength(1);
    expect(h.skickat.map((x) => x.endpoint)).toEqual(['https://push/dator']);
    const n = h.skickat[0].payload.hyttNotis;
    expect(n.titel).toMatch(/^Besök: Anna Svensson kommer/);
    expect(n.data).toMatchObject({ hytt: true, typ: 'besok', maskinId: 'A130743' });
  });

  it('pushen innehåller varken markägarens telefonnummer eller något medarbetar-id', async () => {
    h.sb = varld([sub('dator', 'A130743', 'daniel-hemligt-id')]);
    await anmal();
    const rå = JSON.stringify(h.skickat);
    expect(rå).not.toContain('0701234567');
    expect(rå).not.toContain('daniel-hemligt-id');
  });

  it('web-push faller → anmälan lyckas ändå', async () => {
    h.sb = varld([sub('dator', 'A130743', 'daniel')]);
    h.sendFel = true;
    const res = await anmal();
    expect(res.status).toBe(200);
    expect(h.sb._loggar.filter((l: any) => l.tabell === 'objekt_besok')).toHaveLength(1);
  });

  it('VAPID-nyckeln saknas → anmälan lyckas ändå, ingen push skickas', async () => {
    h.sb = varld([sub('dator', 'A130743', 'daniel')]);
    h.vapid = undefined;
    const res = await anmal();
    expect(res.status).toBe(200);
    expect(h.skickat).toEqual([]);
  });

  it('kolumnen maskin_id saknas (migrationen ej körd) → anmälan lyckas ändå', async () => {
    h.sb = fakeSb({
      objekt_besok_lank: [{ token: TOKEN, objekt_id: OBJ, aktiv: true }],
      objekt: [{ id: OBJ, namn: 'Skälviken', status: 'pagaende', skordare_maskin_id: null, skotare_maskin_id: 'A130743' }],
      objekt_besok: [], hyttspar: [], dim_maskin: [{ maskin_id: 'A130743', visningsnamn: 'Elefant 26', maskin_typ: 'Forwarder' }], push_subscriptions: [],
    }, {}, { fel: { push_subscriptions: 'column "maskin_id" does not exist' } });
    expect((await anmal()).status).toBe(200);
  });

  it('ogiltig anmälan (saknat namn) → 400 och ingen push', async () => {
    h.sb = varld([sub('dator', 'A130743', 'daniel')]);
    const res = await POST(new NextRequest(`http://x/api/besok/${TOKEN}/anmal`, { method: 'POST', body: JSON.stringify({ namn: '', telefon: '0701234567', nar: 'nu' }) }), { params: { token: TOKEN } });
    expect(res.status).toBe(400);
    expect(h.skickat).toEqual([]);
  });
});
