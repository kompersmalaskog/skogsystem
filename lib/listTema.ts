// Tema för de DELADE listkomponenterna i components/: ListRow, ListGroup,
// SectionHeader och StatusDot. De används av egenkontroll och gallring och
// ritas EXAKT som förut — värdena här är oförändrade, bara flyttade.
//
// Varför de ligger här och inte i lib/utbildning.ts: komponenterna är
// generella, men hämtade sitt tema ur en enskild vys fil. Utbildningsvyn
// bygger numera på lib/design/tokens och äger inte längre någon palett.
//
// NY KOD SKA INTE ANVÄNDA DEN HÄR FILEN — använd lib/design/tokens.
// Den finns bara tills egenkontroll och gallring själva flyttas till tokens
// (deras spår äger de vyerna, se CLAUDE.md "En vy ägs av ett spår").

import type { UtbStatus } from './utbildning';

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
