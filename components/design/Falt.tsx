'use client';
// Falt: ett textfält med etikett över — en form, ett ställe. Fyllning `FARG.fyllning`, radie `RADIE.rad`, 44 px, `TYP.text`.
// Etiketten är `TYP.meta` i text2 och sitter ovanför, aldrig som placeholder (placeholdern försvinner när man skriver).
// `enhet` står i fältets högerkant (m³fub): enheten hör till talet, inte till etiketten.
import { useId, type ReactNode } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';

type Props = {
  etikett: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** `numeric` ger sifferknappsats på telefon; siffror sätts då med tabulära siffror. */
  inputMode?: 'text' | 'numeric' | 'decimal';
  enhet?: string;
  /** En rad under fältet (TYP.meta, text2) — vad som redan är inlagt, eller ett krav. */
  stod?: ReactNode;
  autoFocus?: boolean;
  name?: string;
  /** `date` ger systemets datumväljare (YYYY-MM-DD), `time` klockväljaren (HH:MM), `tel` telefontangentbordet; annars vanlig text. */
  typ?: 'text' | 'date' | 'time' | 'tel';
};

export default function Falt({ etikett, value, onChange, placeholder, inputMode = 'text', enhet, stod, autoFocus, name, typ = 'text' }: Props) {
  const id = useId();
  const talfalt = inputMode !== 'text';
  return (
    <div style={{ marginBottom: AVSTAND.l }}>
      <label htmlFor={id} style={{ display: 'block', ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{etikett}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, background: FARG.fyllning, borderRadius: RADIE.rad, padding: `0 ${AVSTAND.l}px` }}>
        <input
          id={id} name={name} type={typ} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} autoFocus={autoFocus}
          autoComplete="off"
          style={{ flex: 1, minWidth: 0, minHeight: TRAFFYTA.min, background: 'none', border: 'none', outline: 'none', color: FARG.text, ...TYP.text, ...(talfalt ? TNUM : null), fontFamily: 'inherit', padding: 0, colorScheme: 'dark' }}
        />
        {enhet && <span style={{ ...TYP.meta, color: FARG.text2, flexShrink: 0 }}>{enhet}</span>}
      </div>
      {stod != null && <div style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0 ${AVSTAND.xs}px` }}>{stod}</div>}
    </div>
  );
}
