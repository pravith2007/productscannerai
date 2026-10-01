import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, ScanLine, FileSearch, Wrench, History,
  BookOpen, ShieldCheck, FileText, Menu, X,
} from 'lucide-react';

export type Page = 'dashboard' | 'scan' | 'inspections' | 'corrective' | 'history' | 'rules';

interface LayoutProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: Page; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'scan', label: 'Scan Product', icon: ScanLine },
  { id: 'inspections', label: 'Inspections', icon: FileSearch },
  { id: 'corrective', label: 'Corrective Actions', icon: Wrench },
  { id: 'history', label: 'Product History', icon: History },
  { id: 'rules', label: 'Rule Manager', icon: BookOpen },
];

export default function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavigate = useCallback((page: Page) => {
    onNavigate(page);
    setMobileOpen(false);
  }, [onNavigate]);

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-slate-200 fixed h-screen">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-teal-700" />
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">InspectFlow</h1>
              <p className="text-xs text-slate-500">Compliance Platform</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`sidebar-link w-full text-left ${currentPage === item.id ? 'sidebar-link-active' : 'sidebar-link-inactive'}`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-slate-200">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FileText className="w-4 h-4" />
            <span>Engine v1.0.0 | Rules v1.0</span>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-teal-700" />
          <h1 className="text-sm font-bold">InspectFlow</h1>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-20 bg-black/30" onClick={() => setMobileOpen(false)}>
          <div className="bg-white w-64 h-full pt-16" onClick={(e) => e.stopPropagation()}>
            <nav className="px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className={`sidebar-link w-full text-left ${currentPage === item.id ? 'sidebar-link-active' : 'sidebar-link-inactive'}`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pt-16 md:pt-0 min-h-screen">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
