'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, X, Check } from 'lucide-react'
import { updateTaxComponent, addTaxComponent, type SettingsActionResult } from '@/actions/settings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { TaxComponentRecord } from '../page.client'

const initialState: SettingsActionResult = { success: false, error: '' }

interface Props {
  taxComponents: TaxComponentRecord[]
  userRole: string
}

export default function TaxSettingsSection({ taxComponents, userRole }: Props) {
  const canEdit = userRole === 'owner'
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const [updateState, updateFormAction, updatePending] = useActionState(
    updateTaxComponent,
    initialState,
  )
  const [addState, addFormAction, addPending] = useActionState(addTaxComponent, initialState)

  useEffect(() => {
    if (updateState.success) {
      toast.success('Tax component updated')
      setEditingId(null)
    }
  }, [updateState.success])

  useEffect(() => {
    if (addState.success) {
      toast.success('Tax component added')
      setShowAddForm(false)
    }
  }, [addState.success])

  const addFieldErrors = !addState.success ? addState.fieldErrors : undefined

  function formatRate(rate: string) {
    return `${(Number(rate) * 100).toFixed(4)}%`
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Tax Settings</h2>
          <p className="mt-1 text-sm text-gray-500">
            Ghana GRA levy rates. These rates are used to calculate VAT on all transactions. Rates
            must be verified with GRA before adjustment.
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Levy
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && canEdit && (
        <div className="mb-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">New Tax Component</h3>
          {!addState.success && addState.error && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{addState.error}</AlertDescription>
            </Alert>
          )}
          <form action={addFormAction} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="add-code" className="text-xs">
                Code
              </Label>
              <Input
                id="add-code"
                name="code"
                placeholder="e.g. LEVY"
                className={cn('h-9 text-sm', addFieldErrors?.code && 'border-destructive')}
                disabled={addPending}
              />
              {addFieldErrors?.code && (
                <p className="text-xs text-destructive">{addFieldErrors.code}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-name" className="text-xs">
                Name
              </Label>
              <Input
                id="add-name"
                name="name"
                placeholder="Levy name"
                className={cn('h-9 text-sm', addFieldErrors?.name && 'border-destructive')}
                disabled={addPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-rate" className="text-xs">
                Rate (%)
              </Label>
              <Input
                id="add-rate"
                name="rate"
                type="number"
                step="0.0001"
                min="0"
                max="100"
                placeholder="e.g. 2.5"
                className={cn('h-9 text-sm', addFieldErrors?.rate && 'border-destructive')}
                disabled={addPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-order" className="text-xs">
                Calc. Order
              </Label>
              <Input
                id="add-order"
                name="calculationOrder"
                type="number"
                min="1"
                placeholder="e.g. 5"
                className={cn(
                  'h-9 text-sm',
                  addFieldErrors?.calculationOrder && 'border-destructive',
                )}
                disabled={addPending}
              />
            </div>
            <div className="col-span-2 flex gap-2 md:col-span-4">
              <Button type="submit" size="sm" disabled={addPending}>
                {addPending ? 'Adding…' : 'Add Component'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tax components table */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-20">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-28 text-right">Rate</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-24 text-center">Compounded</TableHead>
              {canEdit && <TableHead className="w-20 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {taxComponents.map((tc) => {
              const isEditing = editingId === tc.id
              return (
                <TableRow key={tc.id}>
                  <TableCell className="font-mono text-xs font-semibold text-gray-600">
                    {tc.code}
                  </TableCell>

                  {/* Name cell — inline edit when editing */}
                  <TableCell>
                    {isEditing ? (
                      <Input
                        form={`edit-form-${tc.id}`}
                        name="name"
                        defaultValue={tc.name}
                        className="h-8 text-sm"
                        disabled={updatePending}
                      />
                    ) : (
                      <span className="text-sm">{tc.name}</span>
                    )}
                  </TableCell>

                  {/* Rate cell */}
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input
                        form={`edit-form-${tc.id}`}
                        name="rate"
                        type="number"
                        step="0.0001"
                        min="0"
                        max="100"
                        defaultValue={(Number(tc.rate) * 100).toFixed(4)}
                        className="h-8 text-sm text-right"
                        disabled={updatePending}
                      />
                    ) : (
                      <span className="font-mono text-sm">{formatRate(tc.rate)}</span>
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    {canEdit && !isEditing ? (
                      <form action={updateFormAction}>
                        <input type="hidden" name="id" value={tc.id} />
                        <input type="hidden" name="name" value={tc.name} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={tc.isActive ? 'false' : 'true'}
                        />
                        <button
                          type="submit"
                          disabled={updatePending}
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
                            tc.isActive
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                          )}
                        >
                          {tc.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </form>
                    ) : (
                      <Badge variant={tc.isActive ? 'default' : 'secondary'} className="text-xs">
                        {tc.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Compounded */}
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">
                      {tc.isCompounded ? 'Yes' : 'No'}
                    </Badge>
                  </TableCell>

                  {/* Actions */}
                  {canEdit && (
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          {/* Hidden form for the edit submission */}
                          <form id={`edit-form-${tc.id}`} action={updateFormAction}>
                            <input type="hidden" name="id" value={tc.id} />
                          </form>
                          <Button
                            type="submit"
                            form={`edit-form-${tc.id}`}
                            size="icon"
                            variant="default"
                            className="h-7 w-7"
                            disabled={updatePending}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditingId(tc.id)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
            {taxComponents.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 6 : 5}
                  className="py-8 text-center text-sm text-gray-400"
                >
                  No tax components configured
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {!canEdit && (
        <p className="mt-3 text-xs text-gray-400">Only the business owner can edit tax rates.</p>
      )}
    </div>
  )
}
