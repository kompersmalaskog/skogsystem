import { describe, it, expect } from 'vitest';
import { GE_UPP_EFTER_MS, backoffMs, fotoNyckel, skapaFotoKo, skapaMinnesLager, type PatchSvar } from './fotoKo';

const bytes = (...n: number[]) => new Blob([new Uint8Array(n)], { type: 'image/jpeg' });
async function lasBytes(b: Blob | null): Promise<number[] | null> { return b ? Array.from(new Uint8Array(await b.arrayBuffer())) : null; }

function rigg(over: { ladda?: (s: string, b: Blob) => Promise<void>; patcha?: () => Promise<PatchSvar> } = {}) {
  const lager = skapaMinnesLager();
  const logg = { uppladdningar: [] as string[], uppe: [] as string[], patchar: [] as string[], forandringar: 0 };
  let tid = 1_000_000;
  const ko = skapaFotoKo({
    lager,
    ladda: over.ladda ?? (async (s) => { logg.uppladdningar.push(s); }),
    patcha: async (f) => { logg.patchar.push(f.markerId); return over.patcha ? over.patcha() : 'ok'; },
    nu: () => tid,
    paForandring: () => { logg.forandringar += 1; },
    paUppe: (f) => { logg.uppe.push(`${f.objektId}/${f.markerId}:${f.skapad}`); },
  });
  return { ko, lager, logg, framat: (ms: number) => { tid += ms; } };
}

