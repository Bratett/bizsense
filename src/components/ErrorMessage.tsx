'use client'

interface ErrorMessageProps {
  message: string | null
  className?: string
}

export function ErrorMessage({ message, className }: ErrorMessageProps) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={`bg-red-50 border border-red-200 rounded-lg p-3
                  text-red-800 text-sm flex items-start gap-2 ${className ?? ''}`}
    >
      <span aria-hidden="true" className="mt-0.5">
        ⚠
      </span>
      <span>{message}</span>
    </div>
  )
}
