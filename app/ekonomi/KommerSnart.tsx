export default function KommerSnart({ titel, underrubrik }: { titel: string; underrubrik?: string }) {
  return (
    <div style={{
      background: '#111110', minHeight: '100vh', color: '#e8e8e4',
      fontFamily: "'Geist', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px 24px 140px', textAlign: 'center',
    }}>
      <style>{`
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
      `}</style>
      <span className="material-symbols-outlined" style={{
        fontSize: 48, color: 'rgba(173,198,255,0.55)', marginBottom: 16,
      }}>hourglass_empty</span>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 8 }}>{titel}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(173,198,255,0.85)', letterSpacing: 0.4, marginBottom: 6 }}>KOMMER SNART</div>
      {underrubrik && (
        <div style={{ fontSize: 12, color: '#7a7a72', maxWidth: 320, lineHeight: 1.5 }}>{underrubrik}</div>
      )}
    </div>
  );
}