describe('fotokön: lokalt först, upp i bakgrunden', () => {
  it('ett foto sparas lokalt direkt och går att läsa tillbaka (samma bytes) innan något laddats upp', async () => {
    const r = rigg();
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(1, 2, 3));
    expect(await lasBytes(await r.ko.lokaltFoto('obj', 'm1'))).toEqual([1, 2, 3]);
    expect((await r.ko.vantande()).map((f) => f.nyckel)).toEqual([fotoNyckel('obj', 'm1')]);
    expect(r.logg.uppladdningar).toEqual([]);
    expect(r.logg.forandringar).toBe(1);
  });

  it('när nätet finns: ladda upp → meddela sidan (photoPath) → sätt på raden → ta bort den lokala kopian', async () => {
    const r = rigg();
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(9));
    await r.ko.kor(true);
    expect(r.logg.uppladdningar).toEqual(['obj/m1.jpg']);
    expect(r.logg.uppe.length).toBe(1);
    expect(r.logg.patchar).toEqual(['m1']);
    expect(await r.ko.vantande()).toEqual([]);
    expect(await r.ko.lokaltFoto('obj', 'm1')).toBeNull();
  });

  it('misslyckas uppladdningen ligger fotot kvar (aldrig "ta om bilden") och försöks igen — med väntetid, utom när nätet kommer tillbaka', async () => {
    let nat = false; let forsok = 0;
    const r = rigg({ ladda: async () => { forsok += 1; if (!nat) throw new Error('inget nät'); } });
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(7));
    await r.ko.kor(false);
    expect(forsok).toBe(1);
    expect((await r.ko.vantande()).length).toBe(1);
    await r.ko.kor(false);                       // för tidigt: väntetiden har inte gått
    expect(forsok).toBe(1);
    r.framat(backoffMs(1) + 1);
    await r.ko.kor(false);                       // väntetiden gick: nytt försök (misslyckas igen)
    expect(forsok).toBe(2);
    nat = true;
    await r.ko.kor(true);                        // nätet kom tillbaka: direkt, utan väntetid
    expect(forsok).toBe(3);
    expect(await r.ko.vantande()).toEqual([]);
    expect(r.logg.uppe.length).toBe(1);
  });

  it('väntetiden växer 30 s → 1 min → 2 min … högst 15 min', () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(backoffMs(20)).toBe(15 * 60_000);
  });

  it('uppe i Storage men markeringens rad finns inte (än): fotot väntar kvar och laddas INTE upp en gång till — bara raden patchas när den finns', async () => {
    let svar: PatchSvar = 'saknas';
    const r = rigg({ patcha: async () => svar });
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(5));
    await r.ko.kor(true);
    expect(r.logg.uppladdningar.length).toBe(1);
    expect((await r.ko.vantande())[0]).toMatchObject({ uppladdad: true, saknadSedan: expect.any(Number) });
    svar = 'ok';
    await r.ko.kor(true);
    expect(r.logg.uppladdningar.length).toBe(1);   // inte uppladdat igen
    expect(await r.ko.vantande()).toEqual([]);
  });

  it('en markering vars rad aldrig dyker upp ges upp efter 7 dagar', async () => {
    const r = rigg({ patcha: async () => 'saknas' });
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(5));
    await r.ko.kor(true);
    expect((await r.ko.vantande()).length).toBe(1);
    r.framat(GE_UPP_EFTER_MS + 1000);
    await r.ko.kor(true);
    expect(await r.ko.vantande()).toEqual([]);
  });

  it('tas markeringen bort innan fotot kommit upp tas det väntande fotot bort också', async () => {
    const r = rigg();
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(1));
    await r.ko.laggTill('obj', 'm2', 'obj/m2.jpg', bytes(2));
    await r.ko.tomForMarkering('obj', 'm1');
    expect((await r.ko.vantande()).map((f) => f.markerId)).toEqual(['m2']);
    await r.ko.kor(true);
    expect(r.logg.uppladdningar).toEqual(['obj/m2.jpg']);
  });

  it('tas markeringen bort MEDAN fotot laddas upp kvitteras inget och inget återuppstår på raden', async () => {
    let r!: ReturnType<typeof rigg>;
    r = rigg({ ladda: async () => { await r.ko.tomForMarkering('obj', 'm1'); } });
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(1));
    await r.ko.kor(true);
    expect(r.logg.patchar).toEqual([]);
    expect(r.logg.uppe).toEqual([]);
    expect(await r.ko.vantande()).toEqual([]);
  });

  it('ett omtag under uppladdningen ersätter fotot och tas inte bort av den gamla uppladdningens kvittens', async () => {
    let r!: ReturnType<typeof rigg>; let forsta = true;
    r = rigg({ ladda: async () => { if (forsta) { forsta = false; r.framat(5000); await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(2)); } } });
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(1));
    await r.ko.kor(true);
    expect(await lasBytes(await r.ko.lokaltFoto('obj', 'm1'))).toEqual([2]);   // det nya fotot väntar kvar
    expect(r.logg.patchar).toEqual([]);
    await r.ko.kor(true);
    expect(await r.ko.vantande()).toEqual([]);
  });

  it('ett omtag under själva patchen av raden: den gamla kvittensen tar inte bort det nya fotot', async () => {
    let r!: ReturnType<typeof rigg>; let forsta = true;
    r = rigg({ patcha: async () => { if (forsta) { forsta = false; r.framat(5000); await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(2)); } return 'ok'; } });
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(1));
    await r.ko.kor(true);
    expect(await lasBytes(await r.ko.lokaltFoto('obj', 'm1'))).toEqual([2]);   // det nya fotot väntar kvar
    await r.ko.kor(true);
    expect(r.logg.uppladdningar.length).toBe(2);                              // och laddas upp på sitt eget varv
    expect(await r.ko.vantande()).toEqual([]);
  });

  it('två varv samtidigt blir ett: fotot laddas upp en gång', async () => {
    const r = rigg();
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(1));
    await Promise.all([r.ko.kor(true), r.ko.kor(true), r.ko.kor(false)]);
    expect(r.logg.uppladdningar.length).toBe(1);
  });

  it('flera foton laddas upp i den ordning de togs; ett som fallerar stoppar inte de andra', async () => {
    const r = rigg({ ladda: async (s) => { if (s === 'obj/m1.jpg') throw new Error('fel'); } });
    await r.ko.laggTill('obj', 'm1', 'obj/m1.jpg', bytes(1)); r.framat(10);
    await r.ko.laggTill('obj', 'm2', 'obj/m2.jpg', bytes(2));
    await r.ko.kor(true);
    expect((await r.ko.vantande()).map((f) => f.markerId)).toEqual(['m1']);
  });
});
