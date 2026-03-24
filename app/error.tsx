'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ background: '#000', color: '#fff', fontFamily: 'system-ui', padding: '40px', minHeight: '100vh' }}>
      <h2>Något gick fel</h2>
      <pre style={{ whiteSpace: 'pre-wrap', color: '#f87171', fontSize: '14px' }}>
        {error.message}
      </pre>
      <pre style={{ whiteSpace: 'pre-wrap', color: '#888', fontSize: '12px', marginTop: '12px' }}>
        {error.stack}
      </pre>
      <button
        onClick={() => reset()}
        style={{
          marginTop: '20px', padding: '12px 24px',
          background: '#1d9e75', color: '#fff', border: 'none',
          borderRadius: '8px', fontSize: '14px', cursor: 'pointer',
        }}
      >
        Försök igen
      </button>
    </div>
  )
}
