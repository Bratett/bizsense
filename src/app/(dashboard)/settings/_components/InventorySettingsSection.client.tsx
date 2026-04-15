'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { updateInventorySettings } from '@/actions/settings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { BusinessSettingsRecord } from '../page.client'

interface Props {
  businessSettings: BusinessSettingsRecord
  userRole: string
}

export default function InventorySettingsSection({ businessSettings, userRole }: Props) {
  const canEdit = userRole === 'owner'
  const [allowNegative, setAllowNegative] = useState(businessSettings.allowNegativeStock)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      try {
        await updateInventorySettings({ allowNegativeStock: allowNegative })
        toast.success('Inventory settings saved')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save settings')
        // Revert on error
        setAllowNegative(businessSettings.allowNegativeStock)
      }
    })
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Inventory Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Control how the system handles stock levels during sales.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-4">
        {/* Toggle row */}
        <div className="flex items-start justify-between gap-4 min-h-[44px]">
          <div className="flex-1">
            <Label htmlFor="allow-negative-stock" className="text-sm font-medium text-gray-900">
              Allow Negative Stock
            </Label>
            <p className="mt-0.5 text-sm text-gray-500">
              When enabled, sales can be recorded even if a product is out of stock. This may result
              in negative stock levels. Suitable for businesses that fulfil orders before physically
              restocking.
            </p>
          </div>
          <Switch
            id="allow-negative-stock"
            checked={allowNegative}
            onCheckedChange={canEdit ? setAllowNegative : undefined}
            disabled={!canEdit || isPending}
            className="mt-0.5 shrink-0"
          />
        </div>

        {/* Warning when enabled */}
        {allowNegative && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 text-sm">
              ⚠ Allowing negative stock can make your inventory records inaccurate if unrecorded
              stock arrives. Use with caution.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {canEdit ? (
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} disabled={isPending} className="min-h-[44px]">
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">
          Only the business owner can change this setting.
        </p>
      )}
    </div>
  )
}
