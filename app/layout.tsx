import type { Metadata, Viewport } from 'next'
import './globals.css'
import TopBar from '../components/TopBar'
import PushRegister from '../components/PushRegister'

export const metadata: Metadata = {
  title: 'Kompersmåla Skog',
  description: 'Skogsbruksverksamhet',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Skogsystem',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="sv">
      <head>
        <meta name="theme-color" content="#09090b" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <TopBar />
        <PushRegister />
        <div style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
          {children}
        </div>
      </body>
    </html>
  )
}
