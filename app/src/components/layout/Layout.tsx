import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Settings, Briefcase } from 'lucide-react'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ]

  return (
    <div className="h-screen flex flex-col">
      {/* Title Bar (macOS drag region) */}
      <div className="drag-region h-12 flex items-center justify-between px-6 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-3 pl-16">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <Briefcase size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-white/90 tracking-tight">HireEasy</span>
        </div>
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
