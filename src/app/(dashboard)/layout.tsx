import { getServerSession } from '@/lib/session'
import Sidebar from './Sidebar.client'
import BottomNav from './BottomNav.client'
import { AppInitialiser } from '@/components/AppInitialiser'
import { ConnectivityBadge } from '@/components/ConnectivityBadge'
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator'
import { StoragePersistBanner } from '@/components/StoragePersistBanner'
import AiChatBubble from '@/components/AiChatBubble.client'
import { Toaster } from '@/components/ui/sonner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppInitialiser businessId={session.user.businessId} />
      <StoragePersistBanner />
      <ConnectivityBadge />
      <SyncStatusIndicator />
      <Sidebar />
      <div className="flex-1 pb-[76px] md:pb-0 md:ml-60">{children}</div>
      <BottomNav />
      <AiChatBubble />
      <Toaster position="bottom-center" richColors />
    </div>
  )
}
