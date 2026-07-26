'use client';

import { T } from '@/lib/utbildning';

// iOS-grupperad list-rubrik: gemener-versal, sekundär text, valfri åtgärd till höger.
export default function SectionHeader({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0 16px 7px',
        margin: '22px 0 0',
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: T.t2,
          fontFamily: T.ff,
        }}
      >
        {children}
      </span>
      {action != null && <span style={{ fontFamily: T.ff }}>{action}</span>}
    </div>
  );
}
