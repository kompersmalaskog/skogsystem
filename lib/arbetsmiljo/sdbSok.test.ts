import { describe, it, expect } from 'vitest';
import { arPdf, hamtaPdf, kontrolleraText, lasEtikett, namnOrd, sakerUrl, sokUrler, tolkaEtikett, tolkaUrler, valjBlad, type KlientLike } from './sdbSok';
import { mejlLank } from './kemikalier';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
const svar = (status: number, body: Uint8Array | string, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : new Blob([body]), { status, headers });

describe('länkar appen får hämta', () => {
  it('bara https till vanliga värdnamn', () => {
    expect(sakerUrl('https://www.statoil.se/sdb/hydraway.pdf')).toBe('https://www.statoil.se/sdb/hydraway.pdf');
    for (const u of ['http://statoil.se/a.pdf', 'https://127.0.0.1/a.pdf', 'https://10.0.0.5/a', 'https://[::1]/a', 'https://localhost/a',
      'https://intranet/a', 'https://router.local/a', 'https://user:pw@statoil.se/a', 'https://statoil.se:8443/a',
      'https://mxydghzfacbenbgpodex.supabase.co/x', 'https://skogsystem.vercel.app/api', 'file:///etc/passwd', 'inte en adress']) {
      expect(sakerUrl(u), u).toBeNull();
    }
  });
  it('modellens svar: bara säkra länkar, högst tre, inga dubbletter', () => {
    const t = 'Här: ```json\n{"urler":["https://a.se/1.pdf","http://b.se/2.pdf","https://a.se/1.pdf","https://c.se/3.pdf","https://d.se/4.pdf","https://e.se/5.pdf"]}\n```';
    expect(tolkaUrler(t)).toEqual(['https://a.se/1.pdf', 'https://c.se/3.pdf', 'https://d.se/4.pdf']);
    expect(tolkaUrler('inget json')).toEqual([]);
  });
});

describe('etiketten', () => {
  it('namn och tillverkare, eller inget', () => {
    expect(tolkaEtikett('{"namn":" Hydraway  HVXA 46 ","tillverkare":"Statoil"}')).toEqual({ namn: 'Hydraway HVXA 46', tillverkare: 'Statoil' });
    expect(tolkaEtikett('{"namn":null,"tillverkare":"Statoil"}')).toBeNull();
    expect(tolkaEtikett('{"namn":"X-Guard","tillverkare":""}')).toEqual({ namn: 'X-Guard', tillverkare: null });
  });
  it('utan nyckel försöker den inte', async () => {
    expect(await lasEtikett('x', 'image/jpeg', null)).toEqual({ ok: false, skal: 'nyckel' });
  });
});

describe('är det ett säkerhetsblad för produkten?', () => {
  it('rubriken på svenska eller engelska, och ett ord ur namnet', () => {
    expect(kontrolleraText('SÄKERHETSDATABLAD Hydraway HVXA 46 AVSNITT 1', 'Hydraway HVXA 46')).toEqual({ arSdb: true, namnStammer: true });
    expect(kontrolleraText('Safety Data Sheet – Other product', 'Hydraway HVXA 46')).toEqual({ arSdb: true, namnStammer: false });
    expect(kontrolleraText('Produktblad Hydraway', 'Hydraway')).toEqual({ arSdb: false, namnStammer: true });
  });
  it('vanliga ord räknas inte som namn', () => {
    expect(namnOrd('Kedje olja 5 liter')).toEqual(['kedje']);
  });
  it('en PDF känns igen på sina första byte', () => {
    expect(arPdf(PDF)).toBe(true);
    expect(arPdf(new TextEncoder().encode('<html>'))).toBe(false);
  });
});

