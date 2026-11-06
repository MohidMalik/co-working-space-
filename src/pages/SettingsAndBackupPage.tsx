import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest, getStoredToken } from '../services/api';
import { formatDateTime } from '../utils/format';
import { Building2, Database, Upload, Download, RotateCcw, KeyRound, Save, HardDrive, Trash2 } from 'lucide-react';

export default function SettingsAndBackupPage({ initialTab = 'company' }: { initialTab?: 'company' | 'backups' | 'security' }) {
  const { company, appSettings, refreshSettings, hasPermission, showToast, confirmAction } = useApp();
  const [activeTab, setActiveTab] = useState<'company' | 'backups' | 'security'>(initialTab);

  // Company Settings State
  const [companyForm, setCompanyForm] = useState({
    company_name: '',
    logo_data: '',
    phone: '',
    whatsapp: '',
    address: '',
    city: 'Lahore',
    email: '',
    website: '',
    tax_number: '',
    bank_name: '',
    bank_account_title: '',
    bank_account_number: '',
    bank_iban: '',
    invoice_prefix: 'INV-',
    next_invoice_number: 1,
    receipt_prefix: 'RCP-',
    next_receipt_number: 1,
    default_invoice_paragraph: '',
    default_invoice_notes: '',
    default_invoice_terms: '',
    default_payment_due_days: 7,
    signature_data: '',
    stamp_data: '',
    show_signature: 1,
    show_stamp: 1,
    signature_position: 'right',
    stamp_position: 'beside-signature',
    role1_title: 'Prepared By',
    role1_name: '',
    role1_signature_data: '',
    role2_title: 'Accountant',
    role2_name: '',
    role2_signature_data: '',
    role3_title: 'Authorized Signatory',
    role3_name: '',
    role3_signature_data: '',
  });

  const [appForm, setAppForm] = useState({
    currency_code: 'PKR',
    currency_symbol: 'Rs.',
    date_format: 'DD MMM YYYY',
    auto_backup_enabled: 1,
    auto_backup_frequency: 'Daily',
    expiry_warning_days: 30,
    low_availability_threshold: 2,
    printer_paper_size: 'A4',
  });

  const [savingCompany, setSavingCompany] = useState(false);

  // Backups State
  const [backups, setBackups] = useState<any[]>([]);
  const [backupDirectory, setBackupDirectory] = useState('');
  const [databasePath, setDatabasePath] = useState('');
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupLabel, setBackupLabel] = useState('');

  // Security / Password Change State
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingPassword, setSavingPassword] = useState(false);

  const applySettingsToForms = useCallback((comp: any, appSet: any) => {
    if (comp) {
      setCompanyForm({
        company_name: comp.company_name || '',
        logo_data: comp.logo_data || '',
        phone: comp.phone || '',
        whatsapp: comp.whatsapp || '',
        address: comp.address || '',
        city: comp.city || 'Lahore',
        email: comp.email || '',
        website: comp.website || '',
        tax_number: comp.tax_number || '',
        bank_name: comp.bank_name || '',
        bank_account_title: comp.bank_account_title || '',
        bank_account_number: comp.bank_account_number || '',
        bank_iban: comp.bank_iban || '',
        invoice_prefix: comp.invoice_prefix || 'INV-',
        next_invoice_number: Number(comp.next_invoice_number || 1),
        receipt_prefix: comp.receipt_prefix || 'RCP-',
        next_receipt_number: Number(comp.next_receipt_number || 1),
        default_invoice_paragraph: comp.default_invoice_paragraph || '',
        default_invoice_notes: comp.default_invoice_notes || '',
        default_invoice_terms: comp.default_invoice_terms || '',
        default_payment_due_days: Number(comp.default_payment_due_days || 7),
        signature_data: comp.signature_data || '',
        stamp_data: comp.stamp_data || '',
        show_signature: comp.show_signature !== undefined ? (comp.show_signature ? 1 : 0) : 1,
        show_stamp: comp.show_stamp !== undefined ? (comp.show_stamp ? 1 : 0) : 1,
        signature_position: comp.signature_position || 'right',
        stamp_position: comp.stamp_position || 'beside-signature',
        role1_title: comp.role1_title || 'Prepared By',
        role1_name: comp.role1_name || '',
        role1_signature_data: comp.role1_signature_data || '',
        role2_title: comp.role2_title || 'Accountant',
        role2_name: comp.role2_name || '',
        role2_signature_data: comp.role2_signature_data || '',
        role3_title: comp.role3_title || 'Authorized Signatory',
        role3_name: comp.role3_name || '',
        role3_signature_data: comp.role3_signature_data || '',
      });
    }
    if (appSet) {
      setAppForm({
        currency_code: appSet.currency_code || 'PKR',
        currency_symbol: appSet.currency_symbol || 'Rs.',
        date_format: appSet.date_format || 'DD MMM YYYY',
        auto_backup_enabled: appSet.auto_backup_enabled ? 1 : 0,
        auto_backup_frequency: appSet.auto_backup_frequency || 'Daily',
        expiry_warning_days: Number(appSet.expiry_warning_days || 30),
        low_availability_threshold: Number(appSet.low_availability_threshold || 2),
        printer_paper_size: appSet.printer_paper_size || 'A4',
      });
    }
  }, []);

  useEffect(() => {
    applySettingsToForms(company, appSettings);
  }, [company, appSettings, applySettingsToForms]);

  useEffect(() => {
    let active = true;
    apiRequest<{ company: any; appSettings: any }>('/settings')
      .then((res) => {
        if (!active) return;
        applySettingsToForms(res.company, res.appSettings);
      })
      .catch(() => {
        // fallback to context state
      });
    return () => {
      active = false;
    };
  }, [applySettingsToForms]);

  const loadBackups = useCallback(async () => {
    try {
      setLoadingBackups(true);
      const res = await apiRequest<{ backups: any[]; backupDirectory: string; databasePath: string }>('/backups');
      setBackups(res.backups || []);
      setBackupDirectory(res.backupDirectory || '');
      setDatabasePath(res.databasePath || '');
    } catch (err: any) {
      showToast(err.message || 'Failed to load backups', 'error');
    } finally {
      setLoadingBackups(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (activeTab === 'backups') {
      loadBackups();
    }
  }, [activeTab, loadBackups]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCompanyForm(prev => ({ ...prev, logo_data: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCompanyForm(prev => ({ ...prev, signature_data: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCompanyForm(prev => ({ ...prev, stamp_data: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleRoleSigUpload = (roleKey: 'role1' | 'role2' | 'role3', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      if (roleKey === 'role1') setCompanyForm(prev => ({ ...prev, role1_signature_data: data }));
      if (roleKey === 'role2') setCompanyForm(prev => ({ ...prev, role2_signature_data: data }));
      if (roleKey === 'role3') setCompanyForm(prev => ({ ...prev, role3_signature_data: data }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingCompany(true);
      await apiRequest('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          company: companyForm,
          appSettings: appForm,
        }),
      });
      await refreshSettings();
      showToast('Company profile and invoice defaults saved to SQLite database', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save company settings', 'error');
    } finally {
      setSavingCompany(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      const res = await apiRequest<{ backup: any }>('/backups', {
        method: 'POST',
        body: JSON.stringify({ label: backupLabel || 'Manual Backup' }),
      });
      setBackupLabel('');
      showToast(`Backup created: ${res.backup?.file_name || 'Success'}`, 'success');
      loadBackups();
    } catch (err: any) {
      showToast(err.message || 'Backup creation failed', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = (b: any) => {
    confirmAction({
      title: 'Restore Database Backup',
      message: `Are you sure you want to restore database backup "${b.file_name}"? A pre-restore safety backup of your current database will be created automatically before restoring.`,
      confirmLabel: 'Restore Backup Now',
      danger: true,
      onConfirm: async () => {
        try {
          await apiRequest(`/backups/${b.id}/restore`, {
            method: 'POST',
          });
          await refreshSettings();
          showToast(`Database restored from ${b.file_name}`, 'success');
          loadBackups();
        } catch (err: any) {
          showToast(err.message || 'Failed to restore backup', 'error');
        }
      },
    });
  };

  const handleDeleteBackup = (b: any) => {
    confirmAction({
      title: 'Delete Backup File',
      message: `Remove backup archive "${b.file_name}" from disk?`,
      confirmLabel: 'Delete Backup',
      danger: true,
      onConfirm: async () => {
        try {
          await apiRequest(`/backups/${b.id}`, { method: 'DELETE' });
          showToast('Backup file deleted', 'info');
          loadBackups();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete backup', 'error');
        }
      },
    });
  };

  const handleDownloadBackup = async (b: any) => {
    try {
      const token = getStoredToken();
      const response = await fetch(`/api/backups/${b.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = b.file_name || 'coworking_backup.db';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showToast(err.message || 'Failed to download backup file', 'error');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast('New password and confirmation do not match', 'error');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }
    try {
      setSavingPassword(true);
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      await refreshSettings();
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('Password updated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update password', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveTab('company')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'company' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Company Profile & Invoice Defaults
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'backups' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          Database Backup & Restore
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'security' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          Account Password & Security
        </button>
      </div>

      {/* Tab 1: Company Profile & Invoice Settings */}
      {activeTab === 'company' && (
        <form onSubmit={handleSaveCompany} className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Company Branding & Invoice Template Settings</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                These details automatically appear on all printed A4 Invoices, Payment Receipts, Expense Sheets, and Reports.
              </p>
            </div>
            {hasPermission('settings.manage') && (
              <button
                type="submit"
                disabled={savingCompany}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {savingCompany ? 'Saving Settings...' : 'Save Company Settings'}
              </button>
            )}
          </div>

          {/* Logo & Core Identity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center">
              {companyForm.logo_data ? (
                <img src={companyForm.logo_data} alt="Company Logo" className="h-20 w-auto object-contain mb-3 rounded" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xl mb-3">
                  {companyForm.company_name ? companyForm.company_name.slice(0, 2).toUpperCase() : 'DP'}
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Logo
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {companyForm.logo_data && (
                  <button
                    type="button"
                    onClick={() => setCompanyForm({ ...companyForm, logo_data: '' })}
                    className="px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Displayed in sidebar and printed documents</p>
            </div>

            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Website / Company Name (Software Title) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DaftarPro Coworking"
                  value={companyForm.company_name}
                  onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Updates the name shown in the sidebar, login screen, browser tab title, and all printed A4 documents.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Website Domain / URL (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. www.yourcoworking.com"
                  value={companyForm.website}
                  onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Printed on the header of A4 Invoices, Receipts, Contracts, and Client Profiles.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Number</label>
                <input
                  type="text"
                  value={companyForm.whatsapp}
                  onChange={(e) => setCompanyForm({ ...companyForm, whatsapp: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={companyForm.email}
                  onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">NTN / Tax Number (Optional)</label>
                <input
                  type="text"
                  value={companyForm.tax_number}
                  onChange={(e) => setCompanyForm({ ...companyForm, tax_number: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Office Address</label>
                <input
                  type="text"
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={companyForm.city}
                  onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          {/* Bank Details & Numbering */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
              <input
                type="text"
                value={companyForm.bank_name}
                onChange={(e) => setCompanyForm({ ...companyForm, bank_name: e.target.value })}
                placeholder="e.g. Meezan Bank"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account Title</label>
              <input
                type="text"
                value={companyForm.bank_account_title}
                onChange={(e) => setCompanyForm({ ...companyForm, bank_account_title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
              <input
                type="text"
                value={companyForm.bank_account_number}
                onChange={(e) => setCompanyForm({ ...companyForm, bank_account_number: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">IBAN</label>
              <input
                type="text"
                value={companyForm.bank_iban}
                onChange={(e) => setCompanyForm({ ...companyForm, bank_iban: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
          </div>

          {/* Prefixes & Currency */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Currency Symbol</label>
              <input
                type="text"
                value={appForm.currency_symbol}
                onChange={(e) => setAppForm({ ...appForm, currency_symbol: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Prefix</label>
              <input
                type="text"
                value={companyForm.invoice_prefix}
                onChange={(e) => setCompanyForm({ ...companyForm, invoice_prefix: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Next Invoice #</label>
              <input
                type="number"
                min="1"
                value={companyForm.next_invoice_number}
                onChange={(e) => setCompanyForm({ ...companyForm, next_invoice_number: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Prefix</label>
              <input
                type="text"
                value={companyForm.receipt_prefix}
                onChange={(e) => setCompanyForm({ ...companyForm, receipt_prefix: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contract Expiry Alert (Days)</label>
              <input
                type="number"
                min="1"
                value={appForm.expiry_warning_days}
                onChange={(e) => setAppForm({ ...appForm, expiry_warning_days: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
          </div>

          {/* Default Invoice Paragraphs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Custom Invoice Paragraph
              </label>
              <textarea
                rows={3}
                value={companyForm.default_invoice_paragraph}
                onChange={(e) => setCompanyForm({ ...companyForm, default_invoice_paragraph: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Invoice Notes / Payment Instructions
              </label>
              <textarea
                rows={3}
                value={companyForm.default_invoice_notes}
                onChange={(e) => setCompanyForm({ ...companyForm, default_invoice_notes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Invoice Terms & Conditions
              </label>
              <textarea
                rows={3}
                value={companyForm.default_invoice_terms}
                onChange={(e) => setCompanyForm({ ...companyForm, default_invoice_terms: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          {/* Section: Official Signature & Company Stamp */}
          <div className="pt-6 border-t border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Official Company Signature & Stamp</h4>
                <p className="text-xs text-slate-500">
                  Upload official digital signature and official stamp (PNG or JPG, transparent backgrounds supported). These appear on printed and PDF invoices.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Signature Upload Card */}
              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-900">Company Signature Image</span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(companyForm.show_signature)}
                        onChange={(e) => setCompanyForm({ ...companyForm, show_signature: e.target.checked ? 1 : 0 })}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      Show on Invoices
                    </label>
                  </div>
                  <div className="h-28 bg-white border border-slate-200 rounded-lg flex items-center justify-center p-2 mb-3">
                    {companyForm.signature_data ? (
                      <img
                        src={companyForm.signature_data}
                        alt="Company Signature"
                        className="max-h-24 max-w-full object-contain"
                      />
                    ) : (
                      <div className="text-center text-xs text-slate-400">
                        No signature image uploaded yet
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Upload Signature
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleSignatureUpload} className="hidden" />
                    </label>
                    {companyForm.signature_data && (
                      <button
                        type="button"
                        onClick={() => setCompanyForm({ ...companyForm, signature_data: '' })}
                        className="px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500">Position:</span>
                    <select
                      value={companyForm.signature_position}
                      onChange={(e) => setCompanyForm({ ...companyForm, signature_position: e.target.value })}
                      className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                    >
                      <option value="right">Right Aligned (Default)</option>
                      <option value="center">Center</option>
                      <option value="left">Left Aligned</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Stamp Upload Card */}
              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-900">Official Company Stamp / Seal</span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(companyForm.show_stamp)}
                        onChange={(e) => setCompanyForm({ ...companyForm, show_stamp: e.target.checked ? 1 : 0 })}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      Show on Invoices
                    </label>
                  </div>
                  <div className="h-28 bg-white border border-slate-200 rounded-lg flex items-center justify-center p-2 mb-3">
                    {companyForm.stamp_data ? (
                      <img
                        src={companyForm.stamp_data}
                        alt="Company Stamp"
                        className="max-h-24 max-w-full object-contain"
                      />
                    ) : (
                      <div className="text-center text-xs text-slate-400">
                        No official stamp image uploaded yet
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Upload Stamp
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleStampUpload} className="hidden" />
                    </label>
                    {companyForm.stamp_data && (
                      <button
                        type="button"
                        onClick={() => setCompanyForm({ ...companyForm, stamp_data: '' })}
                        className="px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500">Position:</span>
                    <select
                      value={companyForm.stamp_position}
                      onChange={(e) => setCompanyForm({ ...companyForm, stamp_position: e.target.value })}
                      className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                    >
                      <option value="beside-signature">Beside Signature</option>
                      <option value="overlap">Overlap / Stamped on Signature</option>
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Default Payment Due Terms */}
            <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Default Invoice Payment Terms</span>
                <span className="text-[11px] text-slate-500">
                  Number of days after invoice issuance before the payment is flagged as Due or Overdue.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 font-medium">Due in:</span>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={companyForm.default_payment_due_days}
                  onChange={(e) => setCompanyForm({ ...companyForm, default_payment_due_days: Number(e.target.value) || 7 })}
                  className="w-20 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white text-slate-900"
                />
                <span className="text-xs text-slate-600">days</span>
              </div>
            </div>
          </div>

          {/* Section: Global Invoice Role Titles & Designations */}
          <div className="pt-6 border-t border-slate-200 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Global Invoice Signatory Roles & Designations</h4>
              <p className="text-xs text-slate-500">
                Configure the three signatory roles displayed on invoices (e.g. Manager, Accountant, Authorized Signatory) along with their names and individual signature images. All new invoices automatically inherit these global settings.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Role 1 */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Role 1 Designation</span>
                  <span className="text-[10px] uppercase font-mono text-slate-400">Left Column</span>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Role Title / Designation</label>
                  <input
                    type="text"
                    value={companyForm.role1_title}
                    onChange={(e) => setCompanyForm({ ...companyForm, role1_title: e.target.value })}
                    placeholder="e.g. Prepared By or Manager"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Officer / Person Name</label>
                  <input
                    type="text"
                    value={companyForm.role1_name}
                    onChange={(e) => setCompanyForm({ ...companyForm, role1_name: e.target.value })}
                    placeholder="e.g. Muhammad Ali"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Role 1 Signature (Optional)</label>
                  <div className="h-16 bg-white border border-slate-200 rounded flex items-center justify-center p-1 mb-2">
                    {companyForm.role1_signature_data ? (
                      <img src={companyForm.role1_signature_data} alt="Role 1 Signature" className="max-h-14 max-w-full object-contain" />
                    ) : (
                      <span className="text-[11px] text-slate-400">No signature image</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[11px] font-semibold rounded cursor-pointer">
                      <Upload className="w-3 h-3" />
                      Upload
                      <input type="file" accept="image/*" onChange={(e) => handleRoleSigUpload('role1', e)} className="hidden" />
                    </label>
                    {companyForm.role1_signature_data && (
                      <button
                        type="button"
                        onClick={() => setCompanyForm({ ...companyForm, role1_signature_data: '' })}
                        className="text-[11px] text-red-600 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Role 2 */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Role 2 Designation</span>
                  <span className="text-[10px] uppercase font-mono text-slate-400">Center Column</span>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Role Title / Designation</label>
                  <input
                    type="text"
                    value={companyForm.role2_title}
                    onChange={(e) => setCompanyForm({ ...companyForm, role2_title: e.target.value })}
                    placeholder="e.g. Accountant or Checked By"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Officer / Person Name</label>
                  <input
                    type="text"
                    value={companyForm.role2_name}
                    onChange={(e) => setCompanyForm({ ...companyForm, role2_name: e.target.value })}
                    placeholder="e.g. Usman Tariq"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Role 2 Signature (Optional)</label>
                  <div className="h-16 bg-white border border-slate-200 rounded flex items-center justify-center p-1 mb-2">
                    {companyForm.role2_signature_data ? (
                      <img src={companyForm.role2_signature_data} alt="Role 2 Signature" className="max-h-14 max-w-full object-contain" />
                    ) : (
                      <span className="text-[11px] text-slate-400">No signature image</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[11px] font-semibold rounded cursor-pointer">
                      <Upload className="w-3 h-3" />
                      Upload
                      <input type="file" accept="image/*" onChange={(e) => handleRoleSigUpload('role2', e)} className="hidden" />
                    </label>
                    {companyForm.role2_signature_data && (
                      <button
                        type="button"
                        onClick={() => setCompanyForm({ ...companyForm, role2_signature_data: '' })}
                        className="text-[11px] text-red-600 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Role 3 */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Role 3 Designation</span>
                  <span className="text-[10px] uppercase font-mono text-slate-400">Right Column</span>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Role Title / Designation</label>
                  <input
                    type="text"
                    value={companyForm.role3_title}
                    onChange={(e) => setCompanyForm({ ...companyForm, role3_title: e.target.value })}
                    placeholder="e.g. Authorized Signatory or Director"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Officer / Person Name</label>
                  <input
                    type="text"
                    value={companyForm.role3_name}
                    onChange={(e) => setCompanyForm({ ...companyForm, role3_name: e.target.value })}
                    placeholder="e.g. Managing Partner"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Role 3 Signature (Optional)</label>
                  <div className="h-16 bg-white border border-slate-200 rounded flex items-center justify-center p-1 mb-2">
                    {companyForm.role3_signature_data ? (
                      <img src={companyForm.role3_signature_data} alt="Role 3 Signature" className="max-h-14 max-w-full object-contain" />
                    ) : (
                      <span className="text-[11px] text-slate-400">Uses official signature</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[11px] font-semibold rounded cursor-pointer">
                      <Upload className="w-3 h-3" />
                      Upload
                      <input type="file" accept="image/*" onChange={(e) => handleRoleSigUpload('role3', e)} className="hidden" />
                    </label>
                    {companyForm.role3_signature_data && (
                      <button
                        type="button"
                        onClick={() => setCompanyForm({ ...companyForm, role3_signature_data: '' })}
                        className="text-[11px] text-red-600 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Tab 2: Database Backup & Restore */}
      {activeTab === 'backups' && (
        <div className="space-y-5">
          {/* Local Storage Architecture Info */}
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shrink-0">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Local Persistent SQLite Storage Architecture</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    All records are automatically saved to disk inside <code className="text-teal-300 font-mono">CoworkingManagement_Data</code>.
                  </p>
                  <div className="mt-2 text-[11px] font-mono text-slate-400 space-y-0.5">
                    <div>Database File: <span className="text-slate-200">{databasePath || 'CoworkingManagement_Data/database/coworking.db'}</span></div>
                    <div>Backups Folder: <span className="text-slate-200">{backupDirectory || 'CoworkingManagement_Data/backups'}</span></div>
                  </div>
                </div>
              </div>

              {hasPermission('backup.create') && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={backupLabel}
                    onChange={(e) => setBackupLabel(e.target.value)}
                    placeholder="Optional backup label..."
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-400"
                  />
                  <button
                    onClick={handleCreateBackup}
                    disabled={creatingBackup}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    <Database className="w-4 h-4" />
                    {creatingBackup ? 'Creating Backup...' : 'Create Instant Backup'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Backups Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Available Database Backups ({backups.length})</h3>
              <span className="text-xs text-slate-500">Automatic daily backup runs on startup</span>
            </div>

            {loadingBackups ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading backup archives...</div>
            ) : backups.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">No backups created yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200">
                      <th className="py-3 px-4">Backup Label</th>
                      <th className="py-3 px-4">File Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Created Date & Time</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {backups.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-semibold text-slate-900">{b.backup_name}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{b.file_name}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                            {b.backup_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{formatDateTime(b.created_at)}</td>
                        <td className="py-3 px-4 text-slate-500 font-mono">{(Number(b.file_size || 0) / 1024).toFixed(1)} KB</td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => handleDownloadBackup(b)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-md cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </button>
                            {hasPermission('backup.restore') && (
                              <button
                                onClick={() => handleRestoreBackup(b)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold rounded-md cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Restore
                              </button>
                            )}
                            {hasPermission('backup.restore') && (
                              <button
                                onClick={() => handleDeleteBackup(b)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                                title="Delete Backup"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Security / Change Password */}
      {activeTab === 'security' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 max-w-lg">
          <h3 className="text-base font-bold text-slate-900 mb-1">Change Your Password</h3>
          <p className="text-xs text-slate-500 mb-5">
            Passwords are encrypted with PBKDF2-SHA512 cryptographic hashing before storing in SQLite.
          </p>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password *</label>
              <input
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Password (min. 6 characters) *</label>
              <input
                type="password"
                required
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password *</label>
              <input
                type="password"
                required
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
            >
              {savingPassword ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
