import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Megaphone, Users, Filter, Leaf, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/',          label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campaigns',  icon: Megaphone },
  { to: '/customers', label: 'Customers',  icon: Users },
  { to: '/segments',  label: 'Segments',   icon: Filter },
];

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  return (
    <aside className="flex h-screen w-60 flex-col bg-[#283228] shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-[#3A4A3A]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#4A7A4A]/80">
            <Leaf className="h-4 w-4 text-[#C0CFC0]" />
          </div>
          <span className="font-semibold text-[#D4DFCF] tracking-tight">Xeno CRM</span>
        </div>
        {/* Mobile close */}
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded-lg hover:bg-[#3A4A3A] transition-all duration-300"
          >
            <X className="h-4 w-4 text-[#8FA08F]" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                'transition-all duration-300 ease-out',
                isActive
                  ? 'bg-[#3D5C3D] text-[#C0CFC0] shadow-sm'
                  : 'text-[#8FA08F] hover:bg-[#333F33] hover:text-[#C0CFC0]'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#3A4A3A] px-5 py-4">
        <p className="text-xs text-[#6A7A6A]">AI-Native Mini CRM</p>
        <p className="text-xs text-[#4A5A4A] mt-0.5">Xeno Take-Home</p>
      </div>
    </aside>
  );
}
