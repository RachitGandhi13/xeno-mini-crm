import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Filter,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/',          label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campaigns',  icon: Megaphone },
  { to: '/customers', label: 'Customers',  icon: Users },
  { to: '/segments',  label: 'Segments',   icon: Filter },
];

export default function Sidebar() {
  return (
    <aside className="flex h-screen w-60 flex-col bg-slate-900 text-slate-100 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold text-white">Xeno CRM</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800 px-5 py-4">
        <p className="text-xs text-slate-500">AI-Native Mini CRM</p>
        <p className="text-xs text-slate-600">Xeno Take-Home Assignment</p>
      </div>
    </aside>
  );
}
