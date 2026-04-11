'use client'

import Link from 'next/link'

type FabProps = {
  href: string
  label: string
}

export default function Fab({ href, label }: FabProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="fixed bottom-[80px] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-700 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
    >
      <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </Link>
  )
}
