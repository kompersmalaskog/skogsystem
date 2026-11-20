import { describe, it, expect } from 'vitest';
import { valbaraMaskiner, rollForMaskin, startHinder, maskinNamn, maskinAktivIdag, type MaskinRegisterRad } from './maskinFraga';

// Riktiga rader ur dim_maskin (prod 2026-10-05)
const REGISTER: MaskinRegisterRad[] = [
  { maskin_id: 'A030353', visningsnamn: 'Wisent', modell: 'Wisent2015', maskin_typ: 'Forwarder', aktiv_till: null },
  { maskin_id: 'A110148', visningsnamn: 'Elefant AF', modell: 'Elephant King AF', maskin_typ: 'Forwarder', aktiv_till: '2026-07-08' },
  { maskin_id: 'A130743', visningsnamn: 'Elefant 26', modell: 'Elephant King 2026', maskin_typ: 'Forwarder', aktiv_till: null },
  { maskin_id: 'JD810E', visningsnamn: '810E', modell: '810E', maskin_typ: 'Forwarder', aktiv_till: null },
  { maskin_id: 'PONS20SDJAA270231', visningsnamn: 'Giant', modell: 'PONSSE Scorpion Giant 8W', maskin_typ: 'Harvester', aktiv_till: null },
  { maskin_id: 'R64101', visningsnamn: 'H8E -23', modell: 'H8E', maskin_typ: 'Harvester', aktiv_till: '2026-03-11' },
  { maskin_id: 'R64428', visningsnamn: 'H8E -26', modell: 'H8E', maskin_typ: 'Harvester', aktiv_till: null },
];
const IDAG = '2026-10-05';

describe('valbaraMaskiner — frågans knappar', () => {
  it('bara AKTIVA maskiner, med visningsnamn ur dim_maskin (de avförda Elefant AF och H8E -23 saknas)', () => {
    const v = valbaraMaskiner(REGISTER, IDAG);
    expect(v.map((m) => m.maskinId)).toEqual(['A130743', 'R64428', 'PONS20SDJAA270231', 'JD810E', 'A030353'].sort((a, b) => {
      const namn = (id: string) => REGISTER.find((r) => r.maskin_id === id)!.visningsnamn!;
      return namn(a).localeCompare(namn(b), 'sv');
    }));
    expect(v.map((m) => m.namn)).toContain('Elefant 26');
    expect(v.map((m) => m.namn)).not.toContain('Elefant AF');
    expect(v.map((m) => m.maskinId)).not.toContain('R64101');
  });

  it('rollen ur registret: Harvester → skördare, Forwarder → skotare', () => {
    const v = valbaraMaskiner(REGISTER, IDAG);
    expect(v.find((m) => m.maskinId === 'A130743')?.roll).toBe('skotare');
    expect(v.find((m) => m.maskinId === 'R64428')?.roll).toBe('skordare');
    expect(v.find((m) => m.maskinId === 'PONS20SDJAA270231')?.roll).toBe('skordare');
  });

  it('en maskin utan känd typ erbjuds INTE (den kan inte öppna någon körvy)', () => {
    const v = valbaraMaskiner([...REGISTER, { maskin_id: 'X1', visningsnamn: 'Okänd', maskin_typ: null }, { maskin_id: 'X2', visningsnamn: 'Lastbil', maskin_typ: 'Truck' }], IDAG);
    expect(v.map((m) => m.maskinId)).not.toContain('X1');
    expect(v.map((m) => m.maskinId)).not.toContain('X2');
  });

  it('aktiv_till = idag är fortfarande aktiv; dagen efter är den inte', () => {
    expect(maskinAktivIdag({ aktiv_till: '2026-10-05' }, '2026-10-05')).toBe(true);
    expect(maskinAktivIdag({ aktiv_till: '2026-10-04' }, '2026-10-05')).toBe(false);
    expect(maskinAktivIdag({ aktiv_till: null }, '2026-10-05')).toBe(true);
  });

  it('tomt register → tom lista', () => expect(valbaraMaskiner([], IDAG)).toEqual([]));

  it('visningsnamn före modell före maskin_id', () => {
    expect(maskinNamn({ maskin_id: 'M', visningsnamn: ' Namn ', modell: 'Modell' })).toBe('Namn');
    expect(maskinNamn({ maskin_id: 'M', visningsnamn: '  ', modell: 'Modell' })).toBe('Modell');
    expect(maskinNamn({ maskin_id: 'M', visningsnamn: null, modell: null })).toBe('M');
  });
});

