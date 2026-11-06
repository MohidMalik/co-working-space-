export interface PermissionDef {
  code: string;
  name: string;
  module: string;
  description: string;
}

export const ALL_PERMISSIONS: PermissionDef[] = [
  { code: 'dashboard.view', name: 'Dashboard View', module: 'Dashboard', description: 'View business metrics, revenue charts, and operational alerts' },
  { code: 'clients.view', name: 'Clients View', module: 'Clients', description: 'View client directory and profiles' },
  { code: 'clients.create', name: 'Clients Create', module: 'Clients', description: 'Register new coworking clients' },
  { code: 'clients.edit', name: 'Clients Edit', module: 'Clients', description: 'Update client details and workspace assignments' },
  { code: 'clients.delete', name: 'Clients Delete', module: 'Clients', description: 'Move clients to Trash' },
  { code: 'workspaces.view', name: 'Workspaces View', module: 'Workspaces', description: 'View offices, desks, and meeting rooms' },
  { code: 'workspaces.create', name: 'Workspaces Create', module: 'Workspaces', description: 'Create new workspaces and offices' },
  { code: 'workspaces.edit', name: 'Workspaces Edit', module: 'Workspaces', description: 'Edit workspace pricing, status, and amenities' },
  { code: 'workspaces.delete', name: 'Workspaces Delete', module: 'Workspaces', description: 'Move workspaces to Trash' },
  { code: 'contracts.view', name: 'Contracts View', module: 'Contracts', description: 'View rental contracts and history' },
  { code: 'contracts.create', name: 'Contracts Create', module: 'Contracts', description: 'Create and renew client rental contracts' },
  { code: 'contracts.edit', name: 'Contracts Edit', module: 'Contracts', description: 'Modify contract terms and status' },
  { code: 'contracts.delete', name: 'Contracts Delete', module: 'Contracts', description: 'Move contracts to Trash' },
  { code: 'invoices.view', name: 'Invoices View', module: 'Invoices', description: 'View and print client invoices' },
  { code: 'invoices.create', name: 'Invoices Create', module: 'Invoices', description: 'Generate monthly and custom invoices' },
  { code: 'invoices.edit', name: 'Invoices Edit', module: 'Invoices', description: 'Edit invoices, line items, and custom paragraphs' },
  { code: 'invoices.delete', name: 'Invoices Delete', module: 'Invoices', description: 'Move invoices to Trash' },
  { code: 'payments.view', name: 'Payments View', module: 'Payments', description: 'View payment ledger and receipts' },
  { code: 'payments.create', name: 'Payments Create', module: 'Payments', description: 'Record full or partial invoice payments' },
  { code: 'payments.edit', name: 'Payments Edit', module: 'Payments', description: 'Update payment records' },
  { code: 'payments.delete', name: 'Payments Delete', module: 'Payments', description: 'Move payments to Trash' },
  { code: 'expenses.view', name: 'Expenses View', module: 'Expenses', description: 'View operational expenses and monthly sheets' },
  { code: 'expenses.create', name: 'Expenses Create', module: 'Expenses', description: 'Log new operational expenses' },
  { code: 'expenses.edit', name: 'Expenses Edit', module: 'Expenses', description: 'Modify expense entries' },
  { code: 'expenses.delete', name: 'Expenses Delete', module: 'Expenses', description: 'Move expenses to Trash' },
  { code: 'reports.view', name: 'Reports View', module: 'Reports', description: 'View monthly management and financial reports' },
  { code: 'reports.export', name: 'Reports Export', module: 'Reports', description: 'Export reports and data to PDF / Excel' },
  { code: 'users.manage', name: 'Users Manage', module: 'Administration', description: 'Create, edit, disable users and assign roles/permissions' },
  { code: 'settings.manage', name: 'Settings Manage', module: 'Administration', description: 'Configure company profile, logo, bank, and invoice defaults' },
  { code: 'trash.view', name: 'Trash View', module: 'Trash', description: 'View soft-deleted records in Trash' },
  { code: 'trash.restore', name: 'Trash Restore', module: 'Trash', description: 'Restore deleted records back to active modules' },
  { code: 'trash.permanent_delete', name: 'Trash Permanent Delete', module: 'Trash', description: 'Permanently purge records from Trash (Admin only)' },
  { code: 'backup.create', name: 'Backup Create', module: 'Backups', description: 'Create manual SQLite database backups' },
  { code: 'backup.restore', name: 'Backup Restore', module: 'Backups', description: 'Restore SQLite database from backup (Admin only)' },
  { code: 'activity_log.view', name: 'Activity Log View', module: 'Audit', description: 'View immutable system audit and activity logs' },
];

export const DEFAULT_WORKSPACE_TYPES = [
  'Private Office',
  'Shared Office',
  'Dedicated Desk',
  'Hot Desk',
  'Meeting Room',
  'Conference Room',
  'Virtual Office',
  'Other',
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Electricity',
  'Internet',
  'Rent',
  'Salaries',
  'Furniture',
  'Repairs',
  'Office Supplies',
  'Marketing',
  'Maintenance',
  'Cleaning',
  'Generator Fuel',
  'Taxes & Legal',
  'Software & Subscriptions',
  'Refreshments / Kitchen',
  'Miscellaneous',
  'Other',
];

export const PAYMENT_METHODS = [
  'Cash',
  'Bank Transfer',
  'Easypaisa',
  'JazzCash',
  'Online Payment',
  'Card',
  'Other',
];
