/**
 * Static accessibility compliance tests — Sprint 12 Task 4.
 *
 * These tests grep source files rather than mounting React components.
 * They enforce three rules that cannot be caught by TypeScript alone:
 *
 *  1. ErrorMessage component uses role="alert" — screen readers announce errors.
 *  2. No type="number" in monetary/quantity input fields (use type="text"
 *     + inputMode="decimal" instead, per CLAUDE.md §D5).
 *  3. Every Client Component that calls a Server Action has a loading state
 *     (isSubmitting, isPending, or useTransition) — prevents double-submit
 *     and provides visual feedback.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as glob from 'glob'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../../..')

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

function globSync(pattern: string): string[] {
  return glob.sync(pattern, { cwd: ROOT, absolute: true })
}

// ─── Test 1: ErrorMessage has role="alert" ────────────────────────────────────

describe('Accessibility: ErrorMessage component', () => {
  it('contains role="alert" for screen reader announcement', () => {
    const componentPath = path.join(ROOT, 'src/components/ErrorMessage.tsx')
    expect(fs.existsSync(componentPath)).toBe(true)

    const source = readFile(componentPath)
    expect(source).toContain('role="alert"')
  })
})

// ─── Test 2: No type="number" in monetary inputs ──────────────────────────────

describe('Accessibility: numeric input types', () => {
  it('client components do not use type="number" (use type="text" + inputMode="decimal")', () => {
    const files = globSync('src/app/(dashboard)/**/*.client.tsx')
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []

    for (const filePath of files) {
      const source = readFile(filePath)
      const lines = source.split('\n')

      lines.forEach((line, idx) => {
        // Check for type="number" on Input elements
        // Allowlist: non-monetary inputs (e.g., hidden inputs, sequence numbers)
        // are rare — flag everything and let the engineer review
        if (line.includes('type="number"')) {
          violations.push(`${path.relative(ROOT, filePath)}:${idx + 1}: ${line.trim()}`)
        }
      })
    }

    if (violations.length > 0) {
      console.error(
        '\nFound type="number" inputs (replace with type="text" inputMode="decimal"):\n' +
          violations.join('\n'),
      )
    }

    expect(violations).toHaveLength(0)
  })
})

// ─── Test 3: Client Components have loading states ───────────────────────────

describe('Accessibility: loading states in client components', () => {
  it('every client component that imports a Server Action has a loading indicator', () => {
    const files = globSync('src/app/(dashboard)/**/*.client.tsx')
    expect(files.length).toBeGreaterThan(0)

    // Server Actions live in src/actions/ — detect VALUE imports (not type-only).
    // "import type { Foo }" does not pull in the server action at runtime.
    const serverActionImportRegex = /^import\s+(?!type\s)\{[^}]*\}\s+from\s+['"]@\/actions\//m
    // Loading state patterns: useTransition, useActionState, isPending/*Pending,
    // isSubmitting, submitting, isLoading — covers both hook-based and variable-name patterns
    const loadingStateRegex =
      /useTransition|useActionState|isPending|Pending\b|isSubmitting|submitting|isLoading/

    const violations: string[] = []

    for (const filePath of files) {
      const source = readFile(filePath)

      // Only check files that actually call Server Actions
      if (!serverActionImportRegex.test(source)) continue

      if (!loadingStateRegex.test(source)) {
        violations.push(path.relative(ROOT, filePath))
      }
    }

    if (violations.length > 0) {
      console.error(
        '\nClient Components with Server Action imports but no loading state:\n' +
          violations.join('\n'),
      )
    }

    expect(violations).toHaveLength(0)
  })
})
