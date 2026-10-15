// De nya fälten för "Klar med trakten?" som kolumner på objekt (migration 20261015190000_klar_med_trakten.sql) — rad ↔ formulärvärden.
// De bor SEPARAT från Objektinfo-autosparet (lib/objektInfoSpar): de sparas direkt vid ett tryck (ett svar, ett godkännande), och en
// databas där migrationen inte körts ännu ska inte få hela Trakt-formuläret att sluta spara. Rena funktioner → enhetstestbara.

import { lasHarDu, lasVed, vedTillKolumn, VED_TOM, type HarDuSvar, type VedDetaljer } from './klarTrakt';
import { parseSvNum } from './objektInfoSpar';

export const KLAR_KOLUMNER = 'medelstam, har_du_svar, ved_detaljer, prognos_godkand_av, prognos_godkand_at, prognos_godkand_underlag, klar_kvar_antal';

export interface PrognosGodkand { av: string | null; at: string | null; underlag: string | null }

export interface KlarFalt {
  /** textform i formuläret (decimalkomma); tom = saknas */
  medelstam: string;
  harDu: HarDuSvar;
  ved: VedDetaljer;
  prognosGodkand: PrognosGodkand;
  /** senast beräknat antal kvar (kortet skriver det; listorna visar det) — null = aldrig beräknat */
  klarKvarAntal: number | null;
}

export const KLAR_TOM: KlarFalt = {
  medelstam: '', harDu: {}, ved: { ...VED_TOM }, prognosGodkand: { av: null, at: null, underlag: null }, klarKvarAntal: null,
};

export function radTillKlarFalt(r: any): KlarFalt {
  return {
    medelstam: r?.medelstam != null ? String(r.medelstam).replace('.', ',') : '',
    harDu: lasHarDu(r?.har_du_svar),
    ved: lasVed(r?.ved_detaljer),
    prognosGodkand: {
      av: typeof r?.prognos_godkand_av === 'string' ? r.prognos_godkand_av : null,
      at: typeof r?.prognos_godkand_at === 'string' ? r.prognos_godkand_at : null,
      underlag: typeof r?.prognos_godkand_underlag === 'string' ? r.prognos_godkand_underlag : null,
    },
    klarKvarAntal: typeof r?.klar_kvar_antal === 'number' && Number.isFinite(r.klar_kvar_antal) ? r.klar_kvar_antal : null,
  };
}

/** Bara de fält som ändrats → kolumner. Tomt svar skrivs som NULL (aldrig {} / ''): obesvarat är null. */
export function klarFaltTillKolumner(patch: Partial<KlarFalt>): Record<string, unknown> {
  const k: Record<string, unknown> = {};
  if ('medelstam' in patch) k.medelstam = parseSvNum(patch.medelstam ?? '');
  if ('harDu' in patch) k.har_du_svar = Object.keys(patch.harDu ?? {}).length > 0 ? patch.harDu : null;
  if ('ved' in patch && patch.ved) k.ved_detaljer = vedTillKolumn(patch.ved);
  if ('prognosGodkand' in patch && patch.prognosGodkand) {
    k.prognos_godkand_av = patch.prognosGodkand.av;
    k.prognos_godkand_at = patch.prognosGodkand.at;
    k.prognos_godkand_underlag = patch.prognosGodkand.underlag;
  }
  if ('klarKvarAntal' in patch) {
    k.klar_kvar_antal = patch.klarKvarAntal ?? null;
    k.klar_kvar_beraknad_at = patch.klarKvarAntal == null ? null : new Date().toISOString();
  }
  return k;
}

/** Är felet "kolumnen finns inte" (migrationen ej körd)? Då fungerar kortet utan att spara, och det SÄGS. */
export function arKolumnSaknasFel(e: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!e) return false;
  const msg = String(e.message ?? '');
  return e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(msg);
}
