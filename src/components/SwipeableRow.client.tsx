'use client'

import { useState, useRef, type ReactNode } from 'react'

type SwipeAction = {
  label: string
  color: string
  onClick: () => void
}

type SwipeableRowProps = {
  children: ReactNode
  actions?: SwipeAction[]
}

const SWIPE_THRESHOLD = 60

export default function SwipeableRow({ children, actions = [] }: SwipeableRowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const [translateX, setTranslateX] = useState(0)
  const [revealed, setRevealed] = useState(false)

  if (actions.length === 0) return <>{children}</>

  const actionsWidth = actions.length * 72

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = startXRef.current - e.touches[0].clientX
    if (diff < 0) {
      // Swiping right — close
      setTranslateX(revealed ? Math.max(-actionsWidth, -actionsWidth - diff) : 0)
    } else {
      // Swiping left — reveal
      const clamped = Math.min(diff, actionsWidth)
      setTranslateX(-clamped)
    }
  }

  const handleTouchEnd = () => {
    if (Math.abs(translateX) > SWIPE_THRESHOLD) {
      setTranslateX(-actionsWidth)
      setRevealed(true)
    } else {
      setTranslateX(0)
      setRevealed(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Action buttons behind the content */}
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => {
              action.onClick()
              setTranslateX(0)
              setRevealed(false)
            }}
            className={`flex w-[72px] items-center justify-center text-xs font-semibold text-white ${action.color}`}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Foreground content */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition:
            translateX === 0 || translateX === -actionsWidth ? 'transform 0.2s ease-out' : 'none',
        }}
        className="relative z-10 bg-white"
      >
        {children}
      </div>
    </div>
  )
}
