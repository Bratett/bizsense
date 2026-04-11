'use client'

import { useState, useRef, useCallback, useEffect, useTransition } from 'react'
import {
  parseCsv,
  MAX_CSV_ROWS,
  MAX_CSV_SIZE_BYTES,
  type CsvValidationResult,
  type CsvValidationError,
} from '@/lib/csvImport'

type ImportResult = { success: true; imported: number } | { success: false; error: string }

type CsvImportModalProps<T> = {
  isOpen: boolean
  onClose: () => void
  title: string
  templateFilename: string
  generateTemplate: () => string
  validate: (rows: string[][]) => CsvValidationResult<T>
  onImport: (rows: T[]) => Promise<ImportResult>
  columns: { key: string; label: string }[]
}

export default function CsvImportModal<T extends Record<string, unknown>>({
  isOpen,
  onClose,
  title,
  templateFilename,
  generateTemplate,
  validate,
  onImport,
  columns,
}: CsvImportModalProps<T>) {
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [validationResult, setValidationResult] = useState<CsvValidationResult<T> | null>(null)
  const [importError, setImportError] = useState('')
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFile(null)
      setFileError('')
      setValidationResult(null)
      setImportError('')
      setImportedCount(null)
      setIsDragging(false)
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const downloadTemplate = useCallback(() => {
    const csv = generateTemplate()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = templateFilename
    a.click()
    URL.revokeObjectURL(url)
  }, [generateTemplate, templateFilename])

  const processFile = useCallback(
    (f: File) => {
      setFileError('')
      setValidationResult(null)
      setImportError('')
      setImportedCount(null)

      // Validate extension
      if (!f.name.toLowerCase().endsWith('.csv')) {
        setFileError('Please upload a .csv file')
        return
      }

      // Validate size
      if (f.size > MAX_CSV_SIZE_BYTES) {
        setFileError('File is too large. Maximum size is 1 MB.')
        return
      }

      setFile(f)

      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        const rows = parseCsv(text)

        // Check row count (subtract 1 for header)
        if (rows.length > MAX_CSV_ROWS + 1) {
          setFileError(
            `Too many rows. Maximum is ${MAX_CSV_ROWS} data rows (found ${rows.length - 1}).`,
          )
          return
        }

        if (rows.length < 2) {
          setFileError('CSV file has no data rows. Please add data below the header row.')
          return
        }

        const result = validate(rows)
        setValidationResult(result)
      }
      reader.onerror = () => {
        setFileError('Failed to read file. Please try again.')
      }
      reader.readAsText(f)
    },
    [validate],
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) processFile(f)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) processFile(f)
  }

  const handleImport = () => {
    if (!validationResult || !validationResult.valid) return

    startTransition(async () => {
      const result = await onImport(validationResult.rows)
      if (result.success) {
        setImportedCount(result.imported)
      } else {
        setImportError(result.error)
      }
    })
  }

  const resetFile = () => {
    setFile(null)
    setFileError('')
    setValidationResult(null)
    setImportError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  if (!isOpen) return null

  const hasValidData = validationResult?.valid === true
  const hasErrors = validationResult?.valid === false
  const previewRows = hasValidData ? validationResult.rows.slice(0, 5) : []
  const totalRows = hasValidData ? validationResult.rows.length : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success state */}
        {importedCount !== null && (
          <div className="mt-4">
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
              Successfully imported {importedCount} {importedCount === 1 ? 'record' : 'records'}.
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white
                         transition-colors hover:bg-green-800 active:bg-green-900"
            >
              Done
            </button>
          </div>
        )}

        {importedCount === null && (
          <>
            {/* Template download */}
            <p className="mt-2 text-sm text-gray-500">
              Download the template, fill it in, and upload your CSV file.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white
                         px-3 py-2 text-sm font-medium text-gray-700
                         transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download template
            </button>

            {/* File upload area */}
            <div
              className={`mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed
                         px-4 py-8 text-center transition-colors cursor-pointer
                         ${
                           isDragging
                             ? 'border-green-500 bg-green-50'
                             : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                         }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <svg
                className="mb-2 h-8 w-8 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              {file ? (
                <p className="text-sm text-gray-700">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Drop your CSV file here, or{' '}
                    <span className="font-medium text-green-700">click to browse</span>
                  </p>
                  <p className="mt-1 text-xs text-gray-400">CSV files only, max 1 MB</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* File-level error */}
            {fileError && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                {fileError}
              </div>
            )}

            {/* Import error from server */}
            {importError && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                {importError}
              </div>
            )}

            {/* Validation errors */}
            {hasErrors && (
              <div className="mt-4">
                <p className="text-sm font-medium text-red-700">
                  {validationResult.errors.length} error
                  {validationResult.errors.length !== 1 ? 's' : ''} found:
                </p>
                <ul className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {validationResult.errors.map((err: CsvValidationError, idx: number) => (
                    <li key={idx} className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
                      {err.row > 0 ? `Row ${err.row}` : 'Header'}
                      {err.column ? `, ${err.column}` : ''}: {err.message}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={resetFile}
                  className="mt-3 text-sm font-medium text-green-700 hover:text-green-800"
                >
                  Choose a different file
                </button>
              </div>
            )}

            {/* Preview table */}
            {hasValidData && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700">
                  Found {totalRows} {totalRows === 1 ? 'record' : 'records'}
                  {totalRows > 5 ? ' (showing first 5)' : ''}
                </p>
                <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {columns.map((col) => (
                          <th
                            key={col.key}
                            className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-500"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row: T, i: number) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          {columns.map((col) => (
                            <td key={col.key} className="whitespace-nowrap px-3 py-2 text-gray-700">
                              {String(row[col.key] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Import button */}
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isPending}
                  className="mt-4 w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white
                             transition-colors hover:bg-green-800 active:bg-green-900
                             disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending
                    ? `Importing...`
                    : `Import ${totalRows} ${totalRows === 1 ? 'record' : 'records'}`}
                </button>
              </div>
            )}

            {/* Cancel button */}
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700
                         transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
