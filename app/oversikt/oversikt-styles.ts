import { CSSProperties } from 'react';

export const pageStyle: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#000',
  color: '#fff',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  paddingBottom: '80px',
};

export const headerStyle: CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #222',
};

export const headerSubtitle: CSSProperties = {
  fontSize: '11px',
  color: '#666',
  letterSpacing: '1px',
  marginBottom: '4px',
};

export const headerTitle: CSSProperties = {
  fontSize: '24px',
  fontWeight: '600',
};

export const tabBarStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
  padding: '12px 20px',
  borderBottom: '1px solid #222',
  overflowX: 'auto',
};

export const tabButton = (active: boolean): CSSProperties => ({
  padding: '8px 16px',
  borderRadius: '20px',
  border: active ? '1px solid #fff' : '1px solid #333',
  background: active ? '#fff' : 'transparent',
  color: active ? '#000' : '#fff',
  fontSize: '13px',
  fontWeight: '500',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

export const cardStyle: CSSProperties = {
  background: '#111',
  borderRadius: '16px',
  padding: '16px',
  marginBottom: '12px',
};

export const listItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '16px 20px',
  borderBottom: '1px solid #1a1a1a',
  cursor: 'pointer',
};

export const pillButton = (variant: 'primary' | 'secondary' | 'danger' = 'secondary'): CSSProperties => ({
  padding: '10px 20px',
  borderRadius: '12px',
  border: variant === 'primary' ? 'none' : '1px solid #333',
  background: variant === 'primary' ? '#fff' : variant === 'danger' ? '#ef4444' : 'transparent',
  color: variant === 'primary' ? '#000' : '#fff',
  fontSize: '14px',
  fontWeight: '500',
  cursor: 'pointer',
});

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: '12px',
  border: '1px solid #333',
  background: '#0a0a0a',
  color: '#fff',
  fontSize: '14px',
  outline: 'none',
};

export const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
};

export const modalOverlay: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.8)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  zIndex: 100,
};

export const modalContent: CSSProperties = {
  backgroundColor: '#111',
  borderRadius: '16px 16px 0 0',
  padding: '24px',
  width: '100%',
  maxWidth: '500px',
};

export const footerStyle: CSSProperties = {
  padding: '16px 20px',
  borderTop: '1px solid #222',
  backgroundColor: '#0a0a0a',
  textAlign: 'center',
};