describe('hämtningen', () => {
  it('följer omdirigeringar för hand och kontrollerar varje adress', async () => {
    const besokt: string[] = [];
    const hamta = async (u: string) => {
      besokt.push(u);
      if (u === 'https://a.se/1') return svar(302, '', { location: '/2.pdf' });
      if (u === 'https://a.se/2.pdf') return svar(200, PDF);
      return svar(404, '');
    };
    expect(await hamtaPdf('https://a.se/1', hamta)).toEqual(PDF);
    expect(besokt).toEqual(['https://a.se/1', 'https://a.se/2.pdf']);
  });
  it('en omdirigering till en intern adress följs aldrig', async () => {
    const besokt: string[] = [];
    const hamta = async (u: string) => { besokt.push(u); return svar(302, '', { location: 'https://169.254.169.254/latest' }); };
    expect(await hamtaPdf('https://a.se/1', hamta)).toBeNull();
    expect(besokt).toEqual(['https://a.se/1']);
  });
  it('en webbsida eller en för stor fil är inget blad', async () => {
    expect(await hamtaPdf('https://a.se/1', async () => svar(200, '<html>'))).toBeNull();
    expect(await hamtaPdf('https://a.se/1', async () => svar(200, PDF, { 'content-length': String(50 * 1024 * 1024) }))).toBeNull();
  });
  it('väljer bladet där namnet syns före ett annat blad', async () => {
    const texter: Record<string, string> = { 1: 'Safety data sheet Other', 2: 'Säkerhetsdatablad Hydraway' };
    const pdfer: Record<string, Uint8Array> = { 'https://a.se/1.pdf': new Uint8Array([...PDF, 1]), 'https://a.se/2.pdf': new Uint8Array([...PDF, 2]) };
    const f = await valjBlad(Object.keys(pdfer), 'Hydraway', async u => svar(200, pdfer[u]), async b => texter[b[b.length - 1]]);
    expect(f).toMatchObject({ url: 'https://a.se/2.pdf', namnStammer: true });
    const bara = await valjBlad(['https://a.se/1.pdf'], 'Hydraway', async u => svar(200, pdfer[u]), async b => texter[b[b.length - 1]]);
    expect(bara).toMatchObject({ url: 'https://a.se/1.pdf', namnStammer: false });
    expect(await valjBlad(['https://a.se/1.pdf'], 'Hydraway', async u => svar(200, pdfer[u]), async () => 'Produktblad')).toBeNull();
  });
});

describe('sökningen', () => {
  it('fortsätter när svaret pausar, och provar nästa modell om en saknas', async () => {
    const anrop: Record<string, unknown>[] = [];
    const k: KlientLike = { messages: { create: async p => {
      anrop.push(p);
      if (p.model === 'claude-sonnet-5-5') throw Object.assign(new Error('model not found'), { status: 404 });
      if (anrop.filter(a => a.model !== 'claude-sonnet-5-5').length === 1) return { stop_reason: 'pause_turn', content: [{ type: 'text', text: '' }] };
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"urler":["https://statoil.se/a.pdf"]}' }] };
    } } };
    expect(await sokUrler({ namn: 'Hydraway', tillverkare: 'Statoil' }, k)).toEqual({ ok: true, urler: ['https://statoil.se/a.pdf'] });
    const sista = anrop[anrop.length - 1];
    expect((sista.tools as { type: string }[])[0].type).toBe('web_search_20250305');
    expect((sista.messages as unknown[]).length).toBe(2); // pausade svaret skickades med
  });
  it('ett annat fel än saknad modell är ett fel', async () => {
    const k: KlientLike = { messages: { create: async () => { throw Object.assign(new Error('overloaded'), { status: 529 }); } } };
    expect(await sokUrler({ namn: 'X', tillverkare: null }, k)).toEqual({ ok: false, skal: 'fel' });
  });
});

describe('mejlet till leverantören', () => {
  it('ämne och text är ifyllda, mottagaren fyller man i själv', () => {
    const l = mejlLank('HVXA 46', 'Statoil', 'Martin Lindqvist');
    expect(l.startsWith('mailto:?subject=')).toBe(true);
    const u = new URLSearchParams(l.slice('mailto:?'.length));
    expect(u.get('subject')).toBe('Säkerhetsdatablad för Statoil HVXA 46');
    expect(u.get('body')).toContain('Martin Lindqvist, Kompersmåla Skog AB');
    expect(new URLSearchParams(mejlLank('Statoil Hydraway', 'Statoil', null).slice(8)).get('subject')).toBe('Säkerhetsdatablad för Statoil Hydraway');
  });
});
