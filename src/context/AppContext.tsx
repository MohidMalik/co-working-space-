import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, getStoredToken, setStoredToken } from '../services/api';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export interface UserSession {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role_id: number;
  role_name: string;
  status: string;
  must_change_password: number;
  permissions: string[];
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void | Promise<void>;
}

export interface PrintDocumentPayload {
  type: 'invoice' | 'receipt' | 'expense-sheet' | 'business-report' | 'generic-table' | 'client-profile' | 'contract';
  title: string;
  data: any;
}

interface AppContextValue {
  user: UserSession | null;
  company: any;
  appSettings: any;
  loadingAuth: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  loginWithToken: (token: string, user: UserSession) => Promise<void>;
  logout: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  hasPermission: (permCode: string) => boolean;
  isAdmin: boolean;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  confirmAction: (options: ConfirmDialogOptions) => void;
  printPayload: PrintDocumentPayload | null;
  openPrintPreview: (payload: PrintDocumentPayload) => void;
  closePrintPreview: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const THEME_STORAGE_KEY = 'daftarpro_theme';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [appSettings, setAppSettings] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore
    }
    return 'light';
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);
  const [confirmReason, setConfirmReason] = useState<string>('');
  const [confirmBusy, setConfirmBusy] = useState<boolean>(false);
  const [printPayload, setPrintPayload] = useState<PrintDocumentPayload | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const loadSession = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      try {
        const pub = await apiRequest('/public/company-branding');
        setCompany(pub.company);
        setAppSettings(pub.appSettings);
      } catch {
        // ignore
      }
      setLoadingAuth(false);
      return;
    }

    try {
      const data = await apiRequest('/auth/me');
      setUser(data.user);
      setCompany(data.company);
      setAppSettings(data.appSettings);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (company?.company_name) {
      document.title = `${company.company_name} — Coworking Space Management`;
    }
  }, [company?.company_name]);

  const loginWithToken = async (token: string, loggedUser: UserSession) => {
    setStoredToken(token);
    setUser(loggedUser);
    await loadSession();
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout error
    }
    setStoredToken(null);
    setUser(null);
    setActiveTab('dashboard');
    showToast('Logged out safely.', 'info');
  };

  const refreshSettings = useCallback(async () => {
    try {
      const data = await apiRequest('/auth/me');
      if (data.user) setUser(data.user);
      if (data.company) setCompany(data.company);
      if (data.appSettings) setAppSettings(data.appSettings);
    } catch {
      // ignore
    }
  }, []);

  const hasPermission = useCallback(
    (permCode: string) => {
      if (!user) return false;
      if (user.role_name === 'Admin') return true;
      return user.permissions.includes(permCode);
    },
    [user]
  );

  const isAdmin = user?.role_name === 'Admin';

  const confirmAction = useCallback((options: ConfirmDialogOptions) => {
    setConfirmReason('');
    setConfirmDialog(options);
  }, []);

  const handleConfirmExecute = async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm(confirmReason.trim() || undefined);
      setConfirmDialog(null);
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <AppContext.Provider
      value={{
        user,
        company,
        appSettings,
        loadingAuth,
        activeTab,
        setActiveTab,
        theme,
        toggleTheme,
        loginWithToken,
        logout,
        refreshSettings,
        hasPermission,
        isAdmin,
        showToast,
        confirmAction,
        printPayload,
        openPrintPreview: (payload) => setPrintPayload(payload),
        closePrintPreview: () => setPrintPayload(null),
      }}
    >
      {children}

      {/* Toast Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none no-print">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium transition-all ${
              t.type === 'error'
                ? 'bg-red-950 text-white border-red-800'
                : t.type === 'info'
                ? 'bg-slate-900 text-white border-slate-700'
                : 'bg-slate-900 text-white border-emerald-600/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {t.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              ) : t.type === 'info' ? (
                <Info className="w-4 h-4 text-sky-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{t.message}</span>
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation Dialog Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  confirmDialog.danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-slate-900">{confirmDialog.title}</h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{confirmDialog.message}</p>

                {confirmDialog.requireReason && (
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Reason / Note (Optional)
                    </label>
                    <input
                      type="text"
                      value={confirmReason}
                      onChange={(e) => setConfirmReason(e.target.value)}
                      placeholder={confirmDialog.reasonPlaceholder || 'Enter reason for audit log...'}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={handleConfirmExecute}
                className={`px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  confirmDialog.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                {confirmBusy ? 'Processing...' : confirmDialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
