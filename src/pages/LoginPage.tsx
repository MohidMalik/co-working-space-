import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { Building2, Lock, User, ShieldCheck, AlertCircle, Sun, Moon, Database } from 'lucide-react';

export default function LoginPage() {
  const { loginWithToken, company, showToast, theme, toggleTheme } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, remember }),
      });
      setPassword('');
      await loginWithToken(res.token, res.user);
      showToast(`Welcome back, ${res.user.full_name}`, 'success');
    } catch (err: any) {
      setError(err.message || 'Invalid login credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 relative">
      {/* Top-right Theme Toggle */}
      <div className="absolute top-5 right-6">
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-teal-400" />
              <span>Dark Mode</span>
            </>
          )}
        </button>
      </div>

      <div
        className={`w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 rounded-xl overflow-hidden shadow-2xl border ${
          theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-800 text-slate-900'
        }`}
      >
        {/* Left Branding Panel */}
        <div className="md:col-span-5 bg-slate-950 text-white p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              {company?.logo_data ? (
                <img
                  src={company.logo_data}
                  alt="Company Logo"
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-lg object-contain bg-white p-1"
                />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-teal-600 flex items-center justify-center text-white">
                  <Building2 className="w-6 h-6" />
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white">
                  {company?.company_name || 'DaftarPro'}
                </h1>
                <p className="text-xs text-slate-400">Coworking Space Management</p>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <h2 className="text-xl font-semibold leading-snug text-white">
                {company?.company_name || 'DaftarPro Coworking & Executive Suites'}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Offline-first workspace management, client contracts, A4 invoicing, partial payment ledger, expense tracking, and SQLite backup & recovery.
              </p>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800/80 space-y-2.5 text-xs text-slate-400">
            <div className="flex items-center gap-2 text-teal-400 font-semibold">
              <Database className="w-4 h-4" />
              <span>Local SQLite Storage Active</span>
            </div>
            {company?.city && <div>Location: {company.city}</div>}
            {company?.phone && <div>Support: {company.phone}</div>}
          </div>
        </div>

        {/* Right Login Form */}
        <div className="md:col-span-7 p-8 md:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
              Sign in to Workspace Console
            </h2>
            <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              Enter your authorized username or email address and password to continue.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2.5 text-xs font-medium text-red-500">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                Username or Email Address
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter username or email"
                  className={`w-full pl-10 pr-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                    theme === 'dark'
                      ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className={`w-full pl-10 pr-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                    theme === 'dark'
                      ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className={`flex items-center gap-2 text-xs cursor-pointer select-none ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span>Keep session signed in on this workstation (30 days)</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 mt-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{submitting ? 'Authenticating...' : 'Sign In to System'}</span>
            </button>
          </form>

          <div className={`mt-8 pt-4 border-t flex items-center justify-between text-[11px] ${theme === 'dark' ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
            <span>Local SQLite Database Persistence Active</span>
            <span>Currency: PKR (Rs.)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
