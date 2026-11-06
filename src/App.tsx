import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import WorkspacesPage from './pages/WorkspacesPage';
import ContractsPage from './pages/ContractsPage';
import InvoicesPage from './pages/InvoicesPage';
import PaymentsPage from './pages/PaymentsPage';
import ExpensesPage from './pages/ExpensesPage';
import ReportsPage from './pages/ReportsPage';
import UsersAndRolesPage from './pages/UsersAndRolesPage';
import SettingsAndBackupPage from './pages/SettingsAndBackupPage';
import TrashAndLogsPage from './pages/TrashAndLogsPage';
import PrintPreviewModal from './components/PrintPreviewModal';
import SoftwareGuideAgent from './components/SoftwareGuideAgent';
import {
  LayoutDashboard,
  Users,
  Building2,
  FileSignature,
  FileText,
  Wallet,
  TrendingDown,
  BarChart3,
  Shield,
  Settings,
  Database,
  Trash2,
  Activity,
  LogOut,
  KeyRound,
  ChevronRight,
  Menu,
  X,
  Sun,
  Moon,
  Bot,
} from 'lucide-react';

const MainShell: React.FC = () => {
  const { user, company, appSettings, loadingAuth, activeTab, setActiveTab, theme, toggleTheme, logout, hasPermission } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-300 tracking-wide uppercase">
            Loading SQLite Workspace Database...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const navItems: {
    key: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    permission?: string;
    section: 'Operations' | 'Finance' | 'Administration';
  }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', section: 'Operations' },
    { key: 'clients', label: 'Clients', icon: Users, permission: 'clients.view', section: 'Operations' },
    { key: 'workspaces', label: 'Workspaces & Offices', icon: Building2, permission: 'workspaces.view', section: 'Operations' },
    { key: 'contracts', label: 'Contracts', icon: FileSignature, permission: 'contracts.view', section: 'Operations' },
    { key: 'invoices', label: 'Invoices', icon: FileText, permission: 'invoices.view', section: 'Finance' },
    { key: 'payments', label: 'Payments & Receipts', icon: Wallet, permission: 'payments.view', section: 'Finance' },
    { key: 'expenses', label: 'Monthly Expenses', icon: TrendingDown, permission: 'expenses.view', section: 'Finance' },
    { key: 'reports', label: 'Business Reports', icon: BarChart3, permission: 'reports.view', section: 'Finance' },
    { key: 'users', label: 'Employees & Users', icon: Shield, permission: 'users.manage', section: 'Administration' },
    { key: 'settings', label: 'Company Settings', icon: Settings, permission: 'settings.manage', section: 'Administration' },
    { key: 'backups', label: 'Backups & Restore', icon: Database, permission: 'backup.create', section: 'Administration' },
    { key: 'trash', label: 'Trash / Recovery', icon: Trash2, permission: 'trash.view', section: 'Administration' },
    { key: 'logs', label: 'Activity Audit Log', icon: Activity, permission: 'activity_log.view', section: 'Administration' },
  ];

  const visibleNavItems = navItems.filter(item => !item.permission || hasPermission(item.permission));
  const currentNavItem = navItems.find(n => n.key === activeTab) || navItems[0];

  const renderActivePage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage />;
      case 'clients':
        return <ClientsPage />;
      case 'workspaces':
        return <WorkspacesPage />;
      case 'contracts':
        return <ContractsPage />;
      case 'invoices':
        return <InvoicesPage />;
      case 'payments':
        return <PaymentsPage />;
      case 'expenses':
        return <ExpensesPage />;
      case 'reports':
        return <ReportsPage />;
      case 'users':
        return <UsersAndRolesPage />;
      case 'settings':
        return <SettingsAndBackupPage key="settings" initialTab="company" />;
      case 'backups':
        return <SettingsAndBackupPage key="backups" initialTab="backups" />;
      case 'trash':
        return <TrashAndLogsPage key="trash" initialTab="trash" />;
      case 'logs':
        return <TrashAndLogsPage key="logs" initialTab="logs" />;
      default:
        return <DashboardPage />;
    }
  };

  const companyName = company?.company_name || 'DaftarPro Coworking';

  return (
    <div className="app-shell-bg min-h-screen bg-[#F8FAFC] text-slate-900 flex">
      {/* Mobile Sidebar Overlay Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Desktop & Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0F172A] text-slate-300 flex flex-col border-r border-slate-800 transition-transform duration-200 lg:translate-x-0 lg:static ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {company?.logo_data ? (
              <img src={company.logo_data} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-teal-500 text-slate-950 font-black text-sm flex items-center justify-center shrink-0">
                {companyName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="truncate">
              <div className="text-xs font-bold text-white truncate">{companyName}</div>
              <div className="text-[10px] text-teal-400 font-medium">Coworking ERP Suite</div>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {(['Operations', 'Finance', 'Administration'] as const).map((section) => {
            const sectionItems = visibleNavItems.filter(i => i.section === section);
            if (sectionItems.length === 0) return null;
            return (
              <div key={section}>
                <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {section}
                </div>
                <div className="space-y-0.5">
                  {sectionItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => {
                          setActiveTab(item.key);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-teal-500/15 text-teal-300 font-semibold border-l-2 border-teal-400'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {isActive && <ChevronRight className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Guide Sidebar Button + Logged-in User Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 shrink-0 space-y-2">
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              setGuideOpen(true);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-teal-400" />
              AI Guide — How to Use
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-teal-400" />
          </button>

          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{user.full_name}</div>
              <div className="text-[11px] text-teal-400 font-medium truncate">{user.role_name}</div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200/80 px-3 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:bg-slate-100 rounded-lg shrink-0"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">{currentNavItem.label}</h1>
              <p className="text-[11px] text-slate-400 hidden sm:block truncate">
                Local SQLite Persistent Database • Currency: {appSettings?.currency_symbol || 'Rs.'} (PKR)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {Boolean(user.must_change_password) && (
              <button
                onClick={() => setActiveTab('settings')}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-lg hover:bg-amber-100 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                Default Password Active — Click to Change
              </button>
            )}

            <button
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Open AI Software Guide — How to Use This Software"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>AI Guide</span>
            </button>

            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-700" />
                  <span>Dark</span>
                </>
              )}
            </button>

            <button
              onClick={() => setActiveTab('invoices')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-teal-600" />
              Invoices
            </button>

            <button
              onClick={() => setActiveTab('backups')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-teal-600" />
              Backups
            </button>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 p-3 sm:p-6 max-w-[1600px] w-full mx-auto">
          {renderActivePage()}
        </main>
      </div>

      {/* Floating AI Software Guide Button */}
      <button
        onClick={() => setGuideOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white border border-teal-500/40 shadow-xl text-xs font-semibold transition-transform hover:scale-105 cursor-pointer no-print"
        title="Ask AI Agent how to use this software"
      >
        <span className="w-6 h-6 rounded-full bg-teal-500 text-slate-950 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5" />
        </span>
        <span>How to Use (AI Guide)</span>
      </button>

      {/* AI Software Guide Drawer */}
      <SoftwareGuideAgent isOpen={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* Global Print / PDF Preview Modal */}
      <PrintPreviewModal />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainShell />
    </AppProvider>
  );
}
