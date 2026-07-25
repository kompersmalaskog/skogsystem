'use client';

import React from 'react';
import Link from 'next/link';
import StatusDot from './StatusDot';
import { T, type UtbStatus } from '@/lib/utbildning';

type Props = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  // Ledande innehåll: antingen en färgprick via `status`, eller valfri nod.
  status?: UtbStatus;
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

export default function ListRow({
  title,
  subtitle,
  status,
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

  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 44,
        padding: '11px 16px',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {status ? (
        <StatusDot status={status} />
      ) : leading != null ? (
        <span style={{ display: 'flex', flexShrink: 0 }}>{leading}</span>
      ) : null}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 400,
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
          <div
            style={{
              fontSize: 13,
              color: T.t2,
              fontFamily: T.ff,
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {trailing != null ? (
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {trailing}
        </span>
      ) : value != null && value !== '' ? (
        <span
          style={{
            fontSize: 15,
            color: valueColor ?? T.t2,
            fontFamily: T.ff,
            flexShrink: 0,
            textAlign: 'right',
          }}
        >
          {value}
        </span>
      ) : null}

      {visaChevron && (
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: 20, color: 'rgba(235,235,245,0.3)', flexShrink: 0, marginRight: -4 }}
        >
          chevron_right
        </span>
      )}
    </div>
  );

  if (disabled) {
    return inner;
  }
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
