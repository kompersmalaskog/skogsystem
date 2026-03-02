'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface FeedbackItem {
  id: string
  text: string | null
  audio_url: string | null
  sida: string | null
  created_at: string
}

export default function ForbattringsforslagPage() {
  const [text, setText] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<any>(null)
  const timeoutRef = useRef<any>(null)
  const pendingBlobRef = useRef<Blob | null>(null)

  // Ladda tidigare förslag
  const loadFeedback = useCallback(async () => {
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setItems(data)
    setLoaded(true)
  }, [])

  useEffect(() => { loadFeedback() }, [loadFeedback])

  // Ljud-inspelning (toggle)
  const toggleRecording = async () => {
    if (isRecording) {
      // Stoppa
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      setIsRecording(false)
      setRecordingSeconds(0)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (audioChunksRef.current.length === 0) return
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        pendingBlobRef.current = blob
        // Temporär URL för uppspelning
        setAudioUrl(URL.createObjectURL(blob))
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        setIsRecording(false)
        setRecordingSeconds(0)
      }, 120000) // Max 2 min
    } catch (err) {
      console.error('Kunde inte starta inspelning:', err)
    }
  }

  const removeAudio = () => {
    setAudioUrl(null)
    pendingBlobRef.current = null
  }

  // Skicka
  const handleSubmit = async () => {
    if (!text.trim() && !pendingBlobRef.current) return
    setSending(true)

    let uploadedUrl: string | null = null

    // Ladda upp ljud till Storage
    if (pendingBlobRef.current) {
      const ext = pendingBlobRef.current.type.includes('mp4') ? 'mp4' : 'webm'
      const path = `feedback/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('audio')
        .upload(path, pendingBlobRef.current, { contentType: pendingBlobRef.current.type })
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('audio').getPublicUrl(path)
        uploadedUrl = urlData.publicUrl
      } else {
        console.error('[Feedback] Upload fel:', uploadErr)
      }
    }

    // Spara till tabell
    const { error } = await supabase.from('feedback').insert({
      text: text.trim() || null,
      audio_url: uploadedUrl,
      sida: 'forbattringsforslag',
    })

    if (error) {
      console.error('[Feedback] Spara fel:', error)
      setSending(false)
      return
    }

    // Rensa och visa bekräftelse
    setText('')
    setAudioUrl(null)
    pendingBlobRef.current = null
    setSending(false)
    setSent(true)
    setTimeout(() => setSent(false), 3000)
    loadFeedback()
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      <style jsx global>{`
        .fb-app {
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          background: #f5f5f7;
          color: #1d1d1f;
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
          max-width: 600px;
          margin: 0 auto;
          padding-bottom: 100px;
        }
        .fb-header {
          background: #fff;
          padding: 24px 20px 20px;
        }
        .fb-header h1 {
          font-size: 34px;
          font-weight: 700;
          letter-spacing: -0.5px;
          margin: 0;
        }
        .fb-header p {
          font-size: 15px;
          color: #86868b;
          margin: 6px 0 0;
        }
        .fb-form {
          padding: 20px;
        }
        .fb-card {
          background: #fff;
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 16px;
        }
        .fb-textarea {
          width: 100%;
          min-height: 120px;
          border: 1px solid #e5e5e5;
          border-radius: 12px;
          padding: 14px 16px;
          font-size: 16px;
          font-family: inherit;
          color: #1d1d1f;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .fb-textarea:focus {
          border-color: #22c55e;
        }
        .fb-textarea::placeholder {
          color: #86868b;
        }
        .fb-audio-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 14px;
        }
        .fb-mic-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .fb-mic-idle {
          background: #f0fdf4;
          color: #22c55e;
        }
        .fb-mic-recording {
          background: #ef4444;
          color: #fff;
          animation: fb-pulse 1.5s ease-in-out infinite;
        }
        .fb-mic-done {
          background: #22c55e;
          color: #fff;
        }
        @keyframes fb-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        .fb-timer {
          font-size: 14px;
          font-weight: 600;
          color: #ef4444;
          font-variant-numeric: tabular-nums;
        }
        .fb-audio-player {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .fb-audio-player audio {
          flex: 1;
          height: 36px;
          border-radius: 8px;
        }
        .fb-audio-remove {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: none;
          background: rgba(239,68,68,0.1);
          color: #ef4444;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .fb-submit {
          width: 100%;
          padding: 16px;
          border-radius: 14px;
          border: none;
          font-size: 17px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .fb-submit-active {
          background: #22c55e;
          color: #fff;
        }
        .fb-submit-active:active {
          transform: scale(0.98);
        }
        .fb-submit-disabled {
          background: #e5e5e5;
          color: #999;
          cursor: default;
        }
        .fb-toast {
          position: fixed;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          background: #22c55e;
          color: #fff;
          padding: 14px 24px;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 600;
          z-index: 1000;
          animation: fb-fadein 0.3s ease;
          box-shadow: 0 4px 20px rgba(34,197,94,0.3);
        }
        @keyframes fb-fadein {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .fb-list-header {
          font-size: 13px;
          font-weight: 600;
          color: #86868b;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          padding: 24px 20px 12px;
        }
        .fb-list {
          padding: 0 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .fb-item {
          background: #fff;
          border-radius: 14px;
          padding: 16px 20px;
        }
        .fb-item-date {
          font-size: 12px;
          color: #86868b;
          margin-bottom: 8px;
        }
        .fb-item-text {
          font-size: 15px;
          line-height: 1.5;
          color: #1d1d1f;
        }
        .fb-item-audio {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .fb-item-audio audio {
          flex: 1;
          height: 32px;
          border-radius: 6px;
        }
        .fb-empty {
          text-align: center;
          padding: 40px 20px;
          color: #86868b;
          font-size: 15px;
        }
      `}</style>

      <div className="fb-app">
        <header className="fb-header">
          <h1>Förbättringsförslag</h1>
          <p>Hjälp oss göra appen bättre</p>
        </header>

        <div className="fb-form">
          <div className="fb-card">
            <textarea
              className="fb-textarea"
              placeholder="Beskriv din idé eller vad som kan bli bättre..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <div className="fb-audio-row">
              <button
                className={`fb-mic-btn ${isRecording ? 'fb-mic-recording' : audioUrl ? 'fb-mic-done' : 'fb-mic-idle'}`}
                onClick={toggleRecording}
              >
                {isRecording ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="1" width="6" height="12" rx="3" />
                    <path d="M5 10a7 7 0 0 0 14 0" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                )}
              </button>

              {isRecording && (
                <span className="fb-timer">
                  {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
                </span>
              )}

              {audioUrl && !isRecording && (
                <div className="fb-audio-player">
                  <audio controls src={audioUrl} />
                  <button className="fb-audio-remove" onClick={removeAudio}>✕</button>
                </div>
              )}

              {!isRecording && !audioUrl && (
                <span style={{ fontSize: '14px', color: '#86868b' }}>Spela in röstmeddelande</span>
              )}
            </div>
          </div>

          <button
            className={`fb-submit ${text.trim() || audioUrl ? 'fb-submit-active' : 'fb-submit-disabled'}`}
            onClick={handleSubmit}
            disabled={sending || (!text.trim() && !audioUrl)}
          >
            {sending ? 'Skickar...' : 'Skicka'}
          </button>
        </div>

        {/* Bekräftelse-toast */}
        {sent && (
          <div className="fb-toast">
            Tack! Ditt förslag har skickats.
          </div>
        )}

        {/* Tidigare förslag */}
        {loaded && items.length > 0 && (
          <>
            <div className="fb-list-header">Tidigare förslag</div>
            <div className="fb-list">
              {items.map(item => (
                <div key={item.id} className="fb-item">
                  <div className="fb-item-date">{formatDate(item.created_at)}</div>
                  {item.text && <div className="fb-item-text">{item.text}</div>}
                  {item.audio_url && (
                    <div className="fb-item-audio">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="1" width="6" height="12" rx="3" />
                        <path d="M5 10a7 7 0 0 0 14 0" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                      <audio controls src={item.audio_url} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {loaded && items.length === 0 && (
          <div className="fb-empty">Inga förslag skickade ännu</div>
        )}

      </div>
    </>
  )
}
