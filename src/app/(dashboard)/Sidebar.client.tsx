'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SyncIndicator from '@/components/SyncIndicator.client'

type NavItem = { label: string; href: string; match: (p: string) => boolean }

const MAIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', match: (p) => p === '/dashboard' },
  {
    label: 'Sales',
    href: '/sales',
    match: (p) => p.startsWith('/sales') || p.startsWith('/orders'),
  },
  { label: 'Expenses', href: '/expenses', match: (p) => p.startsWith('/expenses') },
  { label: 'Customers', href: '/customers', match: (p) => p.startsWith('/customers') },
]

const FINANCE_NAV: NavItem[] = [
  { label: 'General Ledger', href: '/ledger', match: (p) => p.startsWith('/ledger') },
  { label: 'Reports', href: '/reports', match: (p) => p.startsWith('/reports') },
]

const OPERATIONS_NAV: NavItem[] = [
  { label: 'Inventory', href: '/inventory', match: (p) => p.startsWith('/inventory') },
  { label: 'Suppliers', href: '/suppliers', match: (p) => p.startsWith('/suppliers') },
  { label: 'Payroll', href: '/payroll', match: (p) => p.startsWith('/payroll') },
]

const SETTINGS_NAV: NavItem[] = [
  { label: 'Settings', href: '/settings', match: (p) => p.startsWith('/settings') },
]

function NavGroup({
  title,
  items,
  pathname,
}: {
  title: string
  items: NavItem[]
  pathname: string
}) {
  return (
    <div>
      <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </p>
      {items.map((item) => {
        const active = item.match(pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-green-50 text-green-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 md:left-0 md:border-r md:border-gray-200 md:bg-white">
      {/* Brand */}
      <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4">
        <span className="text-lg font-bold text-green-700">BizSense</span>
        <SyncIndicator />
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
        <NavGroup title="Main" items={MAIN_NAV} pathname={pathname} />
        <NavGroup title="Finance" items={FINANCE_NAV} pathname={pathname} />
        <NavGroup title="Operations" items={OPERATIONS_NAV} pathname={pathname} />
        <NavGroup title="" items={SETTINGS_NAV} pathname={pathname} />
      </nav>
    </aside>
  )
}
