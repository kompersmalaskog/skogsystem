'use client';

import React from 'react';
import Link from 'next/link';
import StatusDot from './StatusDot';
import { T, type UtbStatus } from '@/lib/utbildning';

type Props = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  // Ledande prick: `status` (StatusDot) eller `dotColor` (fylld prick i valfri färg),
  // annars valfri `leading`-nod.
  status?: UtbStatus;
  dotColor?: string;
  leading?: React.ReactNode;
  // Höger sida: enkel text (`value`) eller valfri nod (`trailing`).
  value?: React.ReactNode;
  valueColor?: string;
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
};

function Chevron() {
  // 2px linje med rundade ändar (iOS-stil), inte en glyf.
  return (
    <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginLeft: 2 }}>
      <path d="M1.5 1.5L6.5 6.5L1.5 11.5" stroke={T.chevron} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ListRow({
  title,
  subtitle,
  status,
  dotColor,
  leading,
  value,
  valueColor,
  trailing,
  href,
  onClick,
  chevron,
  danger,
  disabled,
}: Props) {
  const navigerbar = !!(href || onClick);
  const visaChevron = chevron ?? navigerbar;
  const harPrick = !!status || !!dotColor;

  const prick = status ? (
    <StatusDot status={status} />
  ) : dotColor ? (
    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
  ) : null;

  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: harPrick ? 11 : leading != null ? 12 : 0,
        // padding: 16 vänster, 15 höger, 11 topp/botten
        padding: '11px 15px 11px 16px',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {prick ?? (leading != null ? <span style={{ display: 'flex', flexShrink: 0 }}>{leading}</span> : null)}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 400,
            letterSpacing: -0.2,
            color: danger ? T.red : T.t1,
            fontFamily: T.ff,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </div>
        {subtitle != null && subtitle !== '' && (
          <div style={{ fontSize: 13, fontWeight: 400, color: T.t2, fontFamily: T.ff, marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>

      {trailing != null ? (
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{trailing}</span>
      ) : value != null && value !== '' ? (
        <span style={{ fontSize: 15, fontWeight: 400, color: valueColor ?? T.t2, fontFamily: T.ff, flexShrink: 0, textAlign: 'right' }}>
          {value}
        </span>
      ) : null}

      {visaChevron && <Chevron />}
    </div>
  );

  if (disabled) return inner;
  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        {inner}
      </div>
    );
  }
  return inner;
}
