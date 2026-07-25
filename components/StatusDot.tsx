'use client';

import { STATUS_META, type UtbStatus } from '@/lib/utbildning';

// Liten färgprick som speglar ett status-värde från vyn utbildning_status.
// `saknas` ritas som en ihålig ring, övriga som fylld prick.
export default function StatusDot({
  status,
  size = 10,
}: {
  status: UtbStatus;
  size?: number;
}) {
  const { color, label } = STATUS_META[status];
  const hollow = status === 'saknas';
  return (
    <span
      role="img"
      aria-label={label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: hollow ? 'transparent' : color,
        border: hollow ? `1.5px solid ${color}` : 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}
