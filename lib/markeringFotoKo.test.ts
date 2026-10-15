// Källvakter: kopplingen i sidan (page.tsx kan inte monteras i test) och kön mot Supabase.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const las = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const page = las('../app/planering/page.tsx');
const ko = las('./markeringFotoKo.ts');

describe('fotot sparas lokalt först — aldrig uppladdning vid fotograferingen, aldrig base64', () => {
  const handler = page.slice(page.indexOf('const handlePhotoCapture = async'), page.indexOf('// Foton som väntar på uppladdning på den här enheten'));
  it('handlePhotoCapture lägger fotot i kön (lokalt) och laddar inte upp direkt', () => {
    expect(handler).toContain('await laggFotoIKo(String(objektId), String(markerId), blob);');
    expect(handler).not.toContain('laddaUppMarkeringFoto');
    expect(handler).not.toMatch(/photoData\s*:\s*(?!undefined)/);
    expect(handler).not.toContain('FileReader');
    expect(handler).not.toContain('readAsDataURL');
  });
  it('"Ta om bilden" bara när fotot inte gick att spara PÅ ENHETEN — aldrig för att nätet saknas', () => {
    expect(handler).toContain('Fotot kunde inte sparas på enheten');
    expect(page).not.toContain('Fotot kunde inte sparas: ');
  });
  it('tas markeringen bort tas det väntande fotot bort (alla borttag går via deleteMarkerFromDb)', () => {
    const del = page.slice(page.indexOf('const deleteMarkerFromDb = useCallback'), page.indexOf('const updateMarkerDataInDb'));
    expect(del).toContain('tomFotoForMarkering(String(valtObjekt.id), String(markerId))');
  });
  it('fotot kom upp → photoPath sätts i minnet; kortet och redigeringen visar det lokala fotot', () => {
    expect(page).toContain('window.addEventListener(FOTO_UPPE_EVENT, h)');
    expect(page).toContain('lokal={lokalFotoFor(marker)}');
    expect(page).toContain('lokal={lokalFotoFor(editingMarker)}');
  });
  it('kön startas globalt (layout) — också när appen öppnas på startsidan', () => {
    expect(las('../app/layout.tsx')).toContain('<FotoKoStartare />');
  });
});

describe('kön mot Supabase', () => {
  it('sätter photoPath med UPDATE — aldrig upsert (en borttagen markering får inte återuppstå)', () => {
    const patch = ko.slice(ko.indexOf('export async function patchaMarkeringFoto'), ko.indexOf('let kon:'));
    expect(patch).toContain('.update(');
    expect(patch).not.toContain('.upsert(');
    expect(patch).toContain("return 'saknas'");
    expect(patch).toContain('delete ny.photoData');
  });
  it('Storage-uppladdningen skriver över samma fil (omtag) och bucketen är den privata', () => {
    expect(ko).toContain("upsert: true");
    expect(ko).toContain('MARKERING_FOTO_BUCKET');
  });
  it('triggers: nätet tillbaka, appen synlig, jämna mellanrum, och bara ett varv i taget mellan flikar', () => {
    expect(ko).toContain("window.addEventListener('online', online)");
    expect(ko).toContain("document.addEventListener('visibilitychange', synlig)");
    expect(ko).toContain('window.setInterval(tick, 60_000)');
    expect(ko).toContain("nav.locks.request('markering-foto-ko'");
  });
});
