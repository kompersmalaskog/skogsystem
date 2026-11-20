// Skotarlänken: bakgrunden Ritad. Servern räknar området ur länkens trakt (aldrig ur klienten), samma regel som appen, och bara
// lyckade svar sparas. Stammarna (det avverkade) bara för slutavverkning.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const hamtat: { del: string; ringar: unknown }[] = [];
let laserStatus = 200;
vi.mock('@/lib/ritadKarta/serverHamta', () => ({
  hamtaLaser: async (r: unknown) => { hamtat.push({ del: 'laser', ringar: r }); return { status: laserStatus, body: laserStatus === 200 ? { ok: 1 } : { error: 'nej' } }; },
  hamtaMark: async (r: unknown) => { hamtat.push({ del: 'mark', ringar: r }); return { status: 200, body: {} }; },
  hamtaVagar: async (r: unknown) => { hamtat.push({ del: 'vagar', ringar: r }); return { status: 200, body: { type: 'FeatureCollection', features: [] } }; },
  hamtaDiken: async (r: unknown) => { hamtat.push({ del: 'diken', ringar: r }); return { status: 200, body: { type: 'FeatureCollection', features: [] } }; },
}));
const vy: any = { gran: [], origo: null, markeringar: [], mitt: { lat: 56.6, lng: 15.0 } };
vi.mock('./server', () => ({
  slaUppSkotarLank: async (_sb: unknown, token: string) => (token === 'ok'.repeat(20)
    ? { ok: true, objekt: { id: 'o-1', typ: objektTyp, vo_nummer: 'P-1', dim_objekt_id: null } }
    : { ok: false, skal: 'okand' }),
  lankFelSvar: () => ({ status: 404, body: { ok: false, fel: 'Länken finns inte' } }),
  cachadSkotarVy: async () => vy,
  objektStamIds: async () => ['P-1'],
}));
let objektTyp = 'slutavverkning';

import { egnaTraktgranser, rensaRitadCache, skotarRitadOmrade, skotarRitadSvar } from './ritad';
import { arOffentligSkotarSokvag } from './offentlig';
import { flyttaRitadUnder } from './useRitadSkotare';
import { RITAD_LAGER } from '@/lib/ritadKarta/lager';

const TOKEN = 'ok'.repeat(20);
const RING: [number, number][] = [[15, 56.6], [15.01, 56.6], [15.01, 56.61], [15, 56.6]];
const sb: any = {
  from: () => {
    const b: any = { select: () => b, in: () => b, not: () => b, order: () => b, range: () => Promise.resolve({ data: [{ latitude: 56.60012345678, longitude: 15.0001 }, { latitude: null, longitude: 15 }], error: null }) };
    return b;
  },
};

beforeEach(() => { hamtat.length = 0; laserStatus = 200; objektTyp = 'slutavverkning'; vy.gran = []; vy.origo = null; vy.markeringar = []; vy.mitt = { lat: 56.6, lng: 15.0 }; rensaRitadCache(); });

describe('skotarlänkens Ritad', () => {
  it('området: Vidas gräns först, annars planerarens egen, annars 1 km runt punkten — samma regel som appen', () => {
    vy.gran = [RING];
    expect(skotarRitadOmrade(vy)?.kalla).toBe('vida');
    vy.gran = [];
    vy.origo = { lat: 56.6, lng: 15.0, zoom: 16 };
    vy.markeringar = [{ id: 'b', isLine: true, lineType: 'boundary', path: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }];
    const egna = egnaTraktgranser(vy);
    expect(egna).toHaveLength(1);
    expect(egna[0][0]).toEqual(egna[0][egna[0].length - 1]);
    expect(skotarRitadOmrade(vy)?.kalla).toBe('egen');
    vy.origo = null;
    expect(skotarRitadOmrade(vy)?.kalla).toBe('punkt');
    vy.mitt = null;
    expect(skotarRitadOmrade(vy)).toBeNull();
  });

  it('servern skickar traktens ringar vidare — det klienten skickar finns inte ens som indata', async () => {
    vy.gran = [RING];
    const s = await skotarRitadSvar(sb, TOKEN, 'laser');
    expect(s.status).toBe(200);
    expect(hamtat).toEqual([{ del: 'laser', ringar: [RING] }]);
    const route = fs.readFileSync(path.resolve(__dirname, '../../app/api/skotare/[token]/ritad/route.ts'), 'utf8');
    expect(route).not.toMatch(/req\.json|ringar|bbox|lat|lng/);
  });

  it('okänd del och okänd token ger fel utan att något hämtas', async () => {
    expect((await skotarRitadSvar(sb, TOKEN, 'allt')).status).toBe(400);
    expect((await skotarRitadSvar(sb, 'x'.repeat(40), 'laser')).status).toBe(404);
    expect(hamtat).toHaveLength(0);
  });

  it('ett lyckat svar sparas, ett fel prövas igen nästa gång', async () => {
    laserStatus = 502;
    expect((await skotarRitadSvar(sb, TOKEN, 'laser')).status).toBe(502);
    laserStatus = 200;
    expect((await skotarRitadSvar(sb, TOKEN, 'laser')).status).toBe(200);
    expect((await skotarRitadSvar(sb, TOKEN, 'laser')).status).toBe(200);
    expect(hamtat.filter((h) => h.del === 'laser')).toHaveLength(2);
  });

  it('stammarna (det avverkade) bara för slutavverkning, rundade, utan rader som saknar position', async () => {
    const s = await skotarRitadSvar(sb, TOKEN, 'stammar');
    expect(s.body).toEqual({ kalla: 'punkt', punkter: [[56.600123, 15.0001]] });
    rensaRitadCache();
    objektTyp = 'gallring';
    expect((await skotarRitadSvar(sb, TOKEN, 'stammar')).body).toEqual({ kalla: 'punkt', punkter: [] });
  });

  it('adressen är öppen som resten av länken, inget annat', () => {
    expect(arOffentligSkotarSokvag(`/api/skotare/${'a'.repeat(40)}/ritad`)).toBe(true);
    expect(arOffentligSkotarSokvag(`/api/skotare/${'a'.repeat(40)}/ritad/laser`)).toBe(false);
    expect(arOffentligSkotarSokvag('/api/ritad-karta/laser')).toBe(false);
  });

  it('Ritads lager läggs under allt länken ritar, i sin egen ordning', () => {
    let lager = ['bg', 'bas-foto', 'bas-karta', 'sk-grans', 'sk-hogar', ...RITAD_LAGER.slice().reverse()].map((id) => ({ id }));
    const map: any = {
      getStyle: () => ({ layers: lager }),
      getLayer: (id: string) => lager.find((l) => l.id === id),
      moveLayer: (id: string, fore: string) => { const l = lager.find((x) => x.id === id)!; lager = lager.filter((x) => x !== l); lager.splice(lager.findIndex((x) => x.id === fore), 0, l); },
    };
    flyttaRitadUnder(map);
    expect(lager.map((l) => l.id)).toEqual(['bg', 'bas-foto', 'bas-karta', ...RITAD_LAGER, 'sk-grans', 'sk-hogar']);
  });
});
