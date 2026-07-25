'use client';

import React from 'react';
import { T } from '@/lib/utbildning';

// Avrundad iOS-grupp (#1C1C1E) med indragna avdelare mellan raderna.
// Ta ListRow-element som barn.
export default function ListGroup({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <div
      style={{
        background: T.group,
        borderRadius: 12,
        overflow: 'hidden',
        ...style,
      }}
    >
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div style={{ height: 1, background: T.sep, marginLeft: 16 }} />
          )}
          {child}
        </React.Fragment>
      ))}
    </div>
  );
}