describe('rollForMaskin — rollen kommer ALLTID ur registret, aldrig en tyst reserv', () => {
  it('känd maskin → dess roll', () => {
    expect(rollForMaskin(REGISTER, 'A130743')).toBe('skotare');
    expect(rollForMaskin(REGISTER, 'PONS20SDJAA270231')).toBe('skordare');
  });
  it('okänd maskin, ingen maskin, tomt register → null (anroparen får inte gissa "skotare")', () => {
    expect(rollForMaskin(REGISTER, 'FINNS-INTE')).toBeNull();
    expect(rollForMaskin(REGISTER, null)).toBeNull();
    expect(rollForMaskin(REGISTER, undefined)).toBeNull();
    expect(rollForMaskin([], 'A130743')).toBeNull();
  });
  it('maskin utan typ i registret → null', () => {
    expect(rollForMaskin([{ maskin_id: 'X1', maskin_typ: null }], 'X1')).toBeNull();
  });
});

describe('startHinder — kan starten inte fortsätta visas vad som saknas, aldrig svart', () => {
  const bas = { enhetMaskinId: 'A130743', registerStatus: 'ok' as const, register: REGISTER, idagISO: IDAG };

  it('inga hinder: maskinen finns, är aktiv och har en roll', () => {
    expect(startHinder(bas)).toBeNull();
  });
  it('ingen vald maskin → inget hinder här (det är frågan som gäller)', () => {
    expect(startHinder({ ...bas, enhetMaskinId: null })).toBeNull();
  });
  it('registret laddar än → inget hinder ännu (svart förklarar sig själv under tiden)', () => {
    expect(startHinder({ ...bas, registerStatus: 'laddar', register: [] })).toBeNull();
  });
  it('registret gick inte att hämta → text + Försök igen + Till appen', () => {
    const h = startHinder({ ...bas, registerStatus: 'fel', register: [] });
    expect(h?.skal).toBe('register-fel');
    expect(h?.text).toMatch(/Maskinregistret/);
    expect(h?.knappar).toEqual(['forsok-igen', 'till-appen']);
  });
  it('enhetens maskin finns inte i registret → välj maskin igen + Till appen', () => {
    const h = startHinder({ ...bas, enhetMaskinId: 'SPOK' });
    expect(h?.skal).toBe('maskin-saknas');
    expect(h?.knappar).toEqual(['valj-maskin', 'till-appen']);
  });
  it('enhetens maskin är avförd (Elefant AF, aktiv_till 2026-07-08) → säger vilken', () => {
    const h = startHinder({ ...bas, enhetMaskinId: 'A110148' });
    expect(h?.skal).toBe('maskin-avford');
    expect(h?.text).toContain('Elefant AF');
  });
  it('maskinen saknar typ → säger det (körvyn vet inte vilken roll)', () => {
    const h = startHinder({ ...bas, enhetMaskinId: 'X1', register: [{ maskin_id: 'X1', visningsnamn: 'Mystisk', maskin_typ: null }] });
    expect(h?.skal).toBe('roll-saknas');
    expect(h?.text).toContain('Mystisk');
  });
  it('varje hinder har text och minst en väg vidare (aldrig en återvändsgränd)', () => {
    const fall = [
      startHinder({ ...bas, registerStatus: 'fel', register: [] }),
      startHinder({ ...bas, enhetMaskinId: 'SPOK' }),
      startHinder({ ...bas, enhetMaskinId: 'A110148' }),
      startHinder({ ...bas, enhetMaskinId: 'X1', register: [{ maskin_id: 'X1', maskin_typ: null }] }),
    ];
    for (const h of fall) {
      expect(h).not.toBeNull();
      expect(h!.text.length).toBeGreaterThan(10);
      expect(h!.knappar).toContain('till-appen');
    }
  });
});
