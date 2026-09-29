// Delad modell, tema och hjälpare för utbildningsvyerna (/utbildning/**).
//
// VIKTIGT: status och utgångsdatum räknas ALDRIG ut här — de kommer färdiga
// från databasvyn `utbildning_status`. Det här filen mappar bara ett givet
// status-värde till färg/etikett (ren presentation).

export type Kravtyp = 'lag' | 'certifiering' | 'bestallare';
export type UtbStatus = 'giltig' | 'gar_ut_snart' | 'utgangen' | 'saknas';

// Tabell: utbildning_typ
export type UtbildningTyp = {
  id: string;
  namn: string;
  kravtyp: Kravtyp;
  giltighet_manader: number | null; // null = ingen utgång
  galler_alla: boolean;
  beskrivning: string | null;
  anteckning: string | null;
  aktiv: boolean;
  skapad: string;
  uppdaterad: string;
};

// Vy: utbildning_status (en rad per medarbetare × utbildning som gäller hen)
export type UtbildningStatusRad = {
  medarbetare_id: string;
  medarbetare_namn: string | null;
  utbildning_typ_id: string;
  utbildning_namn: string;
  kravtyp: Kravtyp;
  giltighet_manader: number | null;
  bevis_id: string | null;
  genomford_datum: string | null;
  pdf_url: string | null;
  giltig_till: string | null;
  status: UtbStatus;
};

export type Medarbetare = {
  id: string;
  namn: string | null;
  roll?: string | null;
  aktiv?: boolean | null;
};

// ---- Tema (iOS-mörkt, exakta värden) ----
export const T = {
  bg: '#000000',
  group: '#1C1C1E',
  groupHi: '#2C2C2E',
  sep: '#38383A',
  chevron: '#48484A',
  t1: '#FFFFFF',
  t2: '#8E8E93',
  green: '#30D158',
  orange: '#FF9F0A',
  red: '#FF453A',
  blue: '#0A84FF',
  gray: '#8E8E93',
  ff: "-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',system-ui,sans-serif",
} as const;

export const STATUS_META: Record<UtbStatus, { label: string; color: string }> = {
  giltig: { label: 'Giltig', color: T.green },
  gar_ut_snart: { label: 'Går ut snart', color: T.orange },
  utgangen: { label: 'Utgången', color: T.red },
  saknas: { label: 'Saknas', color: T.gray },
};

export const KRAVTYP_META: Record<Kravtyp, { label: string; kort: string }> = {
  lag: { label: 'Lagkrav', kort: 'Lag' },
  certifiering: { label: 'Certifiering', kort: 'Cert' },
  bestallare: { label: 'Beställarkrav', kort: 'Beställare' },
};

export const KRAVTYP_ORDNING: Kravtyp[] = ['lag', 'certifiering', 'bestallare'];

// Prioritet för att välja den "värsta" statusen i en aggregerad rad.
// (Aggregering av givna statusvärden — inte beräkning av status.)
const STATUS_PRIORITET: Record<UtbStatus, number> = {
  utgangen: 3,
  saknas: 2,
  gar_ut_snart: 1,
  giltig: 0,
};

export function varstaStatus(statusar: UtbStatus[]): UtbStatus | null {
  if (statusar.length === 0) return null;
  return statusar.reduce((varst, s) =>
    STATUS_PRIORITET[s] > STATUS_PRIORITET[varst] ? s : varst
  );
}

export function formatDatum(d: string | null): string {
  if (!d) return '';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('sv-SE');
}

// Namn att visa när medarbetare_namn saknas.
export function visaNamn(namn: string | null | undefined): string {
  return namn && namn.trim() ? namn : 'Namnlös';
}

// ---- Presentation (ren formatering av redan hämtad data) ----

const MANAD_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MANAD_LANG = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

// "vart 5:e år" / "ingen utgång" / "vart 18 mån" — räknar om jämna år.
export function fornyelseText(giltighet_manader: number | null): string {
  if (giltighet_manader == null) return 'ingen utgång';
  if (giltighet_manader % 12 === 0) return `vart ${giltighet_manader / 12}:e år`;
  return `vart ${giltighet_manader} mån`;
}

// "gäller alla" / "4 personer"
export function omfattningText(galler_alla: boolean, antalPersoner: number): string {
  if (galler_alla) return 'gäller alla';
  return `${antalPersoner} ${antalPersoner === 1 ? 'person' : 'personer'}`;
}

export function manadKort(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return MANAD_KORT[d.getMonth()];
}

// "3 mars"
export function dagManad(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MANAD_LANG[d.getMonth()]}`;
}

// Prickfärg på startvyns aggregat: saknas OCH utgången = röd (behöver åtgärd).
export function aggregatFarg(status: UtbStatus): string {
  switch (status) {
    case 'utgangen':
    case 'saknas':
      return T.red;
    case 'gar_ut_snart':
      return T.orange;
    case 'giltig':
      return T.green;
  }
}
