'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import BusinessProfileSection from './_components/BusinessProfileSection.client'
import TaxSettingsSection from './_components/TaxSettingsSection.client'
import TeamSection from './_components/TeamSection.client'
import ChartOfAccountsSection from './_components/ChartOfAccountsSection.client'
import IntegrationsSection from './_components/IntegrationsSection.client'
import DataExportSection from './_components/DataExportSection.client'
import AccountSection from './_components/AccountSection.client'

// ─── Plain TypeScript interfaces (no Drizzle imports in client) ───────────────

export interface BusinessRecord {
  id: string
  name: string
  industry: string | null
  address: string | null
  phone: string | null
  email: string | null
  logoUrl: string | null
  vatRegistered: boolean
  vatNumber: string | null
  tin: string | null
  ssnitNumber: string | null
  financialYearStart: string | null
}

export interface BusinessSettingsRecord {
  id: string
  allowNegativeStock: boolean
  lowStockThreshold: number
  defaultPaymentTermsDays: number
  defaultCreditLimit: string
  invoiceFooterText: string | null
  momoMtnNumber: string | null
  momoTelecelNumber: string | null
  momoAirtelNumber: string | null
  whatsappBusinessNumber: string | null
  whatsappNotifyInvoice: boolean
  whatsappNotifyPayment: boolean
  whatsappNotifyLowStock: boolean
  whatsappNotifyOverdue: boolean
  whatsappNotifyPayroll: boolean
}

export interface AccountRecord {
  id: string
  code: string
  name: string
  type: string
  subtype: string | null
  cashFlowActivity: string | null
  isSystem: boolean
}

export interface TaxComponentRecord {
  id: string
  name: string
  code: string
  rate: string
  calculationOrder: number
  isCompounded: boolean
  appliesTo: string
  isActive: boolean
}

export interface TeamMemberRecord {
  id: string
  fullName: string | null
  phone: string | null
  role: string
  isActive: boolean
  createdAt: Date
}

// ─── Nav config ───────────────────────────────────────────────────────────────

type UserRole = 'owner' | 'manager' | 'accountant' | 'cashier'

type SectionId =
  | 'profile'
  | 'coa'
  | 'tax'
  | 'team'
  | 'integrations'
  | 'export'
  | 'sync'
  | 'password'
  | 'signout'

interface NavSection {
  id: SectionId
  label: string
  allowedRoles: UserRole[]
}

interface NavGroup {
  group: string
  sections: NavSection[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Business',
    sections: [
      {
        id: 'profile',
        label: 'Business Profile',
        allowedRoles: ['owner', 'manager', 'accountant'],
      },
      { id: 'coa', label: 'Chart of Accounts', allowedRoles: ['owner', 'manager', 'accountant'] },
      { id: 'tax', label: 'Tax Settings', allowedRoles: ['owner', 'manager', 'accountant'] },
    ],
  },
  {
    group: 'Team',
    sections: [{ id: 'team', label: 'Users & Roles', allowedRoles: ['owner', 'manager'] }],
  },
  {
    group: 'Integrations',
    sections: [
      {
        id: 'integrations',
        label: 'Mobile Money & WhatsApp',
        allowedRoles: ['owner', 'manager'],
      },
    ],
  },
  {
    group: 'Data',
    sections: [
      { id: 'export', label: 'Export Data', allowedRoles: ['owner', 'manager', 'accountant'] },
      {
        id: 'sync',
        label: 'Sync Status',
        allowedRoles: ['owner', 'manager', 'accountant', 'cashier'],
      },
    ],
  },
  {
    group: 'Account',
    sections: [
      {
        id: 'password',
        label: 'Change Password',
        allowedRoles: ['owner', 'manager', 'accountant', 'cashier'],
      },
      {
        id: 'signout',
        label: 'Sign Out',
        allowedRoles: ['owner', 'manager', 'accountant', 'cashier'],
      },
    ],
  },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface SettingsPageClientProps {
  business: BusinessRecord
  businessSettings: BusinessSettingsRecord
  taxComponents: TaxComponentRecord[]
  accounts: AccountRecord[]
  teamMembers: TeamMemberRecord[]
  userRole: UserRole
  userId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPageClient({
  business,
  businessSettings,
  taxComponents,
  accounts,
  teamMembers,
  userRole,
  userId,
}: SettingsPageClientProps) {
  // Filter nav sections the current role can see
  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    sections: g.sections.filter((s) => s.allowedRoles.includes(userRole)),
  })).filter((g) => g.sections.length > 0)

  const firstVisible = visibleGroups[0]?.sections[0]?.id ?? 'sync'
  const [selectedSection, setSelectedSection] = useState<SectionId>(firstVisible)
  const [mobileShowList, setMobileShowList] = useState(true)

  function selectSection(id: SectionId) {
    setSelectedSection(id)
    setMobileShowList(false)
  }

  // ─── Nav panel ──────────────────────────────────────────────────────────────

  const NavPanel = (
    <nav className="flex flex-col gap-6 py-6 px-3">
      {visibleGroups.map((group) => (
        <div key={group.group}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {group.group}
          </p>
          {group.sections.map((section) => {
            const active = selectedSection === section.id
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => selectSection(section.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  section.id === 'signout' &&
                    !active &&
                    'text-red-600 hover:bg-red-50 hover:text-red-700',
                )}
              >
                {section.label}
                {/* Show chevron on mobile only */}
                <ChevronRight className="h-4 w-4 md:hidden" />
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )

  // ─── Section content ─────────────────────────────────────────────────────────

  function renderSection() {
    switch (selectedSection) {
      case 'profile':
        return <BusinessProfileSection business={business} userRole={userRole} />
      case 'coa':
        return <ChartOfAccountsSection accounts={accounts} userRole={userRole} />
      case 'tax':
        return <TaxSettingsSection taxComponents={taxComponents} userRole={userRole} />
      case 'team':
        return <TeamSection teamMembers={teamMembers} userRole={userRole} currentUserId={userId} />
      case 'integrations':
        return <IntegrationsSection businessSettings={businessSettings} userRole={userRole} />
      case 'export':
        return <DataExportSection businessId={business.id} showSyncStatus={false} />
      case 'sync':
        return <DataExportSection businessId={business.id} showSyncStatus={true} />
      case 'password':
        return <AccountSection view="password" />
      case 'signout':
        return <AccountSection view="signout" />
      default:
        return null
    }
  }

  // ─── Desktop: two-column layout ──────────────────────────────────────────────
  // ─── Mobile: list ↔ detail ────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      {/* Page title */}
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Settings</h1>

      <div className="md:grid md:grid-cols-[240px_1fr] md:gap-8">
        {/* Left nav — always visible on desktop; only shown on mobile when mobileShowList=true */}
        <div
          className={cn(
            'rounded-xl border border-gray-200 bg-white shadow-sm',
            'md:block md:self-start md:sticky md:top-4',
            mobileShowList ? 'block' : 'hidden md:block',
          )}
        >
          {NavPanel}
        </div>

        {/* Right content — always visible on desktop; shown only when !mobileShowList on mobile */}
        <div className={cn('md:block', mobileShowList ? 'hidden md:block' : 'block')}>
          {/* Mobile back button */}
          <button
            type="button"
            onClick={() => setMobileShowList(true)}
            className="mb-4 flex items-center gap-1 text-sm text-green-700 font-medium md:hidden"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to Settings
          </button>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  )
}
