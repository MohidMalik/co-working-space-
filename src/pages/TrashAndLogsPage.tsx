import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { formatDateTime, exportToExcel } from '../utils/format';
import { Trash2, RotateCcw, ShieldAlert, Activity, Search, Download } from 'lucide-react';

export default function TrashAndLogsPage({ initialTab = 'trash' }: { initialTab?: 'trash' | 'logs' }) {
  const { hasPermission, showToast, confirmAction } = useApp();
  const [activeTab, setActiveTab] = useState<'trash' | 'logs'>(initialTab);

  // Trash State
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');

  // Logs State
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logSearch, setLogSearch] = useState('');

  const loadTrash = useCallback(async () => {
    if (!hasPermission('trash.view')) return;
    try {
      setLoadingTrash(true);
      const res = await apiRequest<{ items: any[] }>('/trash');
      setTrashItems(res.items || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load trash records', 'error');
    } finally {
      setLoadingTrash(false);
    }
  }, [hasPermission, showToast]);

  const loadLogs = useCallback(async () => {
    if (!hasPermission('activity_log.view')) return;
    try {
      setLoadingLogs(true);
      const res = await apiRequest<{ logs: any[] }>('/activity-logs');
      setLogs(res.logs || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load activity logs', 'error');
    } finally {
      setLoadingLogs(false);
    }
  }, [hasPermission, showToast]);

  useEffect(() => {
    if (activeTab === 'trash') {
      loadTrash();
    } else {
      loadLogs();
    }
  }, [activeTab, loadTrash, loadLogs]);

  const handleRestore = async (item: any) => {
    try {
      await apiRequest(`/trash/${item.id}/restore`, {
        method: 'POST',
      });
      showToast(`${item.record_type} "${item.record_label}" restored from Trash`, 'success');
      loadTrash();
    } catch (err: any) {
      showToast(err.message || 'Failed to restore record', 'error');
    }
  };

  const handlePermanentDelete = (item: any) => {
    confirmAction({
      title: 'Permanently Delete Record',
      message: `WARNING: You are about to permanently delete ${item.record_type} "${item.record_label}". This action cannot be undone.`,
      confirmLabel: 'Permanently Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await apiRequest(`/trash/${item.id}`, {
            method: 'DELETE',
          });
          showToast('Record permanently deleted from database', 'info');
          loadTrash();
        } catch (err: any) {
          showToast(err.message || 'Failed to permanently delete record', 'error');
        }
      },
    });
  };

  const filteredTrash = trashItems.filter(i => typeFilter === 'All' || i.record_type === typeFilter);
  const filteredLogs = logs.filter(
    l =>
      !logSearch ||
      (l.action || '').toLowerCase().includes(logSearch.toLowerCase()) ||
      (l.module || '').toLowerCase().includes(logSearch.toLowerCase()) ||
      (l.username || '').toLowerCase().includes(logSearch.toLowerCase()) ||
      (l.record_label || '').toLowerCase().includes(logSearch.toLowerCase()) ||
      (l.details || '').toLowerCase().includes(logSearch.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {hasPermission('trash.view') && (
            <button
              onClick={() => setActiveTab('trash')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'trash' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              Soft-Delete Trash Bin ({trashItems.length})
            </button>
          )}
          {hasPermission('activity_log.view') && (
            <button
              onClick={() => setActiveTab('logs')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'logs' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              System Activity & Audit Logs
            </button>
          )}
        </div>

        {activeTab === 'trash' ? (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
          >
            <option value="All">All Record Types</option>
            <option value="Client">Clients</option>
            <option value="Workspace">Workspaces</option>
            <option value="Contract">Contracts</option>
            <option value="Invoice">Invoices</option>
            <option value="Payment">Payments</option>
            <option value="Expense">Expenses</option>
            <option value="User">Employees & Users</option>
          </select>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search user, action, module..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <button
              onClick={() =>
                exportToExcel(
                  filteredLogs.map(l => ({
                    'Timestamp': l.created_at,
                    'User': l.username,
                    'Action': l.action,
                    'Module': l.module,
                    'Record': l.record_label,
                    'Details': l.details,
                  })),
                  'Audit_Activity_Logs'
                )
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Logs
            </button>
          </div>
        )}
      </div>

      {activeTab === 'trash' ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          {loadingTrash ? (
            <div className="py-16 text-center text-xs text-slate-400">Loading deleted records...</div>
          ) : filteredTrash.length === 0 ? (
            <div className="py-16 text-center">
              <Trash2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-800">Trash Bin is Empty</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Deleted clients, workspaces, contracts, invoices, payments, and expenses appear here for safe recovery.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200">
                    <th className="py-3 px-4">Module</th>
                    <th className="py-3 px-4">Record Name / Description</th>
                    <th className="py-3 px-4">Deleted By</th>
                    <th className="py-3 px-4">Deleted At</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTrash.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {item.record_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div>{item.record_label}</div>
                        {item.reason && <div className="text-[11px] text-slate-400 font-normal">Reason: {item.reason}</div>}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{item.deleted_by_name || 'System'}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDateTime(item.deleted_at)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {hasPermission('trash.restore') && (
                            <button
                              onClick={() => handleRestore(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold rounded-md cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Restore
                            </button>
                          )}
                          {hasPermission('trash.permanent_delete') && (
                            <button
                              onClick={() => handlePermanentDelete(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded-md cursor-pointer"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Delete Forever
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
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          {loadingLogs ? (
            <div className="py-16 text-center text-xs text-slate-400">Loading audit trail...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">No activity logs found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Module</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Record</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-500 font-mono whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{log.username || 'System'}</td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                          {log.module}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-teal-700">{log.action}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">{log.record_label || '—'}</td>
                      <td className="py-2.5 px-4 text-slate-600">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
