'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Felgräns runt en enskild panel. En krasch i barnen (render, livscykel eller
 * synkron effekt) fångas här och visas som en tom ruta i stället för att ta ner
 * hela vyn. Kartan, centrera-knappen och övriga funktioner överlever därmed även
 * om t.ex. brandrisk-panelen kraschar.
 */
export default class PanelErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const namn = this.props.label ? ` (${this.props.label})` : '';
    console.error(`[PanelErrorBoundary${namn}] Panelen kraschade — resten av vyn påverkas inte:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      const namn = this.props.label ? `${this.props.label}-panelen` : 'Panelen';
      return (
        <div style={{ padding: 24, margin: 16, borderRadius: 16, background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#8e8e93', fontWeight: 500 }}>{namn} kunde inte visas</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>Kartan och övriga funktioner påverkas inte. Ladda om för att försöka igen.</div>
        </div>
      );
    }
    return this.props.children;
  }
}
