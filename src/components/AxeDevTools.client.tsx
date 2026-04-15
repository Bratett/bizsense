'use client'

import { useEffect } from 'react'

/**
 * Loads axe-core accessibility auditor in development only.
 * Reports violations to the browser console — zero impact on production builds.
 */
export function AxeDevTools() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    import('@axe-core/react').then(({ default: axe }) => {
      import('react-dom').then(({ default: ReactDOM }) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const React = require('react')
        axe(React, ReactDOM, 1000)
      })
    })
  }, [])

  return null
}
