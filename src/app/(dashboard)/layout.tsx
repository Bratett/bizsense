import { getServerSession } from '@/lib/session'
import Sidebar from './Sidebar.client'
import BottomNav from './BottomNav.client'
import ConnectivityBanner from '@/components/ConnectivityBanner.client'
import AiChatBubble from '@/components/AiChatBubble.client'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Session is already validated by middleware — this provides role context
  await getServerSession()

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ConnectivityBanner />
      <Sidebar />
      <div className="flex-1 pb-[76px] md:pb-0 md:ml-60">
        {children}
      </div>
      <BottomNav />
      <AiChatBubble />
    </div>
  )
}
