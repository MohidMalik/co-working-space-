import express from 'express';
import {
  queryAll,
  queryOne,
  executeSql,
  getLastInsertId,
  runInTransaction,
  logActivity,
  recalculateAllStatuses,
  recalculateSingleInvoice,
} from '../db';
import { AuthRequest, requireAuth, requirePermission } from './authAndUsers';

function padNumber(num: number, width = 6): string {
  return String(num).padStart(width, '0');
}

export function registerOperationsRoutes(router: express.Router) {
  // ---------------------------------------------------------------------------
  // 1. DASHBOARD
  // ---------------------------------------------------------------------------
  router.get('/dashboard', requireAuth, requirePermission('dashboard.view'), (req: AuthRequest, res) => {
    recalculateAllStatuses();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const todayMidnight = new Date(`${today}T00:00:00Z`).getTime();
    const currentMonthPrefix = today.slice(0, 7); // YYYY-MM

    // Query parameters for date range filtering
    const range = String(req.query.range || 'month'); // 'month' | 'quarter' | 'year' | 'all' | 'custom'
    const qYear = Number(req.query.year) || now.getFullYear();
    const qMonth = Number(req.query.month) || (now.getMonth() + 1);
    const qQuarter = Number(req.query.quarter) || Math.floor(now.getMonth() / 3) + 1;

    let filterStart = `${currentMonthPrefix}-01`;
    let filterEnd = `${currentMonthPrefix}-31`;
    let rangeLabel = new Date(qYear, qMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (range === 'quarter') {
      const startM = (qQuarter - 1) * 3 + 1;
      const endM = qQuarter * 3;
      filterStart = `${qYear}-${String(startM).padStart(2, '0')}-01`;
      filterEnd = `${qYear}-${String(endM).padStart(2, '0')}-31`;
      rangeLabel = `Q${qQuarter} ${qYear} (${new Date(qYear, startM - 1, 1).toLocaleDateString('en-US', { month: 'short' })} - ${new Date(qYear, endM - 1, 1).toLocaleDateString('en-US', { month: 'short' })})`;
    } else if (range === 'year') {
      filterStart = `${qYear}-01-01`;
      filterEnd = `${qYear}-12-31`;
      rangeLabel = `Year ${qYear}`;
    } else if (range === 'all') {
      filterStart = '2000-01-01';
      filterEnd = '2099-12-31';
      rangeLabel = 'All Time';
    } else if (range === 'custom') {
      filterStart = String(req.query.startDate || `${currentMonthPrefix}-01`).slice(0, 10);
      filterEnd = String(req.query.endDate || today).slice(0, 10);
      rangeLabel = `${filterStart} to ${filterEnd}`;
    } else {
      // Month
      const ym = `${qYear}-${String(qMonth).padStart(2, '0')}`;
      filterStart = `${ym}-01`;
      filterEnd = `${ym}-31`;
      rangeLabel = new Date(qYear, qMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    // Workspaces & Clients counts
    const totalClients = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM clients WHERE is_deleted = 0')?.cnt || 0;
    const activeClients = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM clients WHERE is_deleted = 0 AND status = 'Active'")?.cnt || 0;

    const totalWorkspaces = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM workspaces WHERE is_deleted = 0')?.cnt || 0;
    const occupiedWorkspaces = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM workspaces WHERE is_deleted = 0 AND status = 'Occupied'")?.cnt || 0;
    const availableWorkspaces = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM workspaces WHERE is_deleted = 0 AND status = 'Available'")?.cnt || 0;
    const reservedWorkspaces = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM workspaces WHERE is_deleted = 0 AND status = 'Reserved'")?.cnt || 0;
    const maintenanceWorkspaces = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM workspaces WHERE is_deleted = 0 AND status = 'Maintenance'")?.cnt || 0;

    // Current Month Specific Figures (KPI 9, 10, 11)
    const thisMonthIncome =
      queryOne<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE is_deleted = 0 AND substr(payment_date, 1, 7) = ?',
        [currentMonthPrefix]
      )?.total || 0;

    const thisMonthExpenses =
      queryOne<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE is_deleted = 0 AND substr(expense_date, 1, 7) = ?',
        [currentMonthPrefix]
      )?.total || 0;

    const thisMonthProfit = thisMonthIncome - thisMonthExpenses;

    // Range-filtered Figures (KPIs 1, 2, 3, 4, 5, 6)
    const totalInvoicedIncome =
      queryOne<{ total: number }>(
        "SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE is_deleted = 0 AND status NOT IN ('Cancelled', 'Draft') AND invoice_date >= ? AND invoice_date <= ?",
        [filterStart, filterEnd]
      )?.total || 0;

    const totalMoneyReceived =
      queryOne<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE is_deleted = 0 AND payment_date >= ? AND payment_date <= ?',
        [filterStart, filterEnd]
      )?.total || 0;

    const totalOutstandingReceivables =
      queryOne<{ total: number }>(
        "SELECT COALESCE(SUM(remaining_amount), 0) as total FROM invoices WHERE is_deleted = 0 AND status NOT IN ('Cancelled', 'Draft') AND invoice_date >= ? AND invoice_date <= ?",
        [filterStart, filterEnd]
      )?.total || 0;

    const totalExpenses =
      queryOne<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE is_deleted = 0 AND expense_date >= ? AND expense_date <= ?',
        [filterStart, filterEnd]
      )?.total || 0;

    const unpaidExpensesRow =
      queryOne<{ total: number; cnt: number }>(
        "SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM expenses WHERE is_deleted = 0 AND payment_status IN ('Unpaid', 'Partially Paid') AND expense_date >= ? AND expense_date <= ?",
        [filterStart, filterEnd]
      );
    const unpaidExpenses = unpaidExpensesRow?.total || 0;
    const paidExpenses = totalExpenses - unpaidExpenses;

    // Net profit calculations:
    // Cash Basis: Money actually received minus Expenses actually paid
    const netProfitCash = Math.round((totalMoneyReceived - paidExpenses) * 100) / 100;
    // Accrual Basis: Invoiced income minus Total expenses incurred
    const netProfitAccrual = Math.round((totalInvoicedIncome - totalExpenses) * 100) / 100;

    // Overdue and Due Today Calculations (KPIs 7 & 8)
    const paymentsDueTodayRow = queryOne<{ cnt: number; amount: number }>(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(remaining_amount), 0) as amount FROM invoices WHERE is_deleted = 0 AND status NOT IN ('Cancelled', 'Draft') AND remaining_amount > 0 AND due_date = ?",
      [today]
    );

    const overduePaymentsRow = queryOne<{ cnt: number; amount: number }>(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(remaining_amount), 0) as amount FROM invoices WHERE is_deleted = 0 AND status NOT IN ('Cancelled', 'Draft') AND remaining_amount > 0 AND due_date < ?",
      [today]
    );

    const expiringContractsCount =
      queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM contracts WHERE is_deleted = 0 AND status = 'Expiring Soon'")?.cnt || 0;

    // -------------------------------------------------------------------------
    // SMART PAYMENT DUE ALERTS: "Upcoming Payments & Overdue Invoices" List
    // -------------------------------------------------------------------------
    const activeInvoicesWithDues = queryAll<any>(`
      SELECT id, invoice_number, invoice_date, due_date, expected_payment_date,
             client_id, client_name_snapshot as client_name, client_company_snapshot as company_name,
             client_phone_snapshot as client_phone, client_email_snapshot as client_email,
             workspace_snapshot as workspace, billing_period, total, paid_amount, remaining_amount, status
      FROM invoices
      WHERE is_deleted = 0 AND status NOT IN ('Cancelled', 'Draft') AND remaining_amount > 0
    `);

    const upcomingPaymentsAndOverdue = activeInvoicesWithDues.map((inv: any) => {
      const dueDateStr = inv.due_date ? String(inv.due_date).trim() : '';
      let daysRemaining = 0;
      let overdueDays = 0;
      let urgencyStatus: 'red' | 'orange' | 'yellow' | 'normal' | 'missing-date' = 'normal';
      let urgencyLabel = '';
      let sortPriority = 0;

      if (!dueDateStr) {
        urgencyStatus = 'missing-date';
        urgencyLabel = 'Due Date Missing';
        sortPriority = 950;
      } else {
        const dueMidnight = new Date(`${dueDateStr}T00:00:00Z`).getTime();
        const diffDays = Math.round((dueMidnight - todayMidnight) / (86400000));
        daysRemaining = diffDays;

        if (diffDays < 0) {
          overdueDays = Math.abs(diffDays);
          urgencyStatus = 'red';
          urgencyLabel = `${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue`;
          sortPriority = 1000 + overdueDays; // highest urgency
        } else if (diffDays === 0) {
          urgencyStatus = 'red';
          urgencyLabel = 'Due Today';
          sortPriority = 900;
        } else if (diffDays <= 3) {
          urgencyStatus = 'orange';
          urgencyLabel = `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
          sortPriority = 800 - diffDays;
        } else if (diffDays <= 7) {
          urgencyStatus = 'yellow';
          urgencyLabel = `Due in ${diffDays} days`;
          sortPriority = 700 - diffDays;
        } else {
          urgencyStatus = 'normal';
          urgencyLabel = `Due in ${diffDays} days`;
          sortPriority = 500 - diffDays;
        }
      }

      return {
        ...inv,
        days_remaining: daysRemaining,
        overdue_days: overdueDays,
        urgency_status: urgencyStatus,
        urgency_label: urgencyLabel,
        sort_priority: sortPriority,
      };
    });

    // Sort by urgency priority descending (overdue on top, then due today, 3 days, 7 days, normal)
    upcomingPaymentsAndOverdue.sort((a, b) => b.sort_priority - a.sort_priority);

    // Aging categories summary for receivables
    const receivablesAging = {
      overdueCount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'red' && i.overdue_days > 0).length,
      overdueAmount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'red' && i.overdue_days > 0).reduce((sum, i) => sum + Number(i.remaining_amount), 0),
      dueTodayCount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'red' && i.overdue_days === 0 && i.due_date === today).length,
      dueTodayAmount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'red' && i.overdue_days === 0 && i.due_date === today).reduce((sum, i) => sum + Number(i.remaining_amount), 0),
      due3DaysCount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'orange').length,
      due3DaysAmount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'orange').reduce((sum, i) => sum + Number(i.remaining_amount), 0),
      due7DaysCount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'yellow').length,
      due7DaysAmount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'yellow').reduce((sum, i) => sum + Number(i.remaining_amount), 0),
      futureCount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'normal').length,
      futureAmount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'normal').reduce((sum, i) => sum + Number(i.remaining_amount), 0),
      missingDateCount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'missing-date').length,
      missingDateAmount: upcomingPaymentsAndOverdue.filter(i => i.urgency_status === 'missing-date').reduce((sum, i) => sum + Number(i.remaining_amount), 0),
    };

    // Monthly chart data (last 6 months trend)
    const monthlyChart: Array<{ month: string; label: string; revenue: number; expenses: number; net: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const rev =
        queryOne<{ total: number }>('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE is_deleted = 0 AND substr(payment_date, 1, 7) = ?', [
          ym,
        ])?.total || 0;
      const exp =
        queryOne<{ total: number }>('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE is_deleted = 0 AND substr(expense_date, 1, 7) = ?', [
          ym,
        ])?.total || 0;
      monthlyChart.push({ month: ym, label, revenue: rev, expenses: exp, net: rev - exp });
    }

    // Expense breakdown by category in current filter range
    const expenseCategoryRows = queryAll<{ category: string; amount: number; count: number }>(`
      SELECT category, COALESCE(SUM(amount), 0) as amount, COUNT(*) as count
      FROM expenses
      WHERE is_deleted = 0 AND expense_date >= ? AND expense_date <= ?
      GROUP BY category
      ORDER BY amount DESC
    `, [filterStart, filterEnd]);

    // Paid vs Unpaid Invoices breakdown in current filter range
    const invoiceStatusRows = queryAll<{ status: string; count: number; total_amount: number; balance: number }>(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as total_amount, COALESCE(SUM(remaining_amount), 0) as balance
      FROM invoices
      WHERE is_deleted = 0 AND status NOT IN ('Cancelled') AND invoice_date >= ? AND invoice_date <= ?
      GROUP BY status
    `, [filterStart, filterEnd]);

    const recentInvoices = queryAll<any>(`
      SELECT id, invoice_number, client_name_snapshot as client_name, client_company_snapshot as company_name,
             total, paid_amount, remaining_amount, invoice_date, due_date, status
      FROM invoices
      WHERE is_deleted = 0
      ORDER BY invoice_date DESC, id DESC
      LIMIT 6
    `);

    const recentPayments = queryAll<any>(`
      SELECT p.id, p.receipt_number, p.amount, p.payment_method, p.payment_date,
             c.client_name, c.company_name, i.invoice_number
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN invoices i ON i.id = p.invoice_id
      WHERE p.is_deleted = 0
      ORDER BY p.payment_date DESC, p.id DESC
      LIMIT 6
    `);

    const recentExpenses = queryAll<any>(`
      SELECT id, expense_code, category, description, vendor, payer, payee, amount, expense_date, payment_method, payment_status
      FROM expenses
      WHERE is_deleted = 0
      ORDER BY expense_date DESC, id DESC
      LIMIT 6
    `);

    const appSettings = queryOne<{ low_availability_threshold: number; expiry_warning_days: number }>(
      'SELECT low_availability_threshold, expiry_warning_days FROM app_settings WHERE id = 1'
    );

    const alerts: Array<{ id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; module: string }> = [];
    if ((overduePaymentsRow?.cnt || 0) > 0) {
      alerts.push({
        id: 'overdue-inv',
        severity: 'critical',
        title: `${overduePaymentsRow!.cnt} Overdue Invoice${overduePaymentsRow!.cnt > 1 ? 's' : ''}`,
        detail: `Rs. ${Number(overduePaymentsRow!.amount).toLocaleString()} overdue beyond payment due date`,
        module: 'invoices',
      });
    }
    if ((paymentsDueTodayRow?.cnt || 0) > 0) {
      alerts.push({
        id: 'due-today-inv',
        severity: 'warning',
        title: `${paymentsDueTodayRow!.cnt} Invoice${paymentsDueTodayRow!.cnt > 1 ? 's' : ''} Due Today`,
        detail: `Rs. ${Number(paymentsDueTodayRow!.amount).toLocaleString()} due for collection today`,
        module: 'invoices',
      });
    }
    if (expiringContractsCount > 0) {
      alerts.push({
        id: 'expiring-contracts',
        severity: 'warning',
        title: `${expiringContractsCount} Contract${expiringContractsCount > 1 ? 's' : ''} Expiring Within ${appSettings?.expiry_warning_days || 30} Days`,
        detail: 'Review and renew client rental contracts to maintain occupancy',
        module: 'contracts',
      });
    }
    if (totalWorkspaces > 0 && availableWorkspaces <= (appSettings?.low_availability_threshold ?? 2)) {
      alerts.push({
        id: 'low-availability',
        severity: 'info',
        title: availableWorkspaces === 0 ? 'Full Workspace Occupancy' : `Low Workspace Availability (${availableWorkspaces} left)`,
        detail: `${occupiedWorkspaces} occupied, ${reservedWorkspaces} reserved out of ${totalWorkspaces} total workspaces`,
        module: 'workspaces',
      });
    }

    res.json({
      filter: {
        range,
        rangeLabel,
        startDate: filterStart,
        endDate: filterEnd,
      },
      stats: {
        // 11 Core Summary Cards
        totalInvoicedIncome,
        totalMoneyReceived,
        totalOutstandingReceivables,
        totalExpenses,
        unpaidExpenses,
        paidExpenses,
        netProfit: netProfitCash,
        netProfitCash,
        netProfitAccrual,
        paymentsDueTodayCount: paymentsDueTodayRow?.cnt || 0,
        paymentsDueTodayAmount: paymentsDueTodayRow?.amount || 0,
        overduePaymentsCount: overduePaymentsRow?.cnt || 0,
        overduePaymentsAmount: overduePaymentsRow?.amount || 0,
        thisMonthIncome,
        thisMonthExpenses,
        thisMonthProfit,

        // Workspaces & Clients counts
        totalClients,
        activeClients,
        totalWorkspaces,
        occupiedWorkspaces,
        availableWorkspaces,
        reservedWorkspaces,
        maintenanceWorkspaces,
        expiringContractsCount,
      },
      upcomingPaymentsAndOverdue,
      receivablesAging,
      monthlyChart,
      expenseCategoryRows,
      invoiceStatusRows,
      recentInvoices,
      recentPayments,
      recentExpenses,
      alerts,
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CLIENTS MANAGEMENT
  // ---------------------------------------------------------------------------
  router.get('/clients', requireAuth, requirePermission('clients.view'), (_req, res) => {
    const clients = queryAll<any>(`
      SELECT c.*,
             w.workspace_number, w.name as workspace_name, w.type as workspace_type, w.floor as workspace_floor,
             COALESCE((SELECT SUM(total) FROM invoices i WHERE i.client_id = c.id AND i.is_deleted = 0 AND i.status NOT IN ('Cancelled', 'Draft')), 0) as total_billed,
             COALESCE((SELECT SUM(amount) FROM payments p WHERE p.client_id = c.id AND p.is_deleted = 0), 0) as total_paid
      FROM clients c
      LEFT JOIN workspaces w ON w.id = c.workspace_id
      WHERE c.is_deleted = 0
      ORDER BY c.id DESC
    `);

    const enriched = clients.map((c) => ({
      ...c,
      total_outstanding: Math.max(0, Number(c.total_billed) - Number(c.total_paid)),
    }));

    res.json({ clients: enriched });
  });

  router.get('/clients/:id', requireAuth, requirePermission('clients.view'), (req, res) => {
    const clientId = Number(req.params.id);
    const client = queryOne<any>(
      `SELECT c.*, w.workspace_number, w.name as workspace_name, w.type as workspace_type, w.floor as workspace_floor, w.monthly_price as workspace_monthly_price
       FROM clients c
       LEFT JOIN workspaces w ON w.id = c.workspace_id
       WHERE c.id = ? AND c.is_deleted = 0`,
      [clientId]
    );
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const contracts = queryAll<any>(
      `SELECT ct.*, w.workspace_number, w.name as workspace_name, w.type as workspace_type
       FROM contracts ct
       LEFT JOIN workspaces w ON w.id = ct.workspace_id
       WHERE ct.client_id = ? AND ct.is_deleted = 0
       ORDER BY ct.start_date DESC, ct.id DESC`,
      [clientId]
    );

    const invoices = queryAll<any>(
      `SELECT * FROM invoices WHERE client_id = ? AND is_deleted = 0 ORDER BY invoice_date DESC, id DESC`,
      [clientId]
    );

    const payments = queryAll<any>(
      `SELECT p.*, i.invoice_number
       FROM payments p
       LEFT JOIN invoices i ON i.id = p.invoice_id
       WHERE p.client_id = ? AND p.is_deleted = 0
       ORDER BY p.payment_date DESC, p.id DESC`,
      [clientId]
    );

    const totalBilled = invoices
      .filter((i) => i.status !== 'Cancelled' && i.status !== 'Draft')
      .reduce((acc, i) => acc + Number(i.total || 0), 0);
    const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const totalOutstanding = Math.max(0, totalBilled - totalPaid);

    const activities = queryAll<any>(
      `SELECT * FROM activity_logs
       WHERE (module = 'Clients' AND record_id = ?) OR record_label LIKE ? OR details LIKE ?
       ORDER BY created_at DESC LIMIT 50`,
      [String(clientId), `%${client.client_name}%`, `%${client.client_name}%`]
    );

    const attachments = queryAll<any>(
      `SELECT id, entity_type, entity_id, file_name, mime_type, file_size, uploaded_by, created_at
       FROM attachments WHERE entity_type = 'Client' AND entity_id = ? ORDER BY created_at DESC`,
      [clientId]
    );

    res.json({
      client,
      contracts,
      invoices,
      payments,
      balance: {
        total_billed: totalBilled,
        total_paid: totalPaid,
        total_outstanding: totalOutstanding,
      },
      activities,
      attachments,
    });
  });

  router.post('/clients', requireAuth, requirePermission('clients.create'), (req: AuthRequest, res) => {
    try {
      const {
        client_name,
        company_name,
        phone,
        whatsapp,
        email,
        cnic,
        client_photo,
        cnic_front,
        cnic_back,
        address,
        city,
        contact_person,
        business_type,
        notes,
        status,
        workspace_id,
      } = req.body;

      if (!client_name || !phone) {
        return res.status(400).json({ error: 'Client Name and Phone Number are required.' });
      }

      const now = new Date().toISOString();
      let createdId = 0;

      runInTransaction(() => {
        const maxRow = queryOne<{ maxId: number }>('SELECT COALESCE(MAX(id), 0) as maxId FROM clients');
        const nextNum = (maxRow?.maxId || 0) + 1;
        const clientCode = `CL-${padNumber(nextNum, 4)}`;

        executeSql(
          `INSERT INTO clients (
            client_code, client_name, company_name, phone, whatsapp, email, cnic,
            client_photo, cnic_front, cnic_back,
            address, city, contact_person, business_type, notes, status, workspace_id,
            created_by, updated_by, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            clientCode,
            String(client_name).trim(),
            company_name || '',
            String(phone).trim(),
            whatsapp || '',
            email || '',
            cnic || '',
            client_photo || '',
            cnic_front || '',
            cnic_back || '',
            address || '',
            city || 'Lahore',
            contact_person || '',
            business_type || '',
            notes || '',
            status || 'Active',
            workspace_id ? Number(workspace_id) : null,
            req.user!.username,
            req.user!.username,
            now,
            now,
          ]
        );
        createdId = getLastInsertId();

        if (workspace_id && (status || 'Active') === 'Active') {
          executeSql("UPDATE workspaces SET status = 'Occupied', updated_by = ?, updated_at = ? WHERE id = ?", [
            req.user!.username,
            now,
            Number(workspace_id),
          ]);
        }

        logActivity(
          req.user!.id,
          req.user!.username,
          'Client Created',
          'Clients',
          createdId,
          `${client_name}${company_name ? ` (${company_name})` : ''}`,
          `Registered client ${clientCode} - ${client_name}`
        );
      });

      res.json({ message: 'Saved successfully.', id: createdId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/clients/:id', requireAuth, requirePermission('clients.edit'), (req: AuthRequest, res) => {
    try {
      const clientId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM clients WHERE id = ? AND is_deleted = 0', [clientId]);
      if (!existing) return res.status(404).json({ error: 'Client not found.' });

      const {
        client_name,
        company_name,
        phone,
        whatsapp,
        email,
        cnic,
        client_photo,
        cnic_front,
        cnic_back,
        address,
        city,
        contact_person,
        business_type,
        notes,
        status,
        workspace_id,
      } = req.body;

      if (!client_name || !phone) {
        return res.status(400).json({ error: 'Client Name and Phone Number are required.' });
      }

      const now = new Date().toISOString();
      const newWorkspaceId = workspace_id ? Number(workspace_id) : null;

      runInTransaction(() => {
        if (existing.workspace_id && existing.workspace_id !== newWorkspaceId) {
          executeSql("UPDATE workspaces SET status = 'Available', updated_at = ? WHERE id = ?", [now, existing.workspace_id]);
        }

        executeSql(
          `UPDATE clients SET
            client_name = ?, company_name = ?, phone = ?, whatsapp = ?, email = ?, cnic = ?,
            client_photo = ?, cnic_front = ?, cnic_back = ?,
            address = ?, city = ?, contact_person = ?, business_type = ?, notes = ?, status = ?,
            workspace_id = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`,
          [
            String(client_name).trim(),
            company_name || '',
            String(phone).trim(),
            whatsapp || '',
            email || '',
            cnic || '',
            client_photo !== undefined ? client_photo : (existing.client_photo || ''),
            cnic_front !== undefined ? cnic_front : (existing.cnic_front || ''),
            cnic_back !== undefined ? cnic_back : (existing.cnic_back || ''),
            address || '',
            city || 'Lahore',
            contact_person || '',
            business_type || '',
            notes || '',
            status || 'Active',
            newWorkspaceId,
            req.user!.username,
            now,
            clientId,
          ]
        );

        if (newWorkspaceId && (status || 'Active') === 'Active') {
          executeSql("UPDATE workspaces SET status = 'Occupied', updated_at = ? WHERE id = ?", [now, newWorkspaceId]);
        }

        logActivity(
          req.user!.id,
          req.user!.username,
          'Client Edited',
          'Clients',
          clientId,
          `${client_name}${company_name ? ` (${company_name})` : ''}`,
          `Updated client profile (${existing.client_code})`
        );
      });

      res.json({ message: 'Saved successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/clients/:id', requireAuth, requirePermission('clients.delete'), (req: AuthRequest, res) => {
    try {
      const clientId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM clients WHERE id = ? AND is_deleted = 0', [clientId]);
      if (!existing) return res.status(404).json({ error: 'Client not found.' });

      const reason = req.body?.reason || 'Moved to Trash by user';
      const now = new Date().toISOString();

      runInTransaction(() => {
        executeSql('UPDATE clients SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, clientId]);
        if (existing.workspace_id) {
          executeSql("UPDATE workspaces SET status = 'Available', updated_at = ? WHERE id = ?", [now, existing.workspace_id]);
        }
        executeSql(
          `INSERT INTO trash (original_id, record_type, record_label, record_data_json, deleted_by, deleted_by_name, deleted_at, reason)
           VALUES (?, 'Client', ?, ?, ?, ?, ?, ?)`,
          [
            clientId,
            `${existing.client_code} — ${existing.client_name} (${existing.company_name || 'Individual'})`,
            JSON.stringify(existing),
            req.user!.id,
            req.user!.username,
            now,
            reason,
          ]
        );
        logActivity(
          req.user!.id,
          req.user!.username,
          'Client Deleted (Trash)',
          'Clients',
          clientId,
          existing.client_name,
          `Moved client ${existing.client_code} (${existing.client_name}) to Trash. Financial history retained.`
        );
      });

      res.json({ message: 'Client moved to Trash.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. WORKSPACE / OFFICE MANAGEMENT
  // ---------------------------------------------------------------------------
  router.get('/workspaces', requireAuth, requirePermission('workspaces.view'), (_req, res) => {
    const workspaces = queryAll<any>(`
      SELECT w.*,
             c.id as current_client_id, c.client_name as current_client_name, c.company_name as current_company_name,
             ct.id as current_contract_id, ct.contract_number as current_contract_number,
             ct.monthly_rent as contract_monthly_rent, ct.start_date as contract_start_date, ct.end_date as contract_end_date,
             (SELECT status FROM invoices inv WHERE inv.workspace_id = w.id AND inv.is_deleted = 0 ORDER BY inv.invoice_date DESC LIMIT 1) as latest_payment_status
      FROM workspaces w
      LEFT JOIN clients c ON c.workspace_id = w.id AND c.is_deleted = 0 AND c.status = 'Active'
      LEFT JOIN contracts ct ON ct.workspace_id = w.id AND ct.is_deleted = 0 AND ct.status IN ('Active', 'Expiring Soon')
      WHERE w.is_deleted = 0
      GROUP BY w.id
      ORDER BY w.floor ASC, w.workspace_number ASC
    `);

    const types = queryAll<any>('SELECT * FROM workspace_types ORDER BY id ASC');
    res.json({ workspaces, types });
  });

  router.post('/workspaces', requireAuth, requirePermission('workspaces.create'), (req: AuthRequest, res) => {
    try {
      const { workspace_number, floor, type, name, capacity, monthly_price, daily_price, status, description, amenities, notes } = req.body;
      if (!workspace_number || !name || !type) {
        return res.status(400).json({ error: 'Workspace Number, Name, and Type are required.' });
      }

      const now = new Date().toISOString();
      let createdId = 0;

      runInTransaction(() => {
        const maxRow = queryOne<{ maxId: number }>('SELECT COALESCE(MAX(id), 0) as maxId FROM workspaces');
        const wsCode = `WS-${padNumber((maxRow?.maxId || 0) + 1, 4)}`;

        executeSql(
          `INSERT INTO workspaces (
            workspace_code, workspace_number, floor, type, name, capacity, monthly_price, daily_price,
            status, description, amenities, notes, created_by, updated_by, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            wsCode,
            String(workspace_number).trim(),
            floor || '1st Floor',
            type,
            String(name).trim(),
            Number(capacity) || 1,
            Number(monthly_price) || 0,
            Number(daily_price) || 0,
            status || 'Available',
            description || '',
            amenities || '',
            notes || '',
            req.user!.username,
            req.user!.username,
            now,
            now,
          ]
        );
        createdId = getLastInsertId();
        logActivity(req.user!.id, req.user!.username, 'Workspace Created', 'Workspaces', createdId, `${workspace_number} - ${name}`, `Added ${type} (${workspace_number})`);
      });

      res.json({ message: 'Saved successfully.', id: createdId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/workspaces/:id', requireAuth, requirePermission('workspaces.edit'), (req: AuthRequest, res) => {
    try {
      const wsId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM workspaces WHERE id = ? AND is_deleted = 0', [wsId]);
      if (!existing) return res.status(404).json({ error: 'Workspace not found.' });

      const { workspace_number, floor, type, name, capacity, monthly_price, daily_price, status, description, amenities, notes } = req.body;
      const now = new Date().toISOString();

      runInTransaction(() => {
        executeSql(
          `UPDATE workspaces SET
            workspace_number = ?, floor = ?, type = ?, name = ?, capacity = ?, monthly_price = ?, daily_price = ?,
            status = ?, description = ?, amenities = ?, notes = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`,
          [
            String(workspace_number).trim(),
            floor || '1st Floor',
            type,
            String(name).trim(),
            Number(capacity) || 1,
            Number(monthly_price) || 0,
            Number(daily_price) || 0,
            status || 'Available',
            description || '',
            amenities || '',
            notes || '',
            req.user!.username,
            now,
            wsId,
          ]
        );
        logActivity(req.user!.id, req.user!.username, 'Workspace Edited', 'Workspaces', wsId, `${workspace_number} - ${name}`, `Updated workspace ${workspace_number} (Status: ${status})`);
      });

      res.json({ message: 'Saved successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/workspaces/:id', requireAuth, requirePermission('workspaces.delete'), (req: AuthRequest, res) => {
    try {
      const wsId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM workspaces WHERE id = ? AND is_deleted = 0', [wsId]);
      if (!existing) return res.status(404).json({ error: 'Workspace not found.' });

      const now = new Date().toISOString();
      const reason = req.body?.reason || 'Moved to Trash';

      runInTransaction(() => {
        executeSql('UPDATE workspaces SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, wsId]);
        executeSql(
          `INSERT INTO trash (original_id, record_type, record_label, record_data_json, deleted_by, deleted_by_name, deleted_at, reason)
           VALUES (?, 'Workspace', ?, ?, ?, ?, ?, ?)`,
          [wsId, `${existing.workspace_number} — ${existing.name} (${existing.type})`, JSON.stringify(existing), req.user!.id, req.user!.username, now, reason]
        );
        logActivity(req.user!.id, req.user!.username, 'Workspace Deleted (Trash)', 'Workspaces', wsId, existing.workspace_number, `Moved workspace ${existing.workspace_number} to Trash`);
      });

      res.json({ message: 'Workspace moved to Trash.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // 4. CONTRACTS MANAGEMENT
  // ---------------------------------------------------------------------------
  router.get('/contracts', requireAuth, requirePermission('contracts.view'), (_req, res) => {
    recalculateAllStatuses();
    const contracts = queryAll<any>(`
      SELECT ct.*,
             c.client_name, c.company_name, c.phone as client_phone,
             w.workspace_number, w.name as workspace_name, w.type as workspace_type, w.floor as workspace_floor
      FROM contracts ct
      LEFT JOIN clients c ON c.id = ct.client_id
      LEFT JOIN workspaces w ON w.id = ct.workspace_id
      WHERE ct.is_deleted = 0
      ORDER BY ct.start_date DESC, ct.id DESC
    `);
    res.json({ contracts });
  });

  router.post('/contracts', requireAuth, requirePermission('contracts.create'), (req: AuthRequest, res) => {
    try {
      const {
        client_id,
        workspace_id,
        start_date,
        end_date,
        monthly_rent,
        security_deposit,
        payment_due_day,
        chairs_count,
        tables_count,
        ac_units,
        lockers_count,
        custom_requirements,
        contract_terms,
        additional_charges,
        notes,
        status,
        renewed_from_id,
      } = req.body;

      if (!client_id || !workspace_id || !start_date || !end_date) {
        return res.status(400).json({ error: 'Client, Workspace, Start Date, and End Date are required.' });
      }

      const now = new Date().toISOString();
      let createdId = 0;

      runInTransaction(() => {
        const maxRow = queryOne<{ maxId: number }>('SELECT COALESCE(MAX(id), 0) as maxId FROM contracts');
        const contractNumber = `CNT-${new Date().getFullYear()}-${padNumber((maxRow?.maxId || 0) + 1, 4)}`;

        if (renewed_from_id) {
          executeSql("UPDATE contracts SET status = 'Expired', updated_by = ?, updated_at = ? WHERE id = ?", [
            req.user!.username,
            now,
            Number(renewed_from_id),
          ]);
        }

        executeSql(
          `INSERT INTO contracts (
            contract_number, client_id, workspace_id, start_date, end_date,
            monthly_rent, security_deposit, payment_due_day,
            chairs_count, tables_count, ac_units, lockers_count, custom_requirements,
            contract_terms, additional_charges, notes, status, renewed_from_id,
            created_by, updated_by, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            contractNumber,
            Number(client_id),
            Number(workspace_id),
            start_date,
            end_date,
            Number(monthly_rent) || 0,
            Number(security_deposit) || 0,
            Number(payment_due_day) || 5,
            Math.max(0, Number(chairs_count) || 0),
            Math.max(0, Number(tables_count) || 0),
            Math.max(0, Number(ac_units) || 0),
            Math.max(0, Number(lockers_count) || 0),
            custom_requirements || '',
            contract_terms || '',
            Number(additional_charges) || 0,
            notes || '',
            status || 'Active',
            renewed_from_id ? Number(renewed_from_id) : null,
            req.user!.username,
            req.user!.username,
            now,
            now,
          ]
        );
        createdId = getLastInsertId();

        // Assign workspace to client and mark Occupied
        executeSql('UPDATE clients SET workspace_id = ?, status = ?, updated_at = ? WHERE id = ?', [
          Number(workspace_id),
          'Active',
          now,
          Number(client_id),
        ]);
        executeSql("UPDATE workspaces SET status = 'Occupied', updated_at = ? WHERE id = ?", [now, Number(workspace_id)]);

        recalculateAllStatuses();

        const cl = queryOne<any>('SELECT client_name FROM clients WHERE id = ?', [Number(client_id)]);
        logActivity(
          req.user!.id,
          req.user!.username,
          renewed_from_id ? 'Contract Renewed' : 'Contract Created',
          'Contracts',
          createdId,
          contractNumber,
          `${renewed_from_id ? 'Renewed' : 'Created'} contract ${contractNumber} for ${cl?.client_name || 'Client'} (Rs. ${Number(monthly_rent).toLocaleString()}/month)`
        );
      });

      res.json({ message: 'Saved successfully.', id: createdId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/contracts/:id', requireAuth, requirePermission('contracts.edit'), (req: AuthRequest, res) => {
    try {
      const contractId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM contracts WHERE id = ? AND is_deleted = 0', [contractId]);
      if (!existing) return res.status(404).json({ error: 'Contract not found.' });

      const {
        client_id,
        workspace_id,
        start_date,
        end_date,
        monthly_rent,
        security_deposit,
        payment_due_day,
        chairs_count,
        tables_count,
        ac_units,
        lockers_count,
        custom_requirements,
        contract_terms,
        additional_charges,
        notes,
        status,
      } = req.body;

      const now = new Date().toISOString();

      runInTransaction(() => {
        executeSql(
          `UPDATE contracts SET
            client_id = ?, workspace_id = ?, start_date = ?, end_date = ?,
            monthly_rent = ?, security_deposit = ?, payment_due_day = ?,
            chairs_count = ?, tables_count = ?, ac_units = ?, lockers_count = ?, custom_requirements = ?,
            contract_terms = ?, additional_charges = ?, notes = ?, status = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`,
          [
            Number(client_id),
            Number(workspace_id),
            start_date,
            end_date,
            Number(monthly_rent) || 0,
            Number(security_deposit) || 0,
            Number(payment_due_day) || 5,
            chairs_count !== undefined ? Math.max(0, Number(chairs_count) || 0) : (existing.chairs_count || 0),
            tables_count !== undefined ? Math.max(0, Number(tables_count) || 0) : (existing.tables_count || 0),
            ac_units !== undefined ? Math.max(0, Number(ac_units) || 0) : (existing.ac_units || 0),
            lockers_count !== undefined ? Math.max(0, Number(lockers_count) || 0) : (existing.lockers_count || 0),
            custom_requirements !== undefined ? custom_requirements : (existing.custom_requirements || ''),
            contract_terms || '',
            Number(additional_charges) || 0,
            notes || '',
            status || 'Active',
            req.user!.username,
            now,
            contractId,
          ]
        );
        recalculateAllStatuses();
        if (existing.workspace_id && existing.workspace_id !== Number(workspace_id)) {
          const activeOnOld = queryOne<{ cnt: number }>(
            "SELECT COUNT(*) as cnt FROM contracts WHERE workspace_id = ? AND is_deleted = 0 AND status IN ('Active', 'Expiring Soon')",
            [existing.workspace_id]
          );
          if (!activeOnOld || activeOnOld.cnt === 0) {
            executeSql("UPDATE workspaces SET status = 'Available', updated_at = ? WHERE id = ?", [now, existing.workspace_id]);
          }
        }
        if (workspace_id && (status === 'Active' || status === 'Expiring Soon')) {
          executeSql("UPDATE workspaces SET status = 'Occupied', updated_at = ? WHERE id = ?", [now, Number(workspace_id)]);
        } else if (workspace_id && (status === 'Cancelled' || status === 'Expired')) {
          const activeOnCurrent = queryOne<{ cnt: number }>(
            "SELECT COUNT(*) as cnt FROM contracts WHERE workspace_id = ? AND is_deleted = 0 AND status IN ('Active', 'Expiring Soon')",
            [Number(workspace_id)]
          );
          if (!activeOnCurrent || activeOnCurrent.cnt === 0) {
            executeSql("UPDATE workspaces SET status = 'Available', updated_at = ? WHERE id = ?", [now, Number(workspace_id)]);
          }
        }
        logActivity(req.user!.id, req.user!.username, 'Contract Edited', 'Contracts', contractId, existing.contract_number, `Updated contract ${existing.contract_number}`);
      });

      res.json({ message: 'Saved successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/contracts/:id', requireAuth, requirePermission('contracts.delete'), (req: AuthRequest, res) => {
    try {
      const contractId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM contracts WHERE id = ? AND is_deleted = 0', [contractId]);
      if (!existing) return res.status(404).json({ error: 'Contract not found.' });

      const now = new Date().toISOString();
      const reason = req.body?.reason || 'Moved to Trash';

      runInTransaction(() => {
        executeSql('UPDATE contracts SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, contractId]);
        if (existing.workspace_id) {
          const activeOnWs = queryOne<{ cnt: number }>(
            "SELECT COUNT(*) as cnt FROM contracts WHERE workspace_id = ? AND is_deleted = 0 AND status IN ('Active', 'Expiring Soon')",
            [existing.workspace_id]
          );
          if (!activeOnWs || activeOnWs.cnt === 0) {
            executeSql("UPDATE workspaces SET status = 'Available', updated_at = ? WHERE id = ?", [now, existing.workspace_id]);
          }
        }
        executeSql(
          `INSERT INTO trash (original_id, record_type, record_label, record_data_json, deleted_by, deleted_by_name, deleted_at, reason)
           VALUES (?, 'Contract', ?, ?, ?, ?, ?, ?)`,
          [contractId, `${existing.contract_number} (Rs. ${Number(existing.monthly_rent).toLocaleString()}/mo)`, JSON.stringify(existing), req.user!.id, req.user!.username, now, reason]
        );
        logActivity(req.user!.id, req.user!.username, 'Contract Deleted (Trash)', 'Contracts', contractId, existing.contract_number, `Moved contract ${existing.contract_number} to Trash`);
      });

      res.json({ message: 'Contract moved to Trash.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // 5. INVOICES MANAGEMENT
  // ---------------------------------------------------------------------------
  router.get('/invoices', requireAuth, requirePermission('invoices.view'), (_req, res) => {
    recalculateAllStatuses();
    const invoices = queryAll<any>(`
      SELECT i.*,
             c.client_code, c.whatsapp as client_whatsapp
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.is_deleted = 0
      ORDER BY i.invoice_date DESC, i.id DESC
    `);

    const items = queryAll<any>('SELECT * FROM invoice_items ORDER BY sort_order ASC, id ASC');
    const itemsByInvoice = new Map<number, any[]>();
    for (const item of items) {
      const arr = itemsByInvoice.get(item.invoice_id) || [];
      arr.push(item);
      itemsByInvoice.set(item.invoice_id, arr);
    }

    const enriched = invoices.map((inv) => ({
      ...inv,
      items: itemsByInvoice.get(inv.id) || [],
    }));

    const comp = queryOne<{ invoice_prefix: string; next_invoice_number: number }>(
      'SELECT invoice_prefix, next_invoice_number FROM company_settings WHERE id = 1'
    );
    const nextInvoicePreview = `${comp?.invoice_prefix || 'INV-'}${padNumber(comp?.next_invoice_number || 1, 6)}`;

    res.json({ invoices: enriched, nextInvoicePreview });
  });

  router.get('/invoices/:id', requireAuth, requirePermission('invoices.view'), (req, res) => {
    const invId = Number(req.params.id);
    recalculateSingleInvoice(invId);
    const invoice = queryOne<any>('SELECT * FROM invoices WHERE id = ? AND is_deleted = 0', [invId]);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    const items = queryAll<any>('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC', [invId]);
    const payments = queryAll<any>('SELECT * FROM payments WHERE invoice_id = ? AND is_deleted = 0 ORDER BY payment_date DESC, id DESC', [invId]);
    const company = queryOne<any>('SELECT * FROM company_settings WHERE id = 1');

    res.json({ invoice: { ...invoice, items, payments }, company });
  });

  router.post('/invoices', requireAuth, requirePermission('invoices.create'), (req: AuthRequest, res) => {
    try {
      const {
        invoice_date,
        due_date,
        expected_payment_date,
        client_id,
        workspace_id,
        contract_id,
        billing_period,
        custom_paragraph,
        items,
        discount,
        additional_charges,
        status,
        notes,
        terms,
        show_signature,
        show_stamp,
        signature_position,
        stamp_position,
        role1_title,
        role1_name,
        role2_title,
        role2_name,
        role3_title,
        role3_name,
      } = req.body;

      if (!client_id || !invoice_date || !billing_period) {
        return res.status(400).json({ error: 'Client, Invoice Date, and Billing Period are required.' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'At least one invoice line item is required.' });
      }

      const client = queryOne<any>('SELECT * FROM clients WHERE id = ?', [Number(client_id)]);
      if (!client) return res.status(400).json({ error: 'Selected client does not exist.' });

      const ws = workspace_id ? queryOne<any>('SELECT * FROM workspaces WHERE id = ?', [Number(workspace_id)]) : null;
      const comp = queryOne<any>('SELECT * FROM company_settings WHERE id = 1');

      const defDueDays = Number(comp?.default_payment_due_days) || 7;
      const finalDueDate = due_date || new Date(new Date(invoice_date).getTime() + defDueDays * 86400000).toISOString().slice(0, 10);
      const finalShowSig = show_signature !== undefined ? (show_signature ? 1 : 0) : (comp?.show_signature ?? 1);
      const finalShowStamp = show_stamp !== undefined ? (show_stamp ? 1 : 0) : (comp?.show_stamp ?? 1);
      const finalSigPos = signature_position || comp?.signature_position || 'right';
      const finalStampPos = stamp_position || comp?.stamp_position || 'beside-signature';
      const finalR1Title = role1_title || comp?.role1_title || 'Prepared By';
      const finalR1Name = role1_name !== undefined ? role1_name : (comp?.role1_name || '');
      const finalR2Title = role2_title || comp?.role2_title || 'Accountant / Checked By';
      const finalR2Name = role2_name !== undefined ? role2_name : (comp?.role2_name || '');
      const finalR3Title = role3_title || comp?.role3_title || 'Authorized Signatory';
      const finalR3Name = role3_name !== undefined ? role3_name : (comp?.role3_name || '');

      const now = new Date().toISOString();
      let createdInvoiceId = 0;
      let generatedNumber = '';

      runInTransaction(() => {
        let nextNum = comp?.next_invoice_number || 1;
        const prefix = comp?.invoice_prefix || 'INV-';
        generatedNumber = `${prefix}${padNumber(nextNum, 6)}`;

        while (queryOne('SELECT id FROM invoices WHERE invoice_number = ?', [generatedNumber])) {
          nextNum++;
          generatedNumber = `${prefix}${padNumber(nextNum, 6)}`;
        }

        executeSql('UPDATE company_settings SET next_invoice_number = ? WHERE id = 1', [nextNum + 1]);

        let subtotal = 0;
        const cleanItems = items.map((it: any, idx: number) => {
          const qty = Math.max(0.01, Number(it.quantity) || 1);
          const price = Number(it.unit_price) || 0;
          const amount = Math.round(qty * price * 100) / 100;
          subtotal += amount;
          return {
            description: String(it.description || 'Workspace Service').trim(),
            category: String(it.category || 'Monthly Office Rental'),
            quantity: qty,
            unit_price: price,
            amount,
            sort_order: idx,
          };
        });

        const disc = Math.max(0, Number(discount) || 0);
        const addCharges = Math.max(0, Number(additional_charges) || 0);
        const grandTotal = Math.max(0, Math.round((subtotal - disc + addCharges) * 100) / 100);

        const wsSnapshot = ws ? `${ws.workspace_number} — ${ws.name} (${ws.type}, ${ws.floor})` : '';

        executeSql(
          `INSERT INTO invoices (
            invoice_number, invoice_date, due_date, expected_payment_date, client_id,
            client_name_snapshot, client_company_snapshot, client_phone_snapshot, client_email_snapshot, client_address_snapshot,
            workspace_id, workspace_snapshot, contract_id, billing_period, custom_paragraph,
            subtotal, discount, additional_charges, total, paid_amount, remaining_amount,
            status, notes, terms,
            show_signature, show_stamp, signature_position, stamp_position,
            role1_title, role1_name, role2_title, role2_name, role3_title, role3_name,
            created_by, updated_by, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            generatedNumber,
            invoice_date,
            finalDueDate,
            expected_payment_date || '',
            Number(client_id),
            client.client_name,
            client.company_name || '',
            client.phone || '',
            client.email || '',
            `${client.address || ''}${client.city ? `, ${client.city}` : ''}`,
            ws ? ws.id : null,
            wsSnapshot,
            contract_id ? Number(contract_id) : null,
            billing_period,
            custom_paragraph ?? comp?.default_invoice_paragraph ?? '',
            subtotal,
            disc,
            addCharges,
            grandTotal,
            grandTotal,
            status === 'Draft' ? 'Draft' : 'Unpaid',
            notes ?? comp?.default_invoice_notes ?? '',
            terms ?? comp?.default_invoice_terms ?? '',
            finalShowSig,
            finalShowStamp,
            finalSigPos,
            finalStampPos,
            finalR1Title,
            finalR1Name,
            finalR2Title,
            finalR2Name,
            finalR3Title,
            finalR3Name,
            req.user!.username,
            req.user!.username,
            now,
            now,
          ]
        );

        createdInvoiceId = getLastInsertId();

        for (const it of cleanItems) {
          executeSql(
            `INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, amount, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [createdInvoiceId, it.description, it.category, it.quantity, it.unit_price, it.amount, it.sort_order]
          );
        }

        if (status === 'Paid' && grandTotal > 0) {
          let nextRcp = comp?.next_receipt_number || 1;
          const rcpPrefix = comp?.receipt_prefix || 'RCP-';
          let rcpNum = `${rcpPrefix}${padNumber(nextRcp, 6)}`;
          while (queryOne('SELECT id FROM payments WHERE receipt_number = ?', [rcpNum])) {
            nextRcp++;
            rcpNum = `${rcpPrefix}${padNumber(nextRcp, 6)}`;
          }
          executeSql('UPDATE company_settings SET next_receipt_number = ? WHERE id = 1', [nextRcp + 1]);
          const maxPay = queryOne<{ maxId: number }>('SELECT COALESCE(MAX(id), 0) as maxId FROM payments');
          const payCode = `PAY-${padNumber((maxPay?.maxId || 0) + 1, 5)}`;
          executeSql(
            `INSERT INTO payments (
              payment_code, receipt_number, client_id, invoice_id, payment_date, amount,
              payment_method, reference_number, transaction_screenshot, notes, received_by,
              created_by, updated_by, created_at, updated_at, is_deleted
            ) VALUES (?, ?, ?, ?, ?, ?, 'Bank Transfer', '', '', 'Recorded on invoice creation', ?, ?, ?, ?, ?, 0)`,
            [
              payCode,
              rcpNum,
              Number(client_id),
              createdInvoiceId,
              invoice_date,
              grandTotal,
              req.user!.full_name,
              req.user!.username,
              req.user!.username,
              now,
              now,
            ]
          );
        } else if (status === 'Cancelled') {
          executeSql("UPDATE invoices SET status = 'Cancelled' WHERE id = ?", [createdInvoiceId]);
        }

        recalculateSingleInvoice(createdInvoiceId);
        logActivity(
          req.user!.id,
          req.user!.username,
          'Invoice Created',
          'Invoices',
          createdInvoiceId,
          generatedNumber,
          `Created invoice ${generatedNumber} for ${client.client_name} — Total Rs. ${grandTotal.toLocaleString()}`
        );
      });

      res.json({ message: 'Saved successfully.', id: createdInvoiceId, invoice_number: generatedNumber });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/invoices/:id', requireAuth, requirePermission('invoices.edit'), (req: AuthRequest, res) => {
    try {
      const invId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM invoices WHERE id = ? AND is_deleted = 0', [invId]);
      if (!existing) return res.status(404).json({ error: 'Invoice not found.' });

      const {
        invoice_date,
        due_date,
        expected_payment_date,
        client_id,
        workspace_id,
        contract_id,
        billing_period,
        custom_paragraph,
        items,
        discount,
        additional_charges,
        status,
        notes,
        terms,
        show_signature,
        show_stamp,
        signature_position,
        stamp_position,
        role1_title,
        role1_name,
        role2_title,
        role2_name,
        role3_title,
        role3_name,
      } = req.body;

      const client = queryOne<any>('SELECT * FROM clients WHERE id = ?', [Number(client_id || existing.client_id)]);
      const ws = workspace_id ? queryOne<any>('SELECT * FROM workspaces WHERE id = ?', [Number(workspace_id)]) : null;
      const now = new Date().toISOString();

      runInTransaction(() => {
        let subtotal = 0;
        const cleanItems = (Array.isArray(items) ? items : []).map((it: any, idx: number) => {
          const qty = Math.max(0.01, Number(it.quantity) || 1);
          const price = Number(it.unit_price) || 0;
          const amount = Math.round(qty * price * 100) / 100;
          subtotal += amount;
          return {
            description: String(it.description || 'Workspace Service').trim(),
            category: String(it.category || 'Monthly Office Rental'),
            quantity: qty,
            unit_price: price,
            amount,
            sort_order: idx,
          };
        });

        const disc = Math.max(0, Number(discount) || 0);
        const addCharges = Math.max(0, Number(additional_charges) || 0);
        const grandTotal = Math.max(0, Math.round((subtotal - disc + addCharges) * 100) / 100);
        const wsSnapshot = ws
          ? `${ws.workspace_number} — ${ws.name} (${ws.type}, ${ws.floor})`
          : workspace_id === null || workspace_id === ''
          ? ''
          : existing.workspace_snapshot;

        executeSql(
          `UPDATE invoices SET
            invoice_date = ?, due_date = ?, expected_payment_date = ?, client_id = ?,
            client_name_snapshot = ?, client_company_snapshot = ?, client_phone_snapshot = ?, client_email_snapshot = ?, client_address_snapshot = ?,
            workspace_id = ?, workspace_snapshot = ?, contract_id = ?, billing_period = ?, custom_paragraph = ?,
            subtotal = ?, discount = ?, additional_charges = ?, total = ?,
            status = ?, notes = ?, terms = ?,
            show_signature = ?, show_stamp = ?, signature_position = ?, stamp_position = ?,
            role1_title = ?, role1_name = ?, role2_title = ?, role2_name = ?, role3_title = ?, role3_name = ?,
            updated_by = ?, updated_at = ?
           WHERE id = ?`,
          [
            invoice_date || existing.invoice_date,
            due_date || existing.due_date,
            expected_payment_date !== undefined ? expected_payment_date : (existing.expected_payment_date || ''),
            client ? client.id : existing.client_id,
            client ? client.client_name : existing.client_name_snapshot,
            client ? client.company_name || '' : existing.client_company_snapshot,
            client ? client.phone || '' : existing.client_phone_snapshot,
            client ? client.email || '' : existing.client_email_snapshot,
            client ? `${client.address || ''}${client.city ? `, ${client.city}` : ''}` : existing.client_address_snapshot,
            ws ? ws.id : null,
            wsSnapshot,
            contract_id ? Number(contract_id) : null,
            billing_period || existing.billing_period,
            custom_paragraph ?? existing.custom_paragraph,
            subtotal,
            disc,
            addCharges,
            grandTotal,
            status || existing.status,
            notes ?? existing.notes,
            terms ?? existing.terms,
            show_signature !== undefined ? (show_signature ? 1 : 0) : (existing.show_signature ?? 1),
            show_stamp !== undefined ? (show_stamp ? 1 : 0) : (existing.show_stamp ?? 1),
            signature_position || existing.signature_position || 'right',
            stamp_position || existing.stamp_position || 'beside-signature',
            role1_title !== undefined ? role1_title : (existing.role1_title || 'Prepared By'),
            role1_name !== undefined ? role1_name : (existing.role1_name || ''),
            role2_title !== undefined ? role2_title : (existing.role2_title || 'Accountant / Checked By'),
            role2_name !== undefined ? role2_name : (existing.role2_name || ''),
            role3_title !== undefined ? role3_title : (existing.role3_title || 'Authorized Signatory'),
            role3_name !== undefined ? role3_name : (existing.role3_name || ''),
            req.user!.username,
            now,
            invId,
          ]
        );

        if (cleanItems.length > 0) {
          executeSql('DELETE FROM invoice_items WHERE invoice_id = ?', [invId]);
          for (const it of cleanItems) {
            executeSql(
              `INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, amount, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [invId, it.description, it.category, it.quantity, it.unit_price, it.amount, it.sort_order]
            );
          }
        }

        if (status === 'Paid' && grandTotal > 0) {
          const currentPaidRow = queryOne<{ total_paid: number }>(
            'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = ? AND is_deleted = 0',
            [invId]
          );
          const currentPaid = Math.round((currentPaidRow?.total_paid ?? 0) * 100) / 100;
          const diff = Math.round((grandTotal - currentPaid) * 100) / 100;
          if (diff > 0) {
            const comp = queryOne<any>('SELECT * FROM company_settings WHERE id = 1');
            let nextRcp = comp?.next_receipt_number || 1;
            const rcpPrefix = comp?.receipt_prefix || 'RCP-';
            let rcpNum = `${rcpPrefix}${padNumber(nextRcp, 6)}`;
            while (queryOne('SELECT id FROM payments WHERE receipt_number = ?', [rcpNum])) {
              nextRcp++;
              rcpNum = `${rcpPrefix}${padNumber(nextRcp, 6)}`;
            }
            executeSql('UPDATE company_settings SET next_receipt_number = ? WHERE id = 1', [nextRcp + 1]);
            const maxPay = queryOne<{ maxId: number }>('SELECT COALESCE(MAX(id), 0) as maxId FROM payments');
            const payCode = `PAY-${padNumber((maxPay?.maxId || 0) + 1, 5)}`;
            executeSql(
              `INSERT INTO payments (
                payment_code, receipt_number, client_id, invoice_id, payment_date, amount,
                payment_method, reference_number, transaction_screenshot, notes, received_by,
                created_by, updated_by, created_at, updated_at, is_deleted
              ) VALUES (?, ?, ?, ?, ?, ?, 'Bank Transfer', '', '', 'Auto-recorded on marking invoice Paid', ?, ?, ?, ?, ?, 0)`,
              [
                payCode,
                rcpNum,
                client ? client.id : existing.client_id,
                invId,
                now.slice(0, 10),
                diff,
                req.user!.full_name,
                req.user!.username,
                req.user!.username,
                now,
                now,
              ]
            );
          }
        }

        recalculateSingleInvoice(invId);
        logActivity(
          req.user!.id,
          req.user!.username,
          status === 'Cancelled' ? 'Invoice Cancelled' : 'Invoice Edited',
          'Invoices',
          invId,
          existing.invoice_number,
          `Updated invoice ${existing.invoice_number} (Total Rs. ${grandTotal.toLocaleString()})`
        );
      });

      res.json({ message: 'Saved successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/invoices/:id', requireAuth, requirePermission('invoices.delete'), (req: AuthRequest, res) => {
    try {
      const invId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM invoices WHERE id = ? AND is_deleted = 0', [invId]);
      if (!existing) return res.status(404).json({ error: 'Invoice not found.' });

      const items = queryAll<any>('SELECT * FROM invoice_items WHERE invoice_id = ?', [invId]);
      const now = new Date().toISOString();
      const reason = req.body?.reason || 'Moved to Trash';

      runInTransaction(() => {
        executeSql('UPDATE invoices SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, invId]);
        executeSql(
          `INSERT INTO trash (original_id, record_type, record_label, record_data_json, deleted_by, deleted_by_name, deleted_at, reason)
           VALUES (?, 'Invoice', ?, ?, ?, ?, ?, ?)`,
          [
            invId,
            `${existing.invoice_number} — ${existing.client_name_snapshot} (Rs. ${Number(existing.total).toLocaleString()})`,
            JSON.stringify({ ...existing, items }),
            req.user!.id,
            req.user!.username,
            now,
            reason,
          ]
        );
        logActivity(req.user!.id, req.user!.username, 'Invoice Deleted (Trash)', 'Invoices', invId, existing.invoice_number, `Moved invoice ${existing.invoice_number} to Trash`);
      });

      res.json({ message: 'Invoice moved to Trash.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // 6. PAYMENTS MANAGEMENT
  // ---------------------------------------------------------------------------
  router.get('/payments', requireAuth, requirePermission('payments.view'), (_req, res) => {
    const payments = queryAll<any>(`
      SELECT p.*,
             c.client_name, c.company_name, c.phone as client_phone,
             i.invoice_number, i.total as invoice_total, i.paid_amount as invoice_paid, i.remaining_amount as invoice_remaining, i.billing_period
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN invoices i ON i.id = p.invoice_id
      WHERE p.is_deleted = 0
      ORDER BY p.payment_date DESC, p.id DESC
    `);
    res.json({ payments });
  });

  router.post('/payments', requireAuth, requirePermission('payments.create'), (req: AuthRequest, res) => {
    try {
      const { invoice_id, payment_date, amount, payment_method, reference_number, transaction_screenshot, notes, received_by } = req.body;
      if (!invoice_id || !payment_date || !amount || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Invoice, Payment Date, and a valid positive Amount are required.' });
      }

      const invoice = queryOne<any>('SELECT * FROM invoices WHERE id = ? AND is_deleted = 0', [Number(invoice_id)]);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

      const comp = queryOne<any>('SELECT receipt_prefix, next_receipt_number FROM company_settings WHERE id = 1');
      const now = new Date().toISOString();
      let createdPaymentId = 0;
      let receiptNumber = '';

      runInTransaction(() => {
        const maxRow = queryOne<{ maxId: number }>('SELECT COALESCE(MAX(id), 0) as maxId FROM payments');
        const payCode = `PAY-${padNumber((maxRow?.maxId || 0) + 1, 5)}`;

        let nextRcp = comp?.next_receipt_number || 1;
        const rcpPrefix = comp?.receipt_prefix || 'RCP-';
        receiptNumber = `${rcpPrefix}${padNumber(nextRcp, 6)}`;
        while (queryOne('SELECT id FROM payments WHERE receipt_number = ?', [receiptNumber])) {
          nextRcp++;
          receiptNumber = `${rcpPrefix}${padNumber(nextRcp, 6)}`;
        }
        executeSql('UPDATE company_settings SET next_receipt_number = ? WHERE id = 1', [nextRcp + 1]);

        const cleanAmount = Math.round(Number(amount) * 100) / 100;

        executeSql(
          `INSERT INTO payments (
            payment_code, receipt_number, client_id, invoice_id, payment_date,
            amount, payment_method, reference_number, transaction_screenshot, notes, received_by,
            created_by, updated_by, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            payCode,
            receiptNumber,
            invoice.client_id,
            invoice.id,
            payment_date,
            cleanAmount,
            payment_method || 'Bank Transfer',
            reference_number || '',
            transaction_screenshot || '',
            notes || '',
            received_by || req.user!.full_name,
            req.user!.username,
            req.user!.username,
            now,
            now,
          ]
        );
        createdPaymentId = getLastInsertId();

        // If invoice was Draft, transition it so recalculateSingleInvoice marks it Paid / Partially Paid
        if (invoice.status === 'Draft') {
          executeSql("UPDATE invoices SET status = 'Unpaid' WHERE id = ?", [invoice.id]);
        }
        recalculateSingleInvoice(invoice.id);

        logActivity(
          req.user!.id,
          req.user!.username,
          'Payment Added',
          'Payments',
          createdPaymentId,
          receiptNumber,
          `Received Rs. ${cleanAmount.toLocaleString()} via ${payment_method || 'Bank Transfer'} against ${invoice.invoice_number} (${invoice.client_name_snapshot})`
        );
      });

      res.json({ message: 'Saved successfully.', id: createdPaymentId, receipt_number: receiptNumber });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/payments/:id', requireAuth, requirePermission('payments.edit'), (req: AuthRequest, res) => {
    try {
      const payId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM payments WHERE id = ? AND is_deleted = 0', [payId]);
      if (!existing) return res.status(404).json({ error: 'Payment not found.' });

      const { payment_date, amount, payment_method, reference_number, transaction_screenshot, notes, received_by } = req.body;
      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Valid positive payment amount is required.' });
      }

      const now = new Date().toISOString();
      const cleanAmount = Math.round(Number(amount) * 100) / 100;

      runInTransaction(() => {
        executeSql(
          `UPDATE payments SET
            payment_date = ?, amount = ?, payment_method = ?, reference_number = ?,
            transaction_screenshot = ?, notes = ?, received_by = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`,
          [
            payment_date || existing.payment_date,
            cleanAmount,
            payment_method || existing.payment_method,
            reference_number ?? existing.reference_number,
            transaction_screenshot !== undefined ? transaction_screenshot : (existing.transaction_screenshot || ''),
            notes ?? existing.notes,
            received_by || existing.received_by,
            req.user!.username,
            now,
            payId,
          ]
        );
        recalculateSingleInvoice(existing.invoice_id);
        logActivity(req.user!.id, req.user!.username, 'Payment Edited', 'Payments', payId, existing.receipt_number, `Updated payment ${existing.receipt_number} to Rs. ${cleanAmount.toLocaleString()}`);
      });

      res.json({ message: 'Saved successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/payments/:id', requireAuth, requirePermission('payments.delete'), (req: AuthRequest, res) => {
    try {
      const payId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM payments WHERE id = ? AND is_deleted = 0', [payId]);
      if (!existing) return res.status(404).json({ error: 'Payment not found.' });

      const now = new Date().toISOString();
      const reason = req.body?.reason || 'Moved to Trash';

      runInTransaction(() => {
        executeSql('UPDATE payments SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, payId]);
        recalculateSingleInvoice(existing.invoice_id);
        executeSql(
          `INSERT INTO trash (original_id, record_type, record_label, record_data_json, deleted_by, deleted_by_name, deleted_at, reason)
           VALUES (?, 'Payment', ?, ?, ?, ?, ?, ?)`,
          [payId, `${existing.receipt_number} — Rs. ${Number(existing.amount).toLocaleString()}`, JSON.stringify(existing), req.user!.id, req.user!.username, now, reason]
        );
        logActivity(req.user!.id, req.user!.username, 'Payment Deleted (Trash)', 'Payments', payId, existing.receipt_number, `Moved payment ${existing.receipt_number} to Trash and recalculated invoice balance`);
      });

      res.json({ message: 'Payment moved to Trash.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // 7. EXPENSES MANAGEMENT & CATEGORIES
  // ---------------------------------------------------------------------------
  router.get('/expenses', requireAuth, requirePermission('expenses.view'), (_req, res) => {
    const expenses = queryAll<any>(`
      SELECT e.*,
             COALESCE(NULLIF(e.attachment_file_name, ''), a.file_name, '') as attachment_file_name,
             COALESCE(NULLIF(e.attachment_mime_type, ''), a.mime_type, '') as attachment_mime_type,
             COALESCE(NULLIF(e.attachment_data, ''), a.file_data, '') as attachment_data
      FROM expenses e
      LEFT JOIN attachments a ON a.id = e.attachment_id
      WHERE e.is_deleted = 0
      ORDER BY e.expense_date DESC, e.id DESC
    `);
    const categories = queryAll<any>('SELECT * FROM expense_categories ORDER BY is_default DESC, name ASC');
    res.json({ expenses, categories });
  });

  router.post('/expense-categories', requireAuth, requirePermission('expenses.create'), (req: AuthRequest, res) => {
    try {
      const { name } = req.body;
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'Category name is required.' });
      const cleanName = String(name).trim();
      const now = new Date().toISOString();
      executeSql('INSERT OR IGNORE INTO expense_categories (name, is_default, created_at) VALUES (?, 0, ?)', [cleanName, now]);
      logActivity(req.user!.id, req.user!.username, 'Expense Category Added', 'Expenses', null, cleanName, `Created custom expense category: ${cleanName}`);
      const categories = queryAll<any>('SELECT * FROM expense_categories ORDER BY is_default DESC, name ASC');
      res.json({ message: 'Category added.', categories });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/expense-categories/:id', requireAuth, requirePermission('expenses.edit'), (req: AuthRequest, res) => {
    try {
      const catId = Number(req.params.id);
      const { name } = req.body;
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'Category name is required.' });
      const cleanName = String(name).trim();

      const existing = queryOne<any>('SELECT * FROM expense_categories WHERE id = ?', [catId]);
      if (!existing) return res.status(404).json({ error: 'Category not found.' });

      runInTransaction(() => {
        executeSql('UPDATE expense_categories SET name = ? WHERE id = ?', [cleanName, catId]);
        executeSql('UPDATE expenses SET category = ? WHERE category = ?', [cleanName, existing.name]);
        logActivity(req.user!.id, req.user!.username, 'Expense Category Renamed', 'Expenses', catId, cleanName, `Renamed category "${existing.name}" to "${cleanName}"`);
      });

      const categories = queryAll<any>('SELECT * FROM expense_categories ORDER BY is_default DESC, name ASC');
      res.json({ message: 'Category updated.', categories });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/expense-categories/:id', requireAuth, requirePermission('expenses.delete'), (req: AuthRequest, res) => {
    try {
      const catId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM expense_categories WHERE id = ?', [catId]);
      if (!existing) return res.status(404).json({ error: 'Category not found.' });
      if (existing.is_default) {
        return res.status(400).json({ error: 'System default expense categories cannot be deleted.' });
      }

      runInTransaction(() => {
        executeSql('DELETE FROM expense_categories WHERE id = ?', [catId]);
        executeSql("UPDATE expenses SET category = 'Miscellaneous' WHERE category = ?", [existing.name]);
        logActivity(req.user!.id, req.user!.username, 'Expense Category Deleted', 'Expenses', catId, existing.name, `Deleted category "${existing.name}" and moved expenses to Miscellaneous`);
      });

      const categories = queryAll<any>('SELECT * FROM expense_categories ORDER BY is_default DESC, name ASC');
      res.json({ message: 'Category deleted.', categories });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/expenses', requireAuth, requirePermission('expenses.create'), (req: AuthRequest, res) => {
    try {
      const {
        expense_date,
        category,
        description,
        vendor,
        amount,
        payment_method,
        reference_number,
        attachment_id,
        notes,
        payer,
        payee,
        payment_status,
        attachment_file_name,
        attachment_mime_type,
        attachment_data,
      } = req.body;

      if (!expense_date || !category || !description || !amount || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Date, Category, Description, and valid positive Amount are required.' });
      }

      const now = new Date().toISOString();
      let createdId = 0;

      runInTransaction(() => {
        const maxRow = queryOne<{ maxId: number }>('SELECT COALESCE(MAX(id), 0) as maxId FROM expenses');
        const expCode = `EXP-${padNumber((maxRow?.maxId || 0) + 1, 5)}`;
        const cleanAmount = Math.round(Number(amount) * 100) / 100;

        executeSql('INSERT OR IGNORE INTO expense_categories (name, is_default, created_at) VALUES (?, 0, ?)', [String(category).trim(), now]);

        executeSql(
          `INSERT INTO expenses (
            expense_code, expense_date, category, description, vendor,
            amount, payment_method, reference_number, attachment_id, notes,
            payer, payee, payment_status, attachment_file_name, attachment_mime_type, attachment_data,
            created_by, updated_by, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            expCode,
            expense_date,
            String(category).trim(),
            String(description).trim(),
            vendor || payee || '',
            cleanAmount,
            payment_method || 'Cash',
            reference_number || '',
            attachment_id ? Number(attachment_id) : null,
            notes || '',
            payer || '',
            payee || vendor || '',
            payment_status || 'Paid',
            attachment_file_name || '',
            attachment_mime_type || '',
            attachment_data || '',
            req.user!.username,
            req.user!.username,
            now,
            now,
          ]
        );
        createdId = getLastInsertId();
        logActivity(
          req.user!.id,
          req.user!.username,
          'Expense Added',
          'Expenses',
          createdId,
          `${expCode} (${category})`,
          `Added expense ${expCode}: ${description} — Rs. ${cleanAmount.toLocaleString()} (${payment_status || 'Paid'})`
        );
      });

      res.json({ message: 'Saved successfully.', id: createdId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/expenses/:id', requireAuth, requirePermission('expenses.edit'), (req: AuthRequest, res) => {
    try {
      const expId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM expenses WHERE id = ? AND is_deleted = 0', [expId]);
      if (!existing) return res.status(404).json({ error: 'Expense not found.' });

      const {
        expense_date,
        category,
        description,
        vendor,
        amount,
        payment_method,
        reference_number,
        attachment_id,
        notes,
        payer,
        payee,
        payment_status,
        attachment_file_name,
        attachment_mime_type,
        attachment_data,
      } = req.body;

      const now = new Date().toISOString();
      const cleanAmount = Math.round(Number(amount) * 100) / 100;

      runInTransaction(() => {
        executeSql(
          `UPDATE expenses SET
            expense_date = ?, category = ?, description = ?, vendor = ?,
            amount = ?, payment_method = ?, reference_number = ?, attachment_id = ?, notes = ?,
            payer = ?, payee = ?, payment_status = ?,
            attachment_file_name = ?, attachment_mime_type = ?, attachment_data = ?,
            updated_by = ?, updated_at = ?
           WHERE id = ?`,
          [
            expense_date || existing.expense_date,
            String(category || existing.category).trim(),
            String(description || existing.description).trim(),
            vendor ?? (payee || existing.vendor),
            cleanAmount,
            payment_method || existing.payment_method,
            reference_number ?? existing.reference_number,
            attachment_id !== undefined ? (attachment_id ? Number(attachment_id) : null) : existing.attachment_id,
            notes ?? existing.notes,
            payer !== undefined ? payer : (existing.payer || ''),
            payee !== undefined ? payee : (existing.payee || existing.vendor || ''),
            payment_status || existing.payment_status || 'Paid',
            attachment_file_name !== undefined ? attachment_file_name : (existing.attachment_file_name || ''),
            attachment_mime_type !== undefined ? attachment_mime_type : (existing.attachment_mime_type || ''),
            attachment_data !== undefined ? attachment_data : (existing.attachment_data || ''),
            req.user!.username,
            now,
            expId,
          ]
        );
        logActivity(
          req.user!.id,
          req.user!.username,
          'Expense Edited',
          'Expenses',
          expId,
          existing.expense_code,
          `Updated expense ${existing.expense_code} — Rs. ${cleanAmount.toLocaleString()} (${payment_status || existing.payment_status || 'Paid'})`
        );
      });

      res.json({ message: 'Saved successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/expenses/:id', requireAuth, requirePermission('expenses.delete'), (req: AuthRequest, res) => {
    try {
      const expId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM expenses WHERE id = ? AND is_deleted = 0', [expId]);
      if (!existing) return res.status(404).json({ error: 'Expense not found.' });

      const now = new Date().toISOString();
      const reason = req.body?.reason || 'Moved to Trash';

      runInTransaction(() => {
        executeSql('UPDATE expenses SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, expId]);
        executeSql(
          `INSERT INTO trash (original_id, record_type, record_label, record_data_json, deleted_by, deleted_by_name, deleted_at, reason)
           VALUES (?, 'Expense', ?, ?, ?, ?, ?, ?)`,
          [expId, `${existing.expense_code} — ${existing.category}: ${existing.description} (Rs. ${Number(existing.amount).toLocaleString()})`, JSON.stringify(existing), req.user!.id, req.user!.username, now, reason]
        );
        logActivity(req.user!.id, req.user!.username, 'Expense Deleted (Trash)', 'Expenses', expId, existing.expense_code, `Moved expense ${existing.expense_code} to Trash`);
      });

      res.json({ message: 'Expense moved to Trash.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // 8. COMPREHENSIVE SEPARATE FINANCIAL REPORTS & SPREADSHEETS
  // ---------------------------------------------------------------------------
  router.get('/reports/financial', requireAuth, requirePermission('reports.view'), (req, res) => {
    recalculateAllStatuses();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const todayMidnight = new Date(`${today}T00:00:00Z`).getTime();

    const range = String(req.query.range || 'month'); // 'month' | 'quarter' | 'year' | 'all' | 'custom'
    const qYear = Number(req.query.year) || now.getFullYear();
    const qMonth = Number(req.query.month) || (now.getMonth() + 1);
    const qQuarter = Number(req.query.quarter) || Math.floor(now.getMonth() / 3) + 1;

    let filterStart = `${qYear}-${String(qMonth).padStart(2, '0')}-01`;
    let filterEnd = `${qYear}-${String(qMonth).padStart(2, '0')}-31`;
    let periodLabel = new Date(qYear, qMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (range === 'quarter') {
      const startM = (qQuarter - 1) * 3 + 1;
      const endM = qQuarter * 3;
      filterStart = `${qYear}-${String(startM).padStart(2, '0')}-01`;
      filterEnd = `${qYear}-${String(endM).padStart(2, '0')}-31`;
      periodLabel = `Q${qQuarter} ${qYear} (${new Date(qYear, startM - 1, 1).toLocaleDateString('en-US', { month: 'short' })} - ${new Date(qYear, endM - 1, 1).toLocaleDateString('en-US', { month: 'short' })})`;
    } else if (range === 'year') {
      filterStart = `${qYear}-01-01`;
      filterEnd = `${qYear}-12-31`;
      periodLabel = `Year ${qYear}`;
    } else if (range === 'all') {
      filterStart = '2000-01-01';
      filterEnd = '2099-12-31';
      periodLabel = 'All Time';
    } else if (range === 'custom') {
      filterStart = String(req.query.startDate || `${qYear}-${String(qMonth).padStart(2, '0')}-01`).slice(0, 10);
      filterEnd = String(req.query.endDate || today).slice(0, 10);
      periodLabel = `${filterStart} to ${filterEnd}`;
    }

    const company = queryOne<any>('SELECT * FROM company_settings WHERE id = 1');

    // -------------------------------------------------------------------------
    // A. EXPENSE REPORT
    // -------------------------------------------------------------------------
    const expenseReport = queryAll<any>(`
      SELECT e.id, e.expense_code, e.expense_date, e.category, e.description,
             e.vendor, COALESCE(NULLIF(e.payer, ''), 'Company') as payer,
             COALESCE(NULLIF(e.payee, ''), e.vendor, '') as payee,
             e.amount, e.payment_method, COALESCE(NULLIF(e.payment_status, ''), 'Paid') as payment_status,
             e.reference_number, e.notes,
             COALESCE(NULLIF(e.attachment_file_name, ''), a.file_name, '') as attachment_file_name,
             COALESCE(NULLIF(e.attachment_mime_type, ''), a.mime_type, '') as attachment_mime_type,
             COALESCE(NULLIF(e.attachment_data, ''), a.file_data, '') as attachment_data
      FROM expenses e
      LEFT JOIN attachments a ON a.id = e.attachment_id
      WHERE e.is_deleted = 0 AND e.expense_date >= ? AND e.expense_date <= ?
      ORDER BY e.expense_date DESC, e.id DESC
    `, [filterStart, filterEnd]);

    const totalExpensesIncurred = expenseReport.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalExpensesPaid = expenseReport
      .filter(e => e.payment_status === 'Paid')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalExpensesUnpaid = totalExpensesIncurred - totalExpensesPaid;

    // -------------------------------------------------------------------------
    // B. COWORKING SPACE INCOME REPORT
    // -------------------------------------------------------------------------
    const incomeReport = queryAll<any>(`
      SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.billing_period,
             i.client_id, i.client_name_snapshot as client_name,
             i.client_company_snapshot as company_name,
             i.client_phone_snapshot as client_phone,
             i.workspace_snapshot as workspace,
             i.total as invoice_amount,
             i.paid_amount,
             i.remaining_amount,
             i.status
      FROM invoices i
      WHERE i.is_deleted = 0 AND i.status NOT IN ('Cancelled', 'Draft')
        AND i.invoice_date >= ? AND i.invoice_date <= ?
      ORDER BY i.invoice_date DESC, i.id DESC
    `, [filterStart, filterEnd]);

    const totalInvoicedIncome = incomeReport.reduce((sum, i) => sum + Number(i.invoice_amount || 0), 0);
    const totalInvoicedCollected = incomeReport.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const totalInvoicedOutstanding = incomeReport.reduce((sum, i) => sum + Number(i.remaining_amount || 0), 0);

    // Actual cash payments collected in date range
    const cashPaymentsInRange = queryAll<any>(`
      SELECT p.id, p.receipt_number, p.payment_date, p.amount, p.payment_method, p.reference_number,
             p.client_id, c.client_name, c.company_name, i.invoice_number, i.billing_period
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN invoices i ON i.id = p.invoice_id
      WHERE p.is_deleted = 0 AND p.payment_date >= ? AND p.payment_date <= ?
      ORDER BY p.payment_date DESC, p.id DESC
    `, [filterStart, filterEnd]);

    const totalMoneyActuallyReceived = cashPaymentsInRange.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // -------------------------------------------------------------------------
    // C. PROFIT & LOSS REPORT
    // -------------------------------------------------------------------------
    // Net profit (Cash Basis: Real collected money minus Expenses actually paid)
    const netProfitCash = Math.round((totalMoneyActuallyReceived - totalExpensesPaid) * 100) / 100;
    // Net profit (Accrual Basis: Invoiced income minus Total expenses incurred)
    const netProfitAccrual = Math.round((totalInvoicedIncome - totalExpensesIncurred) * 100) / 100;

    // Previous period comparison
    let prevFilterStart = '';
    let prevFilterEnd = '';
    if (range === 'month') {
      const prevDate = new Date(qYear, qMonth - 2, 1);
      const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      prevFilterStart = `${prevYm}-01`;
      prevFilterEnd = `${prevYm}-31`;
    } else {
      const daysSpan = Math.max(1, Math.round((new Date(filterEnd).getTime() - new Date(filterStart).getTime()) / 86400000));
      const prevStartMs = new Date(filterStart).getTime() - daysSpan * 86400000;
      const prevEndMs = new Date(filterStart).getTime() - 86400000;
      prevFilterStart = new Date(prevStartMs).toISOString().slice(0, 10);
      prevFilterEnd = new Date(prevEndMs).toISOString().slice(0, 10);
    }

    const prevInvoiced =
      queryOne<{ total: number }>(
        "SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE is_deleted = 0 AND status NOT IN ('Cancelled', 'Draft') AND invoice_date >= ? AND invoice_date <= ?",
        [prevFilterStart, prevFilterEnd]
      )?.total || 0;

    const prevCollected =
      queryOne<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE is_deleted = 0 AND payment_date >= ? AND payment_date <= ?',
        [prevFilterStart, prevFilterEnd]
      )?.total || 0;

    const prevExpenses =
      queryOne<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE is_deleted = 0 AND expense_date >= ? AND expense_date <= ?',
        [prevFilterStart, prevFilterEnd]
      )?.total || 0;

    const prevNetProfit = prevCollected - prevExpenses;

    const calcPctChange = (current: number, prev: number) => {
      if (prev === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - prev) / Math.abs(prev)) * 100);
    };

    const plComparison = {
      previousInvoiced: prevInvoiced,
      previousCollected: prevCollected,
      previousExpenses: prevExpenses,
      previousNetProfit: prevNetProfit,
      revenueChangePct: calcPctChange(totalMoneyActuallyReceived, prevCollected),
      invoicedChangePct: calcPctChange(totalInvoicedIncome, prevInvoiced),
      expenseChangePct: calcPctChange(totalExpensesIncurred, prevExpenses),
      profitChangePct: calcPctChange(netProfitCash, prevNetProfit),
    };

    // -------------------------------------------------------------------------
    // D. CUSTOMER OUTSTANDING PAYMENTS REPORT
    // -------------------------------------------------------------------------
    const customerOutstandingReport = queryAll<any>(`
      SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.expected_payment_date,
             i.client_id, i.client_name_snapshot as client_name,
             i.client_company_snapshot as company_name,
             i.client_phone_snapshot as client_phone,
             i.client_email_snapshot as client_email,
             i.total as invoice_amount,
             i.paid_amount,
             i.remaining_amount,
             i.status
      FROM invoices i
      WHERE i.is_deleted = 0 AND i.status NOT IN ('Cancelled', 'Draft') AND i.remaining_amount > 0
      ORDER BY i.due_date ASC, i.id DESC
    `).map((inv: any) => {
      let overdueDays = 0;
      let daysRemaining = 0;
      if (inv.due_date) {
        const dueMidnight = new Date(`${inv.due_date}T00:00:00Z`).getTime();
        const diff = Math.round((dueMidnight - todayMidnight) / 86400000);
        daysRemaining = diff;
        if (diff < 0) overdueDays = Math.abs(diff);
      }
      return {
        ...inv,
        overdue_days: overdueDays,
        days_remaining: daysRemaining,
        is_overdue: overdueDays > 0,
      };
    });

    const totalAllOutstandingDues = customerOutstandingReport.reduce((sum, i) => sum + Number(i.remaining_amount || 0), 0);

    // -------------------------------------------------------------------------
    // E. MONTHLY FINANCIAL SUMMARY (Month-by-month table)
    // -------------------------------------------------------------------------
    const monthlySummaryReport: Array<{
      month: string;
      label: string;
      invoicedIncome: number;
      collectedRevenue: number;
      totalExpenses: number;
      unpaidExpenses: number;
      netCashProfit: number;
      netAccrualProfit: number;
      collectionRate: number;
    }> = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const mInvoiced =
        queryOne<{ total: number }>(
          "SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE is_deleted = 0 AND status NOT IN ('Cancelled', 'Draft') AND substr(invoice_date, 1, 7) = ?",
          [ym]
        )?.total || 0;

      const mCollected =
        queryOne<{ total: number }>(
          'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE is_deleted = 0 AND substr(payment_date, 1, 7) = ?',
          [ym]
        )?.total || 0;

      const mExpenses =
        queryOne<{ total: number }>(
          'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE is_deleted = 0 AND substr(expense_date, 1, 7) = ?',
          [ym]
        )?.total || 0;

      const mUnpaidExpenses =
        queryOne<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE is_deleted = 0 AND payment_status IN ('Unpaid', 'Partially Paid') AND substr(expense_date, 1, 7) = ?",
          [ym]
        )?.total || 0;

      const mPaidExpenses = mExpenses - mUnpaidExpenses;
      const mCashProfit = mCollected - mPaidExpenses;
      const mAccrualProfit = mInvoiced - mExpenses;
      const mRate = mInvoiced > 0 ? Math.round((mCollected / mInvoiced) * 100) : 100;

      monthlySummaryReport.push({
        month: ym,
        label,
        invoicedIncome: mInvoiced,
        collectedRevenue: mCollected,
        totalExpenses: mExpenses,
        unpaidExpenses: mUnpaidExpenses,
        netCashProfit: mCashProfit,
        netAccrualProfit: mAccrualProfit,
        collectionRate: mRate,
      });
    }

    res.json({
      company,
      period: {
        range,
        startDate: filterStart,
        endDate: filterEnd,
        label: periodLabel,
      },
      expenseReport: {
        expenses: expenseReport,
        totalExpensesIncurred,
        totalExpensesPaid,
        totalExpensesUnpaid,
      },
      incomeReport: {
        invoices: incomeReport,
        payments: cashPaymentsInRange,
        totalInvoicedIncome,
        totalInvoicedCollected,
        totalInvoicedOutstanding,
        totalMoneyActuallyReceived,
      },
      profitLossReport: {
        totalInvoicedIncome,
        totalMoneyActuallyReceived,
        totalOutstandingCustomerPayments: totalInvoicedOutstanding,
        totalExpensesIncurred,
        totalExpensesPaid,
        totalExpensesUnpaid,
        netProfitCash,
        netProfitAccrual,
        comparison: plComparison,
      },
      customerOutstandingReport: {
        invoices: customerOutstandingReport,
        totalOutstanding: totalAllOutstandingDues,
        overdueCount: customerOutstandingReport.filter(i => i.is_overdue).length,
      },
      monthlySummaryReport,
    });
  });

  // Keep /reports/monthly compatible for any existing calls
  router.get('/reports/monthly', requireAuth, requirePermission('reports.view'), (req, res) => {
    recalculateAllStatuses();
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const ym = `${year}-${String(month).padStart(2, '0')}`;

    const company = queryOne<any>('SELECT * FROM company_settings WHERE id = 1');

    const totalClients = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM clients WHERE is_deleted = 0')?.cnt || 0;
    const activeClients = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM clients WHERE is_deleted = 0 AND status = 'Active'")?.cnt || 0;
    const totalWorkspaces = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM workspaces WHERE is_deleted = 0')?.cnt || 0;
    const occupiedWorkspaces = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM workspaces WHERE is_deleted = 0 AND status = 'Occupied'")?.cnt || 0;
    const availableWorkspaces = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM workspaces WHERE is_deleted = 0 AND status = 'Available'")?.cnt || 0;

    const monthInvoices = queryAll<any>(
      'SELECT * FROM invoices WHERE is_deleted = 0 AND substr(invoice_date, 1, 7) = ? ORDER BY invoice_date ASC, id ASC',
      [ym]
    );

    const totalInvoices = monthInvoices.length;
    const paidInvoices = monthInvoices.filter((i) => i.status === 'Paid').length;
    const unpaidInvoices = monthInvoices.filter((i) => i.status === 'Unpaid' || i.status === 'Partially Paid').length;
    const overdueInvoices = monthInvoices.filter((i) => i.status === 'Overdue').length;

    const totalBilled = monthInvoices
      .filter((i) => i.status !== 'Cancelled' && i.status !== 'Draft')
      .reduce((sum, i) => sum + Number(i.total || 0), 0);

    const monthPayments = queryAll<any>(
      `SELECT p.*, c.client_name, c.company_name, i.invoice_number, i.billing_period
       FROM payments p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN invoices i ON i.id = p.invoice_id
       WHERE p.is_deleted = 0 AND substr(p.payment_date, 1, 7) = ?
       ORDER BY p.payment_date ASC, p.id ASC`,
      [ym]
    );

    const totalCollected = monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const outstandingAmount = monthInvoices
      .filter((i) => i.status !== 'Cancelled' && i.status !== 'Draft')
      .reduce((sum, i) => sum + Number(i.remaining_amount || 0), 0);

    const monthExpenses = queryAll<any>(
      `SELECT e.*,
              COALESCE(NULLIF(e.attachment_file_name, ''), a.file_name, '') as attachment_file_name,
              COALESCE(NULLIF(e.attachment_mime_type, ''), a.mime_type, '') as attachment_mime_type,
              COALESCE(NULLIF(e.attachment_data, ''), a.file_data, '') as attachment_data
       FROM expenses e
       LEFT JOIN attachments a ON a.id = e.attachment_id
       WHERE e.is_deleted = 0 AND substr(e.expense_date, 1, 7) = ?
       ORDER BY e.expense_date ASC, e.id ASC`,
      [ym]
    );
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const expenseByCategoryMap = new Map<string, { category: string; amount: number; count: number }>();
    for (const e of monthExpenses) {
      const curr = expenseByCategoryMap.get(e.category) || { category: e.category, amount: 0, count: 0 };
      curr.amount += Number(e.amount || 0);
      curr.count += 1;
      expenseByCategoryMap.set(e.category, curr);
    }
    const expenseBreakdown = Array.from(expenseByCategoryMap.values()).sort((a, b) => b.amount - a.amount);

    const expenseByMethodMap = new Map<string, { method: string; amount: number; count: number }>();
    for (const e of monthExpenses) {
      const m = e.payment_method || 'Cash';
      const curr = expenseByMethodMap.get(m) || { method: m, amount: 0, count: 0 };
      curr.amount += Number(e.amount || 0);
      curr.count += 1;
      expenseByMethodMap.set(m, curr);
    }
    const expenseMethodBreakdown = Array.from(expenseByMethodMap.values()).sort((a, b) => b.amount - a.amount);

    const revenueByMethodMap = new Map<string, { method: string; amount: number; count: number }>();
    for (const p of monthPayments) {
      const m = p.payment_method || 'Bank Transfer';
      const curr = revenueByMethodMap.get(m) || { method: m, amount: 0, count: 0 };
      curr.amount += Number(p.amount || 0);
      curr.count += 1;
      revenueByMethodMap.set(m, curr);
    }
    const revenueBreakdown = Array.from(revenueByMethodMap.values()).sort((a, b) => b.amount - a.amount);

    const netIncome = totalCollected - totalExpenses;

    res.json({
      company,
      period: {
        year,
        month,
        yearMonth: ym,
        label: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      },
      summary: {
        totalClients,
        activeClients,
        totalWorkspaces,
        occupiedWorkspaces,
        availableWorkspaces,
        totalInvoices,
        paidInvoices,
        unpaidInvoices,
        overdueInvoices,
        totalBilled,
        totalCollected,
        outstandingAmount,
        totalExpenses,
        netIncome,
      },
      expenseBreakdown,
      expenseMethodBreakdown,
      revenueBreakdown,
      invoices: monthInvoices,
      payments: monthPayments,
      expenses: monthExpenses,
    });
  });

  // ---------------------------------------------------------------------------
  // 9. OPTIONAL SAMPLE DATA SEEDER (1-CLICK DEMO WORKFLOW)
  // ---------------------------------------------------------------------------
  router.post('/seed-sample-data', requireAuth, (req: AuthRequest, res) => {
    try {
      const existingClients = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM clients WHERE is_deleted = 0')?.cnt || 0;
      if (existingClients > 0) {
        return res.status(400).json({ error: 'Database already contains client records. Sample data is only loaded into an empty workspace.' });
      }

      const now = new Date();
      const isoNow = now.toISOString();
      const ym = isoNow.slice(0, 7);
      const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      runInTransaction(() => {
        // 1. Create Workspaces
        const sampleWorkspaces = [
          ['WS-0001', 'PO-101', '1st Floor', 'Private Office', 'Executive Suite 101 (6-Person)', 6, 85000, 4500, 'Occupied', 'Glass-walled private suite with executive desks and dedicated AC', '100 Mbps Fiber, UPS/Generator, Biometric Access, Tea/Coffee'],
          ['WS-0002', 'PO-102', '1st Floor', 'Private Office', 'Team Studio 102 (10-Person)', 10, 140000, 7000, 'Occupied', 'Corner private office for software and design teams', '100 Mbps Fiber, Whiteboard Wall, Dedicated Server Rack, AC'],
          ['WS-0003', 'PO-103', '1st Floor', 'Private Office', 'Private Pod 103 (4-Person)', 4, 60000, 3500, 'Available', 'Quiet 4-seater private office ready for immediate move-in', 'Fiber Internet, Backup Power, Lockable Cabinets'],
          ['WS-0004', 'DD-201', '2nd Floor', 'Dedicated Desk', 'Dedicated Desk Bay A-12', 1, 18000, 1200, 'Occupied', 'Ergonomic dedicated desk with personal locker', 'High-Speed Wi-Fi, Personal Locker, 10 hrs Meeting Room'],
          ['WS-0005', 'DD-202', '2nd Floor', 'Dedicated Desk', 'Dedicated Desk Bay A-14', 1, 18000, 1200, 'Reserved', 'Dedicated desk reserved for incoming remote engineer', 'High-Speed Wi-Fi, Personal Locker'],
          ['WS-0006', 'MR-301', '3rd Floor', 'Conference Room', 'Margalla Boardroom (14-Seat)', 14, 45000, 8000, 'Available', '4K LED conferencing setup, acoustic paneling, catering service', '4K Display, Polycom Audio, Glass Board, Refreshments'],
          ['WS-0007', 'HD-205', '2nd Floor', 'Hot Desk', 'Open Coworking Lounge Desk #5', 1, 14000, 1000, 'Maintenance', 'Flexible coworking desk in main collaborative zone', 'Wi-Fi, Power Socket, Unlimited Tea'],
        ];

        for (const w of sampleWorkspaces) {
          executeSql(
            `INSERT INTO workspaces (workspace_code, workspace_number, floor, type, name, capacity, monthly_price, daily_price, status, description, amenities, notes, created_by, updated_by, created_at, updated_at, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Standard SLA', ?, ?, ?, ?, 0)`,
            [w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7], w[8], w[9], w[10], req.user!.username, req.user!.username, isoNow, isoNow]
          );
        }

        // 2. Create Clients
        const sampleClients = [
          ['CL-0001', 'Kamran Siddiqui', 'NexaCloud Technologies Pvt. Ltd.', '+92 300 4128890', '+92 300 4128890', 'kamran@nexacloud.pk', '35202-4891234-1', 'House 18, Block H, DHA Phase 5', 'Lahore', 'Kamran Siddiqui (CEO)', 'Software & Cloud Engineering', 'Active', 1],
          ['CL-0002', 'Zainab Mansoor', 'Finbridge Advisory Partners', '+92 321 9845112', '+92 321 9845112', 'zainab@finbridge.com.pk', '35201-8834120-4', '74-B, Model Town', 'Lahore', 'Zainab Mansoor (Managing Partner)', 'Financial Consultancy', 'Active', 2],
          ['CL-0003', 'Usman Farooq', 'PixelCraft Digital Studio', '+92 333 4509811', '+92 333 4509811', 'usman@pixelcraft.io', '35202-1928374-9', 'Johar Town Block G-1', 'Lahore', 'Usman Farooq', 'UI/UX & Brand Agency', 'Active', 4],
        ];

        for (const c of sampleClients) {
          executeSql(
            `INSERT INTO clients (client_code, client_name, company_name, phone, whatsapp, email, cnic, address, city, contact_person, business_type, notes, status, workspace_id, created_by, updated_by, created_at, updated_at, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Corporate verified client', ?, ?, ?, ?, ?, ?, 0)`,
            [c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12], req.user!.username, req.user!.username, isoNow, isoNow]
          );
        }

        // 3. Create Contracts
        const startOfYear = `${now.getFullYear()}-01-01`;
        const endOfYear = `${now.getFullYear()}-12-31`;
        const soonDate = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

        executeSql(
          `INSERT INTO contracts (contract_number, client_id, workspace_id, start_date, end_date, monthly_rent, security_deposit, payment_due_day, contract_terms, additional_charges, notes, status, created_by, updated_by, created_at, updated_at, is_deleted)
           VALUES (?, 1, 1, ?, ?, 85000, 170000, 5, '12-month corporate lease with 24/7 access and 15 hours boardroom credit/month.', 0, '', 'Active', ?, ?, ?, ?, 0)`,
          [`CNT-${now.getFullYear()}-0001`, startOfYear, endOfYear, req.user!.username, req.user!.username, isoNow, isoNow]
        );
        executeSql(
          `INSERT INTO contracts (contract_number, client_id, workspace_id, start_date, end_date, monthly_rent, security_deposit, payment_due_day, contract_terms, additional_charges, notes, status, created_by, updated_by, created_at, updated_at, is_deleted)
           VALUES (?, 2, 2, ?, ?, 140000, 280000, 5, '10-person team suite lease including dedicated fiber VLAN.', 5000, '', 'Expiring Soon', ?, ?, ?, ?, 0)`,
          [`CNT-${now.getFullYear()}-0002`, startOfYear, soonDate, req.user!.username, req.user!.username, isoNow, isoNow]
        );
        executeSql(
          `INSERT INTO contracts (contract_number, client_id, workspace_id, start_date, end_date, monthly_rent, security_deposit, payment_due_day, contract_terms, additional_charges, notes, status, created_by, updated_by, created_at, updated_at, is_deleted)
           VALUES (?, 3, 4, ?, ?, 18000, 18000, 5, 'Monthly rolling dedicated desk membership.', 0, '', 'Active', ?, ?, ?, ?, 0)`,
          [`CNT-${now.getFullYear()}-0003`, startOfYear, endOfYear, req.user!.username, req.user!.username, isoNow, isoNow]
        );

        // 4. Create Invoices (Paid, Partially Paid, Unpaid/Overdue)
        const invDate = `${ym}-01`;
        const dueDateFuture = `${ym}-28`;
        const dueDatePast = `${ym}-05`;

        // Invoice 1: NexaCloud (Rs. 90,000 — Paid)
        executeSql(
          `INSERT INTO invoices (
            invoice_number, invoice_date, due_date, client_id, client_name_snapshot, client_company_snapshot,
            client_phone_snapshot, client_email_snapshot, client_address_snapshot, workspace_id, workspace_snapshot,
            contract_id, billing_period, custom_paragraph, subtotal, discount, additional_charges, total,
            paid_amount, remaining_amount, status, notes, terms, created_by, updated_by, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, 1, 'Kamran Siddiqui', 'NexaCloud Technologies Pvt. Ltd.', '+92 300 4128890', 'kamran@nexacloud.pk', 'House 18, Block H, DHA Phase 5, Lahore', 1, 'PO-101 — Executive Suite 101 (6-Person) (Private Office, 1st Floor)', 1, ?, ?, 90000, 0, 0, 90000, 90000, 0, 'Paid', 'Paid via Meezan Bank Corporate Transfer.', 'All monthly rental invoices are payable on or before the 5th of each billing month.', ?, ?, ?, ?, 0)`,
          [
            'INV-000001',
            invDate,
            dueDateFuture,
            monthLabel,
            `Monthly coworking office rental charges for the month of ${monthLabel}, including Executive Suite PO-101, dedicated high-speed internet, backup power, and agreed facilities.`,
            req.user!.username,
            req.user!.username,
            isoNow,
            isoNow,
          ]
        );
        executeSql(`INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, amount, sort_order) VALUES (1, 'Monthly Office Rental — Executive Suite PO-101 (6 Seats)', 'Monthly Office Rental', 1, 85000, 85000, 0)`);
        executeSql(`INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, amount, sort_order) VALUES (1, 'Dedicated Static IP & Firewall Service', 'Internet Charges', 1, 5000, 5000, 1)`);

        // Invoice 2: Finbridge Advisory (Rs. 145,000 — Partially Paid: Paid 100,000, Remaining 45,000)
        executeSql(
          `INSERT INTO invoices (
            invoice_number, invoice_date, due_date, client_id, client_name_snapshot, client_company_snapshot,
            client_phone_snapshot, client_email_snapshot, client_address_snapshot, workspace_id, workspace_snapshot,
            contract_id, billing_period, custom_paragraph, subtotal, discount, additional_charges, total,
            paid_amount, remaining_amount, status, notes, terms, created_by, updated_by, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, 2, 'Zainab Mansoor', 'Finbridge Advisory Partners', '+92 321 9845112', 'zainab@finbridge.com.pk', '74-B, Model Town, Lahore', 2, 'PO-102 — Team Studio 102 (10-Person) (Private Office, 1st Floor)', 2, ?, ?, 150000, 5000, 0, 145000, 100000, 45000, 'Partially Paid', 'First installment received; balance promised by 28th.', 'All monthly rental invoices are payable on or before the 5th of each billing month.', ?, ?, ?, ?, 0)`,
          [
            'INV-000002',
            invDate,
            dueDateFuture,
            monthLabel,
            `Monthly coworking office rental charges for the month of ${monthLabel}, including Team Studio PO-102, internet, boardroom hours, and agreed facilities.`,
            req.user!.username,
            req.user!.username,
            isoNow,
            isoNow,
          ]
        );
        executeSql(`INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, amount, sort_order) VALUES (2, 'Monthly Office Rental — Team Studio PO-102 (10 Seats)', 'Monthly Office Rental', 1, 140000, 140000, 0)`);
        executeSql(`INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, amount, sort_order) VALUES (2, 'Extra Boardroom Hours & Color Printing Package', 'Meeting Room', 1, 10000, 10000, 1)`);

        // Invoice 3: PixelCraft (Rs. 18,000 — Overdue)
        executeSql(
          `INSERT INTO invoices (
            invoice_number, invoice_date, due_date, client_id, client_name_snapshot, client_company_snapshot,
            client_phone_snapshot, client_email_snapshot, client_address_snapshot, workspace_id, workspace_snapshot,
            contract_id, billing_period, custom_paragraph, subtotal, discount, additional_charges, total,
            paid_amount, remaining_amount, status, notes, terms, created_by, updated_by, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, 3, 'Usman Farooq', 'PixelCraft Digital Studio', '+92 333 4509811', 'usman@pixelcraft.io', 'Johar Town Block G-1, Lahore', 4, 'DD-201 — Dedicated Desk Bay A-12 (Dedicated Desk, 2nd Floor)', 3, ?, ?, 18000, 0, 0, 18000, 0, 18000, 'Overdue', 'Follow up via WhatsApp.', 'All monthly rental invoices are payable on or before the 5th of each billing month.', ?, ?, ?, ?, 0)`,
          [
            'INV-000003',
            invDate,
            dueDatePast,
            monthLabel,
            `Monthly dedicated desk rental charges for the month of ${monthLabel}, including ergonomic workstation, high-speed fiber internet, and backup power.`,
            req.user!.username,
            req.user!.username,
            isoNow,
            isoNow,
          ]
        );
        executeSql(`INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, amount, sort_order) VALUES (3, 'Dedicated Desk Rental — Bay A-12', 'Monthly Office Rental', 1, 18000, 18000, 0)`);

        executeSql('UPDATE company_settings SET next_invoice_number = 4, next_receipt_number = 3 WHERE id = 1');

        // 5. Create Payments
        executeSql(
          `INSERT INTO payments (payment_code, receipt_number, client_id, invoice_id, payment_date, amount, payment_method, reference_number, notes, received_by, created_by, updated_by, created_at, updated_at, is_deleted)
           VALUES ('PAY-00001', 'RCP-000001', 1, 1, ?, 90000, 'Bank Transfer', 'MEZN-TXN-8849201', 'Full settlement for INV-000001', ?, ?, ?, ?, ?, 0)`,
          [`${ym}-04`, req.user!.full_name, req.user!.username, req.user!.username, isoNow, isoNow]
        );
        executeSql(
          `INSERT INTO payments (payment_code, receipt_number, client_id, invoice_id, payment_date, amount, payment_method, reference_number, notes, received_by, created_by, updated_by, created_at, updated_at, is_deleted)
           VALUES ('PAY-00002', 'RCP-000002', 2, 2, ?, 100000, 'Online Payment', 'RAAST-99201844', 'First partial payment for INV-000002', ?, ?, ?, ?, ?, 0)`,
          [`${ym}-06`, req.user!.full_name, req.user!.username, req.user!.username, isoNow, isoNow]
        );

        // 6. Create Expenses
        const sampleExpenses = [
          ['EXP-00001', `${ym}-03`, 'Electricity', 'LESCO Commercial Bill & Generator Diesel Fuel', 'LESCO / Shell Gulberg', 48500, 'Bank Transfer', 'LESCO-SEP-8821'],
          ['EXP-00002', `${ym}-05`, 'Internet', 'Nayatel + StormFiber Dual Redundant 200 Mbps Corporate Fiber', 'Nayatel Pvt Ltd', 18500, 'Online Payment', 'NYT-449120'],
          ['EXP-00003', `${ym}-08`, 'Cleaning', 'Janitorial Supplies, Washroom Hygiene & Housekeeping Consumables', 'Metro Cash & Carry', 9500, 'Cash', 'MTR-1102'],
          ['EXP-00004', `${ym}-10`, 'Maintenance', 'HVAC Split AC Servicing & UPS Battery Terminal Replacement', 'CoolTech Services Lahore', 14000, 'Cash', 'CT-778'],
        ];
        for (const e of sampleExpenses) {
          executeSql(
            `INSERT INTO expenses (expense_code, expense_date, category, description, vendor, amount, payment_method, reference_number, notes, created_by, updated_by, created_at, updated_at, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Verified operational voucher', ?, ?, ?, ?, 0)`,
            [e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], req.user!.username, req.user!.username, isoNow, isoNow]
          );
        }

        recalculateAllStatuses();
        logActivity(req.user!.id, req.user!.username, 'Sample Data Loaded', 'System', 1, 'Coworking Dataset', 'Populated initial workspaces, clients, contracts, invoices, payments, and expenses');
      });

      res.json({ message: 'Sample coworking dataset loaded into SQLite successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
