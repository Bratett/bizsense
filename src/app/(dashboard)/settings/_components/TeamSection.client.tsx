'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import {
  inviteTeamMember,
  updateTeamMemberRole,
  deactivateTeamMember,
  reactivateTeamMember,
  type SettingsActionResult,
} from '@/actions/settings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import type { TeamMemberRecord } from '../page.client'

const initialState: SettingsActionResult = { success: false, error: '' }

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  accountant: 'Accountant',
  cashier: 'Cashier',
}

const ROLE_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  manager: 'secondary',
  accountant: 'outline',
  cashier: 'outline',
}

interface ConfirmTarget {
  userId: string
  name: string
  action: 'deactivate' | 'reactivate'
}

interface Props {
  teamMembers: TeamMemberRecord[]
  userRole: string
  currentUserId: string
}

export default function TeamSection({ teamMembers, userRole, currentUserId }: Props) {
  const canManage = userRole === 'owner'
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null)

  const [inviteState, inviteFormAction, invitePending] = useActionState(
    inviteTeamMember,
    initialState,
  )
  const [roleState, roleFormAction, rolePending] = useActionState(
    updateTeamMemberRole,
    initialState,
  )
  const [deactivateState, deactivateFormAction, deactivatePending] = useActionState(
    deactivateTeamMember,
    initialState,
  )
  const [reactivateState, reactivateFormAction, reactivatePending] = useActionState(
    reactivateTeamMember,
    initialState,
  )

  useEffect(() => {
    if (inviteState.success) {
      toast.success('Invitation sent')
      setShowInviteForm(false)
    }
  }, [inviteState.success])

  const inviteFieldErrors = !inviteState.success ? inviteState.fieldErrors : undefined

  useEffect(() => {
    if (roleState.success) toast.success('Role updated')
  }, [roleState.success])

  useEffect(() => {
    if (deactivateState.success) {
      toast.success('Team member deactivated')
      setConfirmTarget(null)
    }
  }, [deactivateState.success])

  useEffect(() => {
    if (reactivateState.success) {
      toast.success('Team member reactivated')
      setConfirmTarget(null)
    }
  }, [reactivateState.success])

  const activeMembers = teamMembers.filter((m) => m.isActive)
  const inactiveMembers = teamMembers.filter((m) => !m.isActive)

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Users & Roles</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage who has access to this business account and what they can do.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowInviteForm((v) => !v)}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Invite form */}
      {showInviteForm && canManage && (
        <div className="mb-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Invite New Team Member</h3>
          {!inviteState.success && inviteState.error && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{inviteState.error}</AlertDescription>
            </Alert>
          )}
          <form action={inviteFormAction} className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="invite-email" className="text-xs">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                inputMode="email"
                placeholder="colleague@example.com"
                className={cn('h-9 text-sm', inviteFieldErrors?.email && 'border-destructive')}
                disabled={invitePending}
              />
              {inviteFieldErrors?.email && (
                <p className="text-xs text-destructive">{inviteFieldErrors.email}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-name" className="text-xs">
                Full Name
              </Label>
              <Input
                id="invite-name"
                name="fullName"
                type="text"
                placeholder="Optional"
                className="h-9 text-sm"
                disabled={invitePending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-role" className="text-xs">
                Role <span className="text-destructive">*</span>
              </Label>
              <Select name="role" disabled={invitePending}>
                <SelectTrigger id="invite-role" className="h-9 text-sm">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
              {inviteFieldErrors?.role && (
                <p className="text-xs text-destructive">{inviteFieldErrors.role}</p>
              )}
            </div>
            <div className="flex gap-2 md:col-span-3">
              <Button type="submit" size="sm" disabled={invitePending}>
                {invitePending ? 'Sending…' : 'Send Invitation'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowInviteForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Role update errors */}
      {!roleState.success && roleState.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{roleState.error}</AlertDescription>
        </Alert>
      )}

      {/* Active members */}
      <div className="space-y-2">
        {activeMembers.map((member) => {
          const isSelf = member.id === currentUserId
          return (
            <div
              key={member.id}
              className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                  {(member.fullName ?? member.phone ?? '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {member.fullName ?? member.phone ?? 'Unknown'}
                    {isSelf && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                  </p>
                  {member.phone && member.fullName && (
                    <p className="text-xs text-gray-500">{member.phone}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Role badge / change select (owner only) */}
                {canManage && !isSelf ? (
                  <form action={roleFormAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={member.id} />
                    <Select name="role" defaultValue={member.role} disabled={rolePending}>
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="accountant">Accountant</SelectItem>
                        <SelectItem value="cashier">Cashier</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={rolePending}
                      className="h-8 text-xs"
                    >
                      Update
                    </Button>
                  </form>
                ) : (
                  <Badge variant={ROLE_BADGE_VARIANT[member.role] ?? 'outline'}>
                    {ROLE_LABELS[member.role] ?? member.role}
                  </Badge>
                )}

                {/* Deactivate button (owner only, not self) */}
                {canManage && !isSelf && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() =>
                      setConfirmTarget({
                        userId: member.id,
                        name: member.fullName ?? member.phone ?? 'this member',
                        action: 'deactivate',
                      })
                    }
                  >
                    Deactivate
                  </Button>
                )}
              </div>
            </div>
          )
        })}

        {activeMembers.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">No active team members</p>
        )}
      </div>

      {/* Inactive members */}
      {inactiveMembers.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-500">Inactive Members</h3>
          <div className="space-y-2">
            {inactiveMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-500">
                    {(member.fullName ?? member.phone ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">
                      {member.fullName ?? member.phone ?? 'Unknown'}
                    </p>
                    <Badge variant="outline" className="text-xs text-gray-400">
                      {ROLE_LABELS[member.role] ?? member.role}
                    </Badge>
                  </div>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() =>
                      setConfirmTarget({
                        userId: member.id,
                        name: member.fullName ?? member.phone ?? 'this member',
                        action: 'reactivate',
                      })
                    }
                  >
                    Reactivate
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deactivate confirm dialog */}
      {confirmTarget?.action === 'deactivate' && (
        <ConfirmDialog
          open={true}
          onCancel={() => setConfirmTarget(null)}
          title={`Deactivate ${confirmTarget.name}?`}
          message="This will remove their access to the system. You can reactivate them at any time."
          confirmLabel="Deactivate"
          variant="destructive"
          loading={deactivatePending}
          onConfirm={() => {
            const fd = new FormData()
            fd.set('userId', confirmTarget.userId)
            deactivateFormAction(fd)
          }}
        />
      )}

      {/* Reactivate confirm dialog */}
      {confirmTarget?.action === 'reactivate' && (
        <ConfirmDialog
          open={true}
          onCancel={() => setConfirmTarget(null)}
          title={`Reactivate ${confirmTarget.name}?`}
          message="This will restore their access to the system."
          confirmLabel="Reactivate"
          variant="default"
          loading={reactivatePending}
          onConfirm={() => {
            const fd = new FormData()
            fd.set('userId', confirmTarget.userId)
            reactivateFormAction(fd)
          }}
        />
      )}
    </div>
  )
}
