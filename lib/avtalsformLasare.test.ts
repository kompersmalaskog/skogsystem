import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arVindfalle, kapacitetKategori } from './kapacitet';
import { klassaObjektTyp } from './objekt/atgardTyp';
import { arAvtalsformKolumnFel, medAvtalsformEllerUtan, medAvtalsformSvar } from './avtalsformKolumn';
import { FALT_RUTT } from './redigering/objektRouter';

describe('läsare som tolkar åtgärd som text klarar att avtalsform flyttas ut', () => {
  it('vindfälle: VF/Bark i avtalsform ELLER (äldre rader) i åtgärd', () => {
    expect(arVindfalle('VF/Bark')).toBe(true);                       // som förut
    expect(arVindfalle(null, 'VF/Bark')).toBe(true);                 // efter flytten
    expect(arVindfalle(' vf/bark ', null)).toBe(true);
    expect(arVindfalle('Gallring', 'Rp')).toBe(false);
    expect(arVindfalle(null, null)).toBe(false);
  });
  it('kapacitetskategorin vindfälle följer med till avtalsform', () => {
    expect(kapacitetKategori({ huvudtyp: 'Slutavverkning', atgard: null, avtalsform: 'VF/Bark' })).toBe('vindfalle');
    expect(kapacitetKategori({ huvudtyp: 'Slutavverkning', atgard: null, avtalsform: 'Rp' })).toBe('slutavverkning');
    expect(kapacitetKategori({ huvudtyp: 'Gallring', atgard: 'Första gallring' })).toBe('gallring');
  });
  it('översiktslistans typfilter: nya åtgärder och tom åtgärd landar rätt via typ; äldre Au/Rp/Lrk i åtgärd gäller som förut', () => {
    expect(klassaObjektTyp(null, 'slutavverkning')).toBe('slutavverkning');
    expect(klassaObjektTyp('Föryngring', 'slutavverkning')).toBe('slutavverkning');
    expect(klassaObjektTyp('Första gallring', 'gallring')).toBe('gallring');
    expect(klassaObjektTyp('Gallring', 'slutavverkning')).toBe('gallring');   // som förut
    expect(klassaObjektTyp('Au', 'gallring')).toBe('slutavverkning');         // äldre rad: avtalsformen i åtgärden
    expect(klassaObjektTyp('Rp', null)).toBe('slutavverkning');
  });
  it('Redigering sparar avtalsform till båda tabellerna (som åtgärd)', () => {
    expect(FALT_RUTT.avtalsform).toEqual({ dim: 'avtalsform', objekt: 'avtalsform' });
    expect(FALT_RUTT.atgard).toEqual({ dim: 'atgard', objekt: 'atgard' });
  });
});

describe('läsare tål att migrationen inte är körd', () => {
  const kolumnFel = { code: 'PGRST204', message: "Could not find the 'avtalsform' column of 'dim_objekt' in the schema cache" };
  it('känner igen just avtalsform-felet — inget annat', () => {
    expect(arAvtalsformKolumnFel(kolumnFel)).toBe(true);
    expect(arAvtalsformKolumnFel({ code: '42703', message: 'column dim_objekt.avtalsform does not exist' })).toBe(true);
    expect(arAvtalsformKolumnFel({ code: '42501', message: 'permission denied for table dim_objekt' })).toBe(false);
    expect(arAvtalsformKolumnFel({ code: 'PGRST204', message: "Could not find the 'annan' column" })).toBe(false);
    expect(arAvtalsformKolumnFel(null)).toBe(false);
  });
  it('hämtare som kastar: kör om utan kolumnen, andra fel går igenom', async () => {
    const anrop: boolean[] = [];
    const ut = await medAvtalsformEllerUtan(async (med) => { anrop.push(med); if (med) throw kolumnFel; return ['rad']; });
    expect(ut).toEqual(['rad']);
    expect(anrop).toEqual([true, false]);
    await expect(medAvtalsformEllerUtan(async () => { throw { code: '42501', message: 'nej' }; })).rejects.toMatchObject({ code: '42501' });
  });
  it('hämtare som returnerar { data, error }: samma sak', async () => {
    const anrop: boolean[] = [];
    const svar = await medAvtalsformSvar(async (med) => { anrop.push(med); return med ? { data: null, error: kolumnFel } : { data: [1], error: null }; });
    expect(svar).toEqual({ data: [1], error: null });
    expect(anrop).toEqual([true, false]);
    const annat = await medAvtalsformSvar(async () => ({ data: null, error: { code: '42501', message: 'nej' } }));
    expect(annat.error).toMatchObject({ code: '42501' });
  });
});

describe('källvakt: vyerna använder avtalsform och faller tillbaka utan kolumnen', () => {
  const las = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
  it('helikopter-v2 och kapacitetsvyn läser avtalsform via fallbacken', () => {
    const heli = las('app/helikopter-v2/page.tsx');
    expect(heli).toContain('medAvtalsformSvar');
    expect(heli).toContain('arVindfalle(a.atgard, a.avtalsform)');
    const kap = las('app/maskinvy/KapacitetNy.tsx');
    expect(kap).toContain('medAvtalsformEllerUtan');
    expect(kap).toContain('arVindfalle(o.atgard, o.avtalsform)');
  });
  it('Redigering laddar objektraden med fallback (resten av raden ska laddas även utan kolumnen)', () => {
    const red = las('app/redigering/RedigeringClient.tsx');
    expect(red).toContain('medAvtalsformSvar((med) => supabase.from(\'objekt\')');
    expect(red).toContain("'avtalsform'");   // GEMENSAMMA_FALT
  });
  it('/objekt skriver avtalsform bara när kolumnen finns (ett okänt fält fäller annars varje sparning)', () => {
    const o = las('app/objekt/page.tsx');
    expect(o).toContain("'avtalsform' in o");
    expect(o).toContain('...(avtalsformKolumn || form.avtalsform ? { avtalsform: form.avtalsform || null } : {})');
  });
});
