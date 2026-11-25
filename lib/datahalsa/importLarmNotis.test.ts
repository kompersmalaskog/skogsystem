import { describe, it, expect } from 'vitest';
import {
  IMPORT_LARM, IMPORT_OK, IMPORT_NOTIS_TAG, IMPORT_NOTIS_MAX_ALDER_MS,
  arImportNotis, byggImportNotis, sakerLank,
} from './importLarmNotis';

const NU = Date.parse('2026-11-25T10:00:00Z');
const nyss = new Date(NU - 60_000).toISOString();
// Payloaden som databasen köade 2026-11-25 (testlarmet), ordagrant.
const PAYLOAD = { url: '/datahalsa', body: 'Testlarm – ingen åtgärd behövs.', text: 'Testlarm – ingen åtgärd behövs.', titel: 'Importen felar (TEST)', rubrik: 'Importen felar (TEST)' };

describe('arImportNotis', () => {
  it('känner igen de två typerna och inget annat', () => {
    expect(arImportNotis('import_larm')).toBe(true);
    expect(arImportNotis('import_ok')).toBe(true);
    expect(arImportNotis('import_fel')).toBe(false);
    expect(arImportNotis(null)).toBe(false);
  });
});

describe('byggImportNotis', () => {
  it('titel = payload.rubrik, text = payload.text, ett tryck öppnar payload.url', () => {
    const u = byggImportNotis({ typ: IMPORT_LARM, payload: PAYLOAD, skapad_at: nyss }, NU);
    expect(u).toEqual({ typ: 'skicka', meddelande: { title: 'Importen felar (TEST)', body: 'Testlarm – ingen åtgärd behövs.', url: '/datahalsa', tag: IMPORT_NOTIS_TAG } });
  });

  it('rubrik går före titel och text före body', () => {
    const u = byggImportNotis({ typ: IMPORT_LARM, payload: { rubrik: 'R', titel: 'T', text: 'X', body: 'B', url: '/datahalsa' }, skapad_at: nyss }, NU);
    expect(u.typ === 'skicka' && u.meddelande).toMatchObject({ title: 'R', body: 'X' });
  });

  it('saknas rubrik och text används titel och body', () => {
    const u = byggImportNotis({ typ: IMPORT_OK, payload: { titel: 'Importen fungerar igen', body: 'Senaste fil 10:26' }, skapad_at: nyss }, NU);
    expect(u.typ === 'skicka' && u.meddelande).toMatchObject({ title: 'Importen fungerar igen', body: 'Senaste fil 10:26', url: '/datahalsa' });
  });

  it('tom payload säger ändå vad notisen gäller — aldrig rå JSON, aldrig "Notis"', () => {
    const larm = byggImportNotis({ typ: IMPORT_LARM, payload: null, skapad_at: nyss }, NU);
    const ok = byggImportNotis({ typ: IMPORT_OK, payload: {}, skapad_at: nyss }, NU);
    expect(larm.typ === 'skicka' && larm.meddelande).toEqual({ title: 'Importen felar', body: '', url: '/datahalsa', tag: IMPORT_NOTIS_TAG });
    expect(ok.typ === 'skicka' && ok.meddelande.title).toBe('Importen fungerar igen');
  });

  it('larm och "fungerar igen" delar tag, så telefonen visar det senaste läget', () => {
    const a = byggImportNotis({ typ: IMPORT_LARM, payload: PAYLOAD, skapad_at: nyss }, NU);
    const b = byggImportNotis({ typ: IMPORT_OK, payload: PAYLOAD, skapad_at: nyss }, NU);
    expect(a.typ === 'skicka' && b.typ === 'skicka' && a.meddelande.tag === b.meddelande.tag).toBe(true);
  });

  it('köad för mer än 24 timmar sedan → hoppas över; precis på gränsen skickas', () => {
    const gammal = new Date(NU - IMPORT_NOTIS_MAX_ALDER_MS - 1000).toISOString();
    const pa = new Date(NU - IMPORT_NOTIS_MAX_ALDER_MS).toISOString();
    expect(byggImportNotis({ typ: IMPORT_LARM, payload: PAYLOAD, skapad_at: gammal }, NU)).toEqual({ typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' });
    expect(byggImportNotis({ typ: IMPORT_LARM, payload: PAYLOAD, skapad_at: pa }, NU).typ).toBe('skicka');
  });

  it('okänd tid stoppar inte ett larm', () => {
    expect(byggImportNotis({ typ: IMPORT_LARM, payload: PAYLOAD, skapad_at: null }, NU).typ).toBe('skicka');
  });

  it('en annan typ skickas aldrig härifrån', () => {
    expect(byggImportNotis({ typ: 'dagsslut', payload: PAYLOAD, skapad_at: nyss }, NU).typ).toBe('hoppa_over');
  });
});

describe('sakerLank', () => {
  it('släpper igenom sökvägar i appen', () => {
    expect(sakerLank('/datahalsa')).toBe('/datahalsa');
    expect(sakerLank('/datahalsa?visa=import')).toBe('/datahalsa?visa=import');
  });
  it('allt annat blir /datahalsa', () => {
    for (const v of ['https://annan.sajt/x', '//annan.sajt', '/\\annan.sajt', 'datahalsa', '', '   ', null, undefined, 42]) {
      expect(sakerLank(v)).toBe('/datahalsa');
    }
  });
});
