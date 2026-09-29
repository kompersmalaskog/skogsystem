'use client';

import React from 'react';
import { T } from '@/lib/utbildning';

// Avrundad iOS-grupp (#1C1C1E) med avdelare mellan raderna.
// Avdelaren dras in 37px när intilliggande rad har en prick, annars 16px.
export default function ListGroup({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const items = React.Children.toArray(children).filter(Boolean);

  const harPrick = (el: React.ReactNode): boolean => {
    if (!React.isValidElement(el)) return false;
    const p = el.props as { status?: unknown; dotColor?: unknown };
    return !!p.status || !!p.dotColor;
  };

  return (
    <div style={{ background: T.group, borderRadius: 10, overflow: 'hidden', ...style }}>
      {items.map((child, i) => {
        // Avdelaren tillhör raden ovanför; dras in efter den radens innehåll.
        const inset = harPrick(items[i - 1]) || harPrick(child) ? 37 : 16;
        return (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ height: 1, background: T.sep, marginLeft: inset }} />}
            {child}
          </React.Fragment>
        );
      })}
    </div>
  );
}
