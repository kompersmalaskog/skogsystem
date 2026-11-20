// Extern (inlejd) skotare — bor som JSON i dim_objekt.ovrigt_info på skotarens rader.
// EN läsare och EN skrivare, så undersidan och ekonomin aldrig tolkar fältet olika.
// Andra nycklar i ovrigt_info lämnas alltid orörda; en text som inte är JSON skrivs aldrig över.

export type ExternSkotning = {
  foretag: string;
  /** Hur priset räknas: per m³ eller per timme. */
  prisTyp: 'm3' | 'timme';
  pris: number;
  antal: number;
};

const NYCKLAR = ['extern_skotning', 'extern_foretag', 'extern_pris_typ', 'extern_pris', 'extern_antal'];

function tolka(ovrigt: string | null | undefined): Record<string, unknown> | null | 'inte-json' {
  if (ovrigt == null || String(ovrigt).trim() === '') return null;
  try {
    const v = JSON.parse(String(ovrigt));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : 'inte-json';
  } catch {
    return 'inte-json';
  }
}

/** Den inlejda skotaren, eller null när ingen är inlejd. */
export function lasExtern(ovrigt: string | null | undefined): ExternSkotning | null {
  const v = tolka(ovrigt);
  if (!v || v === 'inte-json' || v.extern_skotning !== true) return null;
  return {
    foretag: String(v.extern_foretag ?? ''),
    prisTyp: v.extern_pris_typ === 'timme' ? 'timme' : 'm3',
    pris: Number(v.extern_pris) || 0,
    antal: Number(v.extern_antal) || 0,
  };
}

/**
 * Nytt värde för ovrigt_info. `extern` null = ingen inlejd skotare (nycklarna tas bort, resten står kvar).
 * Kastar när den befintliga texten inte är JSON — den skrivs då aldrig över.
 */
export function skrivExtern(ovrigt: string | null | undefined, extern: ExternSkotning | null): string | null {
  const v = tolka(ovrigt);
  if (v === 'inte-json') throw new Error('Övrig info är inte i ett format appen kan ändra.');
  const ut: Record<string, unknown> = { ...(v ?? {}) };
  for (const k of NYCKLAR) delete ut[k];
  if (extern) {
    ut.extern_skotning = true;
    ut.extern_foretag = extern.foretag;
    ut.extern_pris_typ = extern.prisTyp;
    ut.extern_pris = extern.pris;
    ut.extern_antal = extern.antal;
  }
  return Object.keys(ut).length > 0 ? JSON.stringify(ut) : null;
}

/** Kostnaden i hela kronor, eller null när pris eller antal saknas. */
export function externKostnad(e: ExternSkotning | null): number | null {
  if (!e || e.pris <= 0 || e.antal <= 0) return null;
  return Math.round(e.pris * e.antal);
}
