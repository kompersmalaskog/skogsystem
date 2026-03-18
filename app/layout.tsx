import type { Metadata, Viewport } from 'next'
import './globals.css'
import TopBar from '../components/TopBar'

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
      </head>
      <body style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
        <TopBar />
        <div style={{ paddingTop: 56 }}>
          {children}
        </div>
      </body>
    </html>
  )
}
