'use client';
// En rad i en stapellista: klass, ett fält som fylls till procenten, värdet. Under golvet fylls staplen röd — och värdet står som text.
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { Prick } from './delar';

export default function Procentrad({ klass, pct, under, varde, n }: { klass: string; pct: number; under?: boolean; varde: string; n?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
      <span style={{ ...TYP.meta, ...TNUM, color: FARG.text, flexShrink: 0, minWidth: '5em' }}>{klass}</span>
      <span style={{ flex: 1, height: AVSTAND.s, background: FARG.fyllning, borderRadius: RADIE.stapel, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: under ? FARG.rod : FARG.text3, borderRadius: RADIE.stapel }} />
      </span>
      <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, flexShrink: 0, textAlign: 'right', minWidth: '5em' }}>
        {under && <Prick ton="hot" />} {varde}{n != null && <span style={{ ...TYP.micro, textTransform: 'none', color: FARG.text3 }}> n{n}</span>}
      </span>
    </div>
  );
}
