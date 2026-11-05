import { describe, it, expect } from 'vitest';
import { parseTraktdirektivText, telefonerUrTd } from './td-parser';

// Sidhuvudet som unpdf läser det ur Lidhem rp 2025 Britteberg (885871_TD.pdf, 2026-10-23) — markägarens namn och nummer utbytta.
const LIDHEM = 'Traktdirektiv - Lidhem rp 2025 Britteberg Traktnr Kontraktsnr Ursprung Datum 885871 971064 (anges vid fakturering) Rotpost 2026-10-23 Säljare: Kontaktperson Inköpare VIDA KARL-ERIK EXEMPELSSON 073-000 11 22 Jan-Erik Gustafsson 0470-33000 070-2327410 LIDHEM SÄTERI 362 51 VÄCKELSÅNG Fastighetsbeteckning Cert ArbetsformLKF SKS-anmält: LINE 7:1 PEFC';
// Samma huvud med en annan inköpare och ett annat nummer: den gamla regeln (bara 0702327410 = inköpare) gav
// inköparens mobil som MARKÄGARENS nummer när säljaren saknade mobil.
const ANNAN = 'Säljare: Kontaktperson Inköpare VIDA JOHANNISHUS GODSFÖRVALTNING AB Martin Hjert 0470-33000 070-111 22 33 JOHANNISHUS Fastighetsbeteckning JOHANNISHUS 1:2';

describe('telefonerna i traktdirektivets sidhuvud', () => {
  it('Lidhem: markägarens före inköparens namn, inköparens efter', () => {
    expect(telefonerUrTd(LIDHEM, 'Jan-Erik Gustafsson')).toEqual({ markagare_tel: '0730001122', inkopare_tel: '0702327410' });
  });
  it('en annan inköpare: hans nummer blir inköparens, inte markägarens', () => {
    expect(telefonerUrTd(ANNAN, 'Martin Hjert')).toEqual({ markagare_tel: '', inkopare_tel: '0701112233' });
  });
  it('namnet saknas i huvudet: den gamla regeln gäller', () => {
    expect(telefonerUrTd(LIDHEM, 'Någon Annan')).toEqual({ markagare_tel: '0730001122', inkopare_tel: '0702327410' });
    expect(telefonerUrTd(ANNAN, null)).toEqual({ markagare_tel: '0701112233', inkopare_tel: '' });
  });
  it('hela parsern: inköparens namn från objektinfo används, markägaren med bindestreck i namnet', () => {
    const td = parseTraktdirektivText(LIDHEM, '885871', 'Jan-Erik Gustafsson');
    expect(td.markagare).toBe('Karl-Erik Exempelsson');
    expect(td.markagare_tel).toBe('0730001122');
    expect(td.inkopare_tel).toBe('0702327410');
    const annan = parseTraktdirektivText(ANNAN, '', 'Martin Hjert');
    expect(annan.inkopare_tel).toBe('0701112233');
    expect(annan.markagare_tel).toBe('');
  });
});
