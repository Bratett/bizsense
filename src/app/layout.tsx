import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import PwaInit from '@/components/PwaInit.client'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'BizSense Ghana',
  description: 'Offline-first business management for Ghanaian SMEs',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        {/* Requests persistent IndexedDB storage on first load.
            Shows a dismissible warning banner if the user declines — spec section 3.1. */}
        <PwaInit />
      </body>
    </html>
  )
}
