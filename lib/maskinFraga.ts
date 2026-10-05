// Maskinfrågan ("Vilken maskin är det här?") och rollen ur maskinregistret — rena funktioner (testbara).
//
// ROLLEN KOMMER ALLTID FRÅN MASKINREGISTRET (dim_maskin.maskin_typ: Harvester → skördare, Forwarder → skotare).
// Aldrig ur vilket tilldelningsfält maskinen råkar stå i på objektet, och aldrig en tyst reserv ("skotare") — en
// skördare som får skotarens körvy skriver sitt hyttspår som skotare och tilldelas i fel fält.

import { rollAvMaskintyp, type Roll } from './maskindatorStart';

export interface MaskinRegisterRad {
  maskin_id: string;
  visningsnamn?: string | null;
  modell?: string | null;
  maskin_typ?: string | null;       // 'Harvester' | 'Forwarder'
  aktiv_till?: string | null;       // ISO-datum; satt = såld/utfasad
}

/** Visningsnamn: admin-satt namn före modell före maskin_id (samma ordning som maskinModell i planeringsvyn). */
export function maskinNamn(m: MaskinRegisterRad | null | undefined): string {
  return (m?.visningsnamn && m.visningsnamn.trim()) || m?.modell || m?.maskin_id || '';
}

/** Aktiv (ej såld) vid datumet? aktiv_till NULL eller ≥ idag. */
export function maskinAktivIdag(m: Pick<MaskinRegisterRad, 'aktiv_till'>, idagISO: string): boolean {
  return !m.aktiv_till || m.aktiv_till >= idagISO;
}

export function rollText(roll: Roll): string {
  return roll === 'skordare' ? 'Skördare' : 'Skotare';
}

export interface FragaMaskin { maskinId: string; namn: string; roll: Roll }

/** Maskinerna frågan visar: bara AKTIVA och bara med känd roll (en maskin utan roll kan inte öppna någon körvy),
 *  sorterade på namn. Visningsnamn ur dim_maskin. */
export function valbaraMaskiner(register: MaskinRegisterRad[], idagISO: string): FragaMaskin[] {
  const ut: FragaMaskin[] = [];
  for (const m of register) {
    if (!maskinAktivIdag(m, idagISO)) continue;
    const roll = rollAvMaskintyp(m.maskin_typ);
    if (!roll) continue;
    ut.push({ maskinId: m.maskin_id, namn: maskinNamn(m), roll });
  }
  return ut.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
}

/** Enhetens roll ur registret. null = okänd (inget val, maskinen finns inte i registret, eller typen saknas) — anroparen
 *  får ALDRIG gissa en roll. */
export function rollForMaskin(register: MaskinRegisterRad[], maskinId: string | null | undefined): Roll | null {
  if (!maskinId) return null;
  return rollAvMaskintyp(register.find((m) => m.maskin_id === maskinId)?.maskin_typ);
}

export type RegisterStatus = 'laddar' | 'ok' | 'fel';
export type HinderKnapp = 'forsok-igen' | 'valj-maskin' | 'till-appen';
export interface StartHinder {
  skal: 'register-fel' | 'maskin-saknas' | 'maskin-avford' | 'roll-saknas';
  /** Det som saknas, i förarord. */
  text: string;
  knappar: HinderKnapp[];
}

/** Kan maskindator-starten inte fortsätta? Då visas vad som saknas + en väg vidare — aldrig en svart skärm som väntar.
 *  null = inget hinder (eller vi vet inte än: registret laddar). Utan vald maskin är det frågan som gäller, inte detta. */
export function startHinder(a: {
  enhetMaskinId: string | null | undefined;
  registerStatus: RegisterStatus;
  register: MaskinRegisterRad[];
  idagISO: string;
}): StartHinder | null {
  if (!a.enhetMaskinId) return null;
  if (a.registerStatus === 'laddar') return null;
  if (a.registerStatus === 'fel') {
    return { skal: 'register-fel', text: 'Maskinregistret gick inte att hämta. Kontrollera nätet och försök igen.', knappar: ['forsok-igen', 'till-appen'] };
  }
  const m = a.register.find((x) => x.maskin_id === a.enhetMaskinId);
  if (!m) {
    return { skal: 'maskin-saknas', text: 'Den maskin den här datorn är inställd på finns inte i maskinregistret.', knappar: ['valj-maskin', 'till-appen'] };
  }
  if (!maskinAktivIdag(m, a.idagISO)) {
    return { skal: 'maskin-avford', text: `${maskinNamn(m)} är avförd ur maskinregistret.`, knappar: ['valj-maskin', 'till-appen'] };
  }
  if (!rollAvMaskintyp(m.maskin_typ)) {
    return { skal: 'roll-saknas', text: `${maskinNamn(m)} saknar typ i maskinregistret (skördare eller skotare), så körvyn vet inte vilken roll den ska ha.`, knappar: ['valj-maskin', 'till-appen'] };
  }
  return null;
}
