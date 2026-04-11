'use client'

import { useState, useRef, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

type PullToRefreshProps = {
  children: ReactNode
}

const PULL_THRESHOLD = 80

export default function PullToRefresh({ children }: PullToRefreshProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startYRef.current = e.touches[0].clientY
    } else {
      startYRef.current = 0
    }
  }, [])

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing || startYRef.current === 0) return

      const diff = e.touches[0].clientY - startYRef.current
      if (diff > 0) {
        setPullDistance(Math.min(diff * 0.4, PULL_THRESHOLD + 20))
      }
    },
    [refreshing],
  )

  const handleTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPullDistance(PULL_THRESHOLD * 0.5)
      router.refresh()
      // Reset after a short delay to allow server re-render
      setTimeout(() => {
        setRefreshing(false)
        setPullDistance(0)
      }, 1000)
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, refreshing, router])

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all"
          style={{ height: pullDistance }}
        >
          <div
            className={`h-5 w-5 rounded-full border-2 border-green-600 border-t-transparent ${
              refreshing ? 'animate-spin' : ''
            }`}
            style={{
              transform: refreshing ? undefined : `rotate(${pullDistance * 3}deg)`,
            }}
          />
        </div>
      )}
      {children}
    </div>
  )
}
