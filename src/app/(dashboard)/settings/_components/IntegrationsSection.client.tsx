'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { updateBusinessSettings, type SettingsActionResult } from '@/actions/settings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { BusinessSettingsRecord } from '../page.client'

const initialState: SettingsActionResult = { success: false, error: '' }

interface Props {
  businessSettings: BusinessSettingsRecord
  userRole: string
}

interface NotifyState {
  invoice: boolean
  payment: boolean
  lowStock: boolean
  overdue: boolean
  payroll: boolean
}

export default function IntegrationsSection({ businessSettings, userRole }: Props) {
  const canEdit = userRole === 'owner' || userRole === 'manager'
  const [state, formAction, isPending] = useActionState(updateBusinessSettings, initialState)

  // Controlled state for Switch components (hidden inputs update on change)
  const [notify, setNotify] = useState<NotifyState>({
    invoice: businessSettings.whatsappNotifyInvoice,
    payment: businessSettings.whatsappNotifyPayment,
    lowStock: businessSettings.whatsappNotifyLowStock,
    overdue: businessSettings.whatsappNotifyOverdue,
    payroll: businessSettings.whatsappNotifyPayroll,
  })

  useEffect(() => {
    if (state.success) {
      toast.success('Integrations saved')
    }
  }, [state.success])

  const notifyLabels: { key: keyof NotifyState; label: string; description: string }[] = [
    {
      key: 'invoice',
      label: 'Invoice Created',
      description: 'Send invoice PDF link to customer when a new invoice is created',
    },
    {
      key: 'payment',
      label: 'Payment Received',
      description: 'Notify owner when a payment is recorded',
    },
    {
      key: 'lowStock',
      label: 'Low Stock Alert',
      description: 'Notify owner when a product falls below the reorder level',
    },
    {
      key: 'overdue',
      label: 'Overdue Invoice',
      description: 'Send reminders for invoices overdue by more than 30 days',
    },
    {
      key: 'payroll',
      label: 'Payroll Due',
      description: 'Remind owner when a payroll run is ready for approval',
    },
  ]

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Mobile Money & WhatsApp</h2>
      <p className="mb-6 text-sm text-gray-500">
        Configure payment account references and automated WhatsApp notifications.
      </p>

      {!state.success && state.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} noValidate>
        {/* Hidden fields to carry all existing businessSettings values */}
        <input
          type="hidden"
          name="allowNegativeStock"
          value={businessSettings.allowNegativeStock ? 'on' : ''}
        />
        <input
          type="hidden"
          name="lowStockThreshold"
          value={businessSettings.lowStockThreshold}
        />
        <input
          type="hidden"
          name="defaultPaymentTermsDays"
          value={businessSettings.defaultPaymentTermsDays}
        />
        <input
          type="hidden"
          name="defaultCreditLimit"
          value={businessSettings.defaultCreditLimit}
        />
        <input
          type="hidden"
          name="invoiceFooterText"
          value={businessSettings.invoiceFooterText ?? ''}
        />

        {/* ── Mobile Money ──────────────────────────────────────────────────── */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <h3 className="mb-1 text-sm font-semibold text-gray-800">Mobile Money Accounts</h3>
          <p className="mb-4 text-xs text-gray-500">
            Enter the MoMo numbers customers should send payments to. These are printed on
            invoices.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="mtn" className="text-xs font-medium">MTN MoMo</Label>
              <Input
                id="mtn"
                name="momoMtnNumber"
                type="tel"
                inputMode="tel"
                placeholder="024 XXXX XXX"
                defaultValue={businessSettings.momoMtnNumber ?? ''}
                disabled={isPending || !canEdit}
                className="h-10 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telecel" className="text-xs font-medium">Telecel Cash</Label>
              <Input
                id="telecel"
                name="momoTelecelNumber"
                type="tel"
                inputMode="tel"
                placeholder="020 XXXX XXX"
                defaultValue={businessSettings.momoTelecelNumber ?? ''}
                disabled={isPending || !canEdit}
                className="h-10 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="airtel" className="text-xs font-medium">Airtel Money</Label>
              <Input
                id="airtel"
                name="momoAirtelNumber"
                type="tel"
                inputMode="tel"
                placeholder="026 XXXX XXX"
                defaultValue={businessSettings.momoAirtelNumber ?? ''}
                disabled={isPending || !canEdit}
                className="h-10 text-sm"
              />
            </div>
          </div>
        </div>

        {/* ── WhatsApp Notifications ────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <h3 className="mb-1 text-sm font-semibold text-gray-800">WhatsApp Notifications</h3>
          <p className="mb-4 text-xs text-gray-500">
            Automated messages sent via WhatsApp. Requires WhatsApp Business API
            configuration (Phase 2 feature — toggles saved for when integration is live).
          </p>

          {/* Business WhatsApp number */}
          <div className="mb-4 space-y-1.5">
            <Label htmlFor="wa-number" className="text-xs font-medium">
              Business WhatsApp Number
            </Label>
            <Input
              id="wa-number"
              name="whatsappBusinessNumber"
              type="tel"
              inputMode="tel"
              placeholder="e.g. 0244123456"
              defaultValue={businessSettings.whatsappBusinessNumber ?? ''}
              disabled={isPending || !canEdit}
              className="h-10 max-w-xs text-sm"
            />
          </div>

          {/* Notification toggles — hidden inputs sync Switch state */}
          {(Object.keys(notify) as (keyof NotifyState)[]).map((key) => (
            <input
              key={key}
              type="hidden"
              name={`whatsappNotify${key.charAt(0).toUpperCase()}${key.slice(1)}`}
              value={notify[key] ? 'on' : ''}
            />
          ))}

          <div className="space-y-3">
            {notifyLabels.map(({ key, label, description }) => (
              <div key={key} className="flex items-start justify-between gap-4 py-1">
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
                <Switch
                  checked={notify[key]}
                  onCheckedChange={(checked) =>
                    setNotify((prev) => ({ ...prev, [key]: checked }))
                  }
                  disabled={isPending || !canEdit}
                  aria-label={label}
                />
              </div>
            ))}
          </div>
        </div>

        {canEdit && (
          <div className="mt-6">
            <Button type="submit" disabled={isPending} className="h-11 text-base font-semibold">
              {isPending ? 'Saving…' : 'Save Integrations'}
            </Button>
          </div>
        )}
        {!canEdit && (
          <p className="mt-4 text-xs text-gray-400">
            You have read-only access to integration settings.
          </p>
        )}
      </form>
    </div>
  )
}
