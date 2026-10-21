import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bolagNyckel, forifyllBolag, hamtaBolag, skapaBolag, sokBolag } from './bolag';

afterEach(() => vi.unstubAllGlobals());

describe('bolagNyckel och sökning', () => {
  it('samma bolag oavsett versaler och mellanslag', () => {
    expect(bolagNyckel(' ATA   Timber ')).toBe('ata timber');
    expect(bolagNyckel(null)).toBe('');
  });

  it('sök: delträff, och ett nytt namn erbjuds bara när ingen har exakt det namnet', () => {
    const alla = [{ id: 1, namn: 'Vida' }, { id: 2, namn: 'Vida Energi' }, { id: 3, namn: 'Privat' }];
    expect(sokBolag(alla, 'vid')).toEqual({ traffar: [alla[0], alla[1]], kanSkapa: true });
    expect(sokBolag(alla, 'VIDA').kanSkapa).toBe(false); // finns redan, annan versalisering
    expect(sokBolag(alla, 'ATA Timber')).toEqual({ traffar: [], kanSkapa: true });
    expect(sokBolag(alla, '  ')).toEqual({ traffar: alla, kanSkapa: false });
    expect(sokBolag([], '')).toEqual({ traffar: [], kanSkapa: false });
  });
});

describe('förifyllning — aldrig en reserv', () => {
  const vida = { bolag: 'Vida', bolag_id: 1 };
  const ata = { bolag: 'ATA Timber', bolag_id: 7 };
  it('typens poster om de är ett bolag; annars månadens; annars inget', () => {
    expect(forifyllBolag([{ typ: 'gallring', ...vida }], 'slutavverkning')).toEqual({ id: 1, namn: 'Vida' });
    expect(forifyllBolag([{ typ: 'gallring', ...vida }, { typ: 'slutavverkning', ...ata }], 'gallring')).toEqual({ id: 1, namn: 'Vida' });
    expect(forifyllBolag([{ typ: 'gallring', ...vida }, { typ: 'gallring', ...ata }], 'slutavverkning')).toBeNull(); // två kunder: ingen gissning
    expect(forifyllBolag([], 'gallring')).toBeNull(); // inget finns: inget "Vida"
  });
  it('en gammal post utan bolag_id kan inte förifylla (det går inte att skriva vidare på den)', () => {
    expect(forifyllBolag([{ typ: 'gallring', bolag: 'Vida', bolag_id: null }], 'gallring')).toBeNull();
  });
});

describe('/api/bolag', () => {
  it('hamtaBolag: ett fel är ett fel, aldrig en tom lista', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'nere' }) })));
    await expect(hamtaBolag()).rejects.toThrow('nere');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
    await expect(hamtaBolag()).rejects.toThrow('oväntat svar');
  });

  it('skapaBolag: POST med namnet, och servern avgör om det redan fanns', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ bolag: { id: 9, namn: 'ATA Timber' } }) }));
    vi.stubGlobal('fetch', f);
    expect(await skapaBolag('  ATA Timber ')).toEqual({ id: 9, namn: 'ATA Timber' });
    expect(f).toHaveBeenCalledWith('/api/bolag', expect.objectContaining({ method: 'POST', body: JSON.stringify({ namn: 'ATA Timber' }) }));
    await expect(skapaBolag('   ')).rejects.toThrow('Skriv ett namn');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Kräver admin' }) })));
    await expect(skapaBolag('X')).rejects.toThrow('Kräver admin');
  });
});

describe('inget standardbolag — källvakt', () => {
  // Ett hårdkodat { bolag: 'Vida', bolag_id: 1 } som sista utväg lät en beställning tyst hamna på fel kund (bestallningar.bolag är NOT NULL och
  // avgör vem man är skyldig virke). Samma slags fel som 3 495: ett värde som ser rätt ut och är fel.
  const filer = [
    ...readdirSync(join(process.cwd(), 'lib/objekt')).filter(f => /\.tsx?$/.test(f) && !/\.test\./.test(f)).map(f => `lib/objekt/${f}`),
    ...readdirSync(join(process.cwd(), 'app/objekt/_components')).filter(f => /\.tsx?$/.test(f)).map(f => `app/objekt/_components/${f}`),
  ];
  const utanKommentarer = (fil: string) => readFileSync(join(process.cwd(), fil), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

  it('ingen fil under lib/objekt eller app/objekt/_components har ett standardbolag eller ett hårdkodat Vida', () => {
    expect(filer.length).toBeGreaterThan(10);
    for (const fil of filer) {
      const kod = utanKommentarer(fil);
      expect(kod, fil).not.toMatch(/standardBolag/);
      expect(kod, fil).not.toMatch(/bolag_id:\s*1\b/);
      expect(kod, fil).not.toMatch(/bolag:\s*['"`]Vida['"`]/);
      expect(kod, fil).not.toMatch(/\?\?\s*['"`]Vida['"`]/);
    }
  });
});
