type EventProperties = Record<string, unknown>

/**
 * Lightweight analytics tracker.
 * Logs events to console in development.
 * Replace the implementation with your analytics provider (Segment, Mixpanel, etc.) when ready.
 */
export function track(event: string, properties?: EventProperties): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[analytics] ${event}`, properties ?? '')
  }

  // TODO: Send to analytics provider
  // e.g. analytics.track(event, properties)
}

// Pre-defined event names for type safety
export const AnalyticsEvents = {
  PAGE_VIEW: 'page_view',
  SALE_CREATED: 'sale_created',
  EXPENSE_CREATED: 'expense_created',
  CUSTOMER_CREATED: 'customer_created',
  SUPPLIER_CREATED: 'supplier_created',
  PRODUCT_CREATED: 'product_created',
  PAYMENT_RECORDED: 'payment_recorded',
  INVOICE_SHARED_WHATSAPP: 'invoice_shared_whatsapp',
  INVOICE_DOWNLOADED_PDF: 'invoice_downloaded_pdf',
  AI_MESSAGE_SENT: 'ai_message_sent',
  AI_ACTION_CONFIRMED: 'ai_action_confirmed',
  AI_ACTION_REJECTED: 'ai_action_rejected',
  REPORT_VIEWED: 'report_viewed',
  CSV_IMPORTED: 'csv_imported',
  SEARCH_USED: 'search_used',
} as const
