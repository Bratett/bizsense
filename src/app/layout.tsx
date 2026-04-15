import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import PwaInit from '@/components/PwaInit.client'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
})

// themeColor and viewport must be in a separate export in Next.js 15+
export const viewport: Viewport = {
  themeColor: '#00704A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'BizSense Ghana',
  description: 'Offline-first business management for Ghanaian SMEs',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'BizSense',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">
        {children}
        {/* Requests persistent IndexedDB storage on first load.
            Shows a dismissible warning banner if the user declines — spec section 3.1. */}
        <PwaInit />
      </body>
    </html>
  )
}
