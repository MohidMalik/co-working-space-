import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { queryOne } from '../db';
import { AuthRequest, requireAuth } from './authAndUsers';

const SOFTWARE_MANUAL_PROMPT = `
You are the built-in AI Software Guide & Assistant for "DaftarPro Coworking Management System" (an offline-first Coworking Space, Office Rental, Contract, A4 Invoicing, and Financial Management ERP).
Your job is to clearly, warmly, and accurately teach the user how to use every feature of this software in English or Roman Urdu / Urdu (matching the language the user asks in).

Here is the exact step-by-step guide to every feature in DaftarPro:

1. CLIENTS & CLIENT 360 PROFILE (Tab: 'clients'):
   - Add a New Client: Go to "Clients" -> click "+ Add New Client". Fill in Client Name, Company Name, Phone, WhatsApp, CNIC #, Assigned Workspace, and upload:
     * Client Picture (Profile Photo)
     * CNIC Front Picture
     * CNIC Back Picture
   - View Client Detail (Client 360 Profile): Click the "Profile" button on any client row in the Clients table.
   - Inside Client Detail:
     * You can upload, replace, preview in full-screen lightbox, or remove the Client Picture, CNIC Front Side, and CNIC Back Side directly inside the "Client Picture & CNIC (Front / Back) Verification" card.
     * You can also upload extra files in "Additional Document Attachments".
     * To print the complete client record, click the emerald "Print Complete Profile" button at the top right of the Client Detail view. It generates a full A4 Client Profile Dossier containing the Client Picture, CNIC Front & Back images, Financial Ledger Summary, Contracts (with chairs/tables/AC), Invoices, and Payments!

2. WORKSPACES & OFFICES (Tab: 'workspaces'):
   - Go to "Workspaces & Offices" -> click "+ Add Workspace".
   - Enter Workspace Number (e.g. PO-101, DD-204), Type (Private Office, Dedicated Desk, Hot Desk, Meeting Room, Conference Room, Virtual Office), Name, Floor, Capacity (Seats), Monthly Price, Status (Available, Occupied, Reserved, Maintenance), and Amenities.
   - Switch between Grid Cards and Table View anytime.

3. CONTRACTS & FACILITY ALLOCATIONS (Tab: 'contracts'):
   - Go to "Contracts" -> click "New Contract" (or click Edit on an existing contract).
   - Select the Client and Workspace, Start Date, End Date, Monthly Rent, Security Deposit, and Payment Due Day.
   - In the "Allocated Inventory, Furniture, AC & Custom Client Requirements" section:
     * Enter exact quantities for: Chairs Needed, Tables / Desks, AC Units, and Lockers / Cabinets.
     * In the "Additional Items & Custom Client Requirements" text box, you can type ANYTHING the client requires (or click quick-add chips like '+ Executive Ergonomic Chairs', '+ Split AC Unit (1.5 Ton)', '+ Dedicated Wi-Fi Router / VLAN', '+ Whiteboards & Marker Set', '+ Biometric Access Cards', etc.).
   - Click the Printer icon ("Print Contract") in the Contracts table to print an official A4 Rental Agreement showing all allocated chairs, tables, AC units, lockers, custom requirements, and signature blocks.
   - Click the Renew icon to extend an expiring contract with 1 click.

4. INVOICES & A4 BILLING (Tab: 'invoices'):
   - Go to "Invoices" -> click "Create Invoice".
   - Select the Client (their active workspace and monthly rent auto-fill!).
   - Customize the "Custom Invoice Description Paragraph" (printed on the A4 invoice).
   - Add or edit multiple Line Items (Monthly Office Rental, Electricity/Utility Share, Security Deposit, Meeting Room, etc.), Discount, and Additional Charges.
   - Click the Printer icon on any invoice row to open the A4 Print Preview where you can Print or Save as PDF.
   - Click the "$" (DollarSign) icon on any unpaid invoice row to quickly record a payment and attach a transaction screenshot.

5. PAYMENTS & RECEIPTS WITH TRANSACTION SCREENSHOT (Tab: 'payments'):
   - Go to "Payments & Receipts" -> click "Record Payment".
   - Select the Unpaid/Partially Paid Invoice, enter Payment Date, Amount Received, Payment Method (Bank Transfer, Cash, Online Payment, Card), and Reference / TXN #.
   - Under "Transaction Screenshot / Payment Proof", click "Upload Screenshot" to attach the bank transfer / Raast / JazzCash / EasyPaisa / deposit slip screenshot.
   - In the Payments table, click the "Proof" badge in the Screenshot column to view the full-screen transaction screenshot, or click the Printer icon to print an official A4 Payment Receipt with the transaction screenshot embedded!

6. MONTHLY EXPENSES (Tab: 'expenses'):
   - Go to "Monthly Expenses" -> click "Add Expense" to record operational costs (Electricity, Internet, Office Rent, Salaries, Cleaning, Maintenance, Generator Fuel, etc.).
   - Filter by month and click "Print A4 Expense Sheet" or "Export Excel".

7. BUSINESS REPORTS (Tab: 'reports'):
   - Go to "Business Reports", select any Month & Year, and review Total Billed, Total Collected, Outstanding Receivables, Total Expenses, and Net Profit/Loss.
   - Click "Print A4 Executive Report" or export tables to Excel.

8. EMPLOYEES, USERS & PERMISSIONS (Tab: 'users'):
   - Go to "Employees & Users" to create staff accounts, assign roles (Admin, Manager, Accountant, Receptionist), or customize granular module permissions per employee.

9. COMPANY SETTINGS, WEBSITE NAME & DATABASE BACKUPS (Tab: 'settings' / 'backups'):
   - Go to "Company Settings" (under Administration in the left sidebar) -> make sure you are on the "Company Profile & Invoice Defaults" tab.
   - Edit "Website / Company Name (Software Title) *" to change the website/software title shown in the top-left sidebar, login page, browser tab title, and all printed A4 documents.
   - Edit "Website Domain / URL (Optional)" (e.g. www.yourcoworking.com) to print your website URL on all A4 Invoices, Receipts, Contracts, and Client Profiles.
   - Upload your Company Logo, set Phone, Address, Bank Account details (Bank Name, Account Title, Account #, IBAN), and Invoice/Receipt numbering prefixes, then click "Save Company Settings".
   - Go to "Backups & Restore" to create a 1-click SQLite backup, download the .sqlite file, or restore a previous backup safely.

10. TRASH & ACTIVITY AUDIT LOG (Tab: 'trash' / 'logs'):
    - Deleted clients, workspaces, contracts, invoices, payments, expenses, or users go to "Trash / Recovery" first so you can restore them with 1 click.
    - Every action is recorded in the immutable "Activity Audit Log".

Formatting rules for your response:
- Keep answers clear, friendly, and structured with numbered steps or bullet points.
- Highlight exact button names in **bold** so the user can find them immediately.
`;

function detectSuggestedModule(question: string): { key: string; label: string } | null {
  const q = question.toLowerCase();
  if (q.includes('cnic') || q.includes('client') || q.includes('profile') || q.includes('pic') || q.includes('photo')) {
    return { key: 'clients', label: 'Open Clients & Client 360 Profile' };
  }
  if (q.includes('chair') || q.includes('table') || q.includes('ac ') || q.includes('contract') || q.includes('agreement') || q.includes('lease') || q.includes('locker')) {
    return { key: 'contracts', label: 'Open Contracts Module' };
  }
  if (q.includes('screenshot') || q.includes('receipt') || q.includes('payment') || q.includes('paid') || q.includes('proof')) {
    return { key: 'payments', label: 'Open Payments & Receipts' };
  }
  if (q.includes('invoice') || q.includes('bill')) {
    return { key: 'invoices', label: 'Open Invoices Module' };
  }
  if (q.includes('workspace') || q.includes('office') || q.includes('desk') || q.includes('room') || q.includes('seat')) {
    return { key: 'workspaces', label: 'Open Workspaces & Offices' };
  }
  if (q.includes('expense') || q.includes('cost') || q.includes('electricity')) {
    return { key: 'expenses', label: 'Open Monthly Expenses' };
  }
  if (q.includes('report') || q.includes('profit') || q.includes('income')) {
    return { key: 'reports', label: 'Open Business Reports' };
  }
  if (q.includes('backup') || q.includes('restore')) {
    return { key: 'backups', label: 'Open Backups & Restore' };
  }
  if (q.includes('logo') || q.includes('bank') || q.includes('setting') || q.includes('password') || q.includes('website') || q.includes('company name') || q.includes('name')) {
    return { key: 'settings', label: 'Open Company Settings' };
  }
  if (q.includes('user') || q.includes('employee') || q.includes('role') || q.includes('permission') || q.includes('staff')) {
    return { key: 'users', label: 'Open Employees & Roles' };
  }
  if (q.includes('trash') || q.includes('delete') || q.includes('recover')) {
    return { key: 'trash', label: 'Open Trash / Recovery' };
  }
  return null;
}

function buildSmartFallbackAnswer(question: string, liveStats: any): string {
  const q = question.toLowerCase();

  if (q.includes('cnic') || q.includes('client') || q.includes('profile') || q.includes('pic') || q.includes('photo')) {
    return `### How to Add Client Picture, CNIC Front/Back & Print Complete Client Profile

1. **Open the Clients Module**: Click **Clients** in the left sidebar.
2. **When Adding or Editing a Client**:
   - Click **+ Add New Client** (or the **Edit** icon on an existing client).
   - Scroll to the **Client Picture & CNIC Front / Back Photos** section.
   - Click **Upload Photo** for the **Client Picture**, **Upload Front** for the **CNIC Front Picture**, and **Upload Back** for the **CNIC Back Picture**, then click **Save Client**.
3. **Inside Client Detail (Client 360 View)**:
   - Click the **Profile** button on any row in the Clients list.
   - In the **Client Picture & CNIC (Front / Back) Verification** card, you can upload, replace, remove, or click any image to view it in full-screen zoom.
4. **Print Complete Client Profile (A4)**:
   - Inside the Client Detail screen, click the green **Print Complete Profile** button at the top-right.
   - This opens the A4 Print Preview with the **Client Photo**, **CNIC Front & Back pictures**, **Financial Summary**, **Contracts (with Chairs/Tables/AC)**, **Invoices**, and **Payment History**. Click **Print** or **Save PDF**!`;
  }

  if (q.includes('chair') || q.includes('table') || q.includes('ac') || q.includes('contract') || q.includes('locker') || q.includes('requirement')) {
    return `### How to Add Chairs, Tables, AC Units & Custom Items in a Contract

1. **Open Contracts**: Click **Contracts** in the left sidebar.
2. **Create or Edit a Contract**: Click **New Contract** (or click the **Edit** pencil icon on an existing contract).
3. **Set Furniture & AC Quantities**:
   - In the **Allocated Inventory, Furniture, AC & Custom Client Requirements** box, enter the numbers for:
     - **Chairs Needed** (e.g. \`6\`)
     - **Tables / Desks** (e.g. \`2\`)
     - **AC Units** (e.g. \`1\`)
     - **Lockers / Cabinets** (e.g. \`4\`)
4. **Add Any Custom Requirements in Text**:
   - Click any of the quick-add chips (such as **+ Executive Ergonomic Chairs**, **+ Split AC Unit (1.5 Ton)**, **+ Dedicated Wi-Fi Router / VLAN**) or type anything the client needs into the **Additional Items & Custom Client Requirements** text box.
5. **Print Official A4 Contract**:
   - After saving, click the **Printer** icon in the Contracts table to print the full A4 Rental Agreement including all chairs, tables, AC units, and custom requirements.`;
  }

  if (q.includes('screenshot') || q.includes('payment') || q.includes('receipt') || q.includes('proof')) {
    return `### How to Add a Transaction Screenshot in Payments & Receipts

1. **Open Payments & Receipts**: Click **Payments & Receipts** in the left sidebar (or click the **$** button directly on an unpaid invoice in the **Invoices** tab).
2. **Record or Edit a Payment**:
   - Click **Record Payment** (or the **Edit** icon on an existing payment).
   - Select the Invoice, enter the **Amount Received**, **Payment Method** (Bank Transfer, Online Payment, Cash, Card), and **Reference / TXN #**.
3. **Attach Transaction Screenshot**:
   - In the **Transaction Screenshot / Payment Proof** section, click **Upload Screenshot** and choose the image of the bank transfer, Raast, JazzCash, EasyPaisa, or deposit slip.
   - Click **Confirm & Save Payment**.
4. **View & Print Receipt with Screenshot**:
   - Click the **Proof** button in the Payments table to view the screenshot in full screen.
   - Click the **Printer** icon on the payment row to print an **A4 Payment Receipt** that automatically includes the attached Transaction Screenshot!`;
  }

  if (q.includes('invoice') || q.includes('bill')) {
    return `### How to Create & Print A4 Invoices

1. **Open Invoices**: Click **Invoices** in the left sidebar and click **Create Invoice**.
2. **Select Client & Workspace**: Choose the client — their assigned workspace and monthly rent will populate automatically.
3. **Customize Description & Line Items**:
   - Edit the **Custom Invoice Description Paragraph** if you want custom wording on the A4 printout.
   - Add one or more **Invoice Line Items** (Monthly Office Rental, Electricity Share, Security Deposit, etc.), plus any **Discount** or **Additional Charges**.
4. **Print or Record Payment**:
   - Click the **Printer** icon on any invoice row to preview, print, or save as an A4 PDF.
   - Click the **$** icon on any unpaid invoice row to record a payment and attach a transaction screenshot.`;
  }

  return `### Welcome to DaftarPro Coworking Management System!

Here is a quick guide on how to use the software step by step (Current Workspace: **${liveStats.totalWorkspaces} Workspaces**, **${liveStats.totalClients} Clients**, **${liveStats.unpaidInvoices} Pending Invoices**):

1. **Step 1 — Add Workspaces & Offices**: Go to **Workspaces & Offices** -> click **+ Add Workspace** to register your private offices, dedicated desks, hot desks, and boardrooms.
2. **Step 2 — Register Clients & Upload Photo / CNIC**: Go to **Clients** -> click **+ Add New Client**. Upload the **Client Picture**, **CNIC Front**, and **CNIC Back**. Open any client's **Profile** and click **Print Complete Profile** for a full A4 dossier.
3. **Step 3 — Create Contracts (with Chairs, Tables, AC & Custom Text)**: Go to **Contracts** -> click **New Contract**. Specify monthly rent, **Chairs**, **Tables**, **AC Units**, **Lockers**, and type any custom requirements in the text box. Click the **Printer** icon to print the A4 contract.
4. **Step 4 — Generate A4 Invoices**: Go to **Invoices** -> click **Create Invoice** to bill clients with custom paragraphs and multi-line items.
5. **Step 5 — Record Payments & Transaction Screenshots**: Go to **Payments & Receipts** -> click **Record Payment**, attach the **Transaction Screenshot**, and print the A4 Payment Receipt.
6. **Step 6 — Track Expenses, Reports & Backups**: Log bills in **Monthly Expenses**, view P&L in **Business Reports**, and create 1-click backups in **Backups & Restore**.`;
}

export function registerAiGuideRoutes(router: express.Router) {
  router.post('/ai-assistant/ask', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { question, history } = req.body || {};
      if (!question || !String(question).trim()) {
        return res.status(400).json({ error: 'Please enter a question.' });
      }

      const totalClients = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM clients WHERE is_deleted = 0')?.cnt || 0;
      const totalWorkspaces = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM workspaces WHERE is_deleted = 0')?.cnt || 0;
      const occupiedWorkspaces = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM workspaces WHERE is_deleted = 0 AND status = 'Occupied'")?.cnt || 0;
      const activeContracts = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM contracts WHERE is_deleted = 0 AND status IN ('Active', 'Expiring Soon')")?.cnt || 0;
      const unpaidInvoices = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM invoices WHERE is_deleted = 0 AND status IN ('Unpaid', 'Partially Paid', 'Overdue')")?.cnt || 0;
      const company = queryOne<{ company_name: string }>('SELECT company_name FROM company_settings WHERE id = 1');

      const liveStats = {
        companyName: company?.company_name || 'DaftarPro Coworking',
        totalClients,
        totalWorkspaces,
        occupiedWorkspaces,
        activeContracts,
        unpaidInvoices,
      };

      const suggestedModule = detectSuggestedModule(String(question));
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.json({
          answer: buildSmartFallbackAnswer(String(question), liveStats),
          suggestedModule,
        });
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const recentHistoryText = Array.isArray(history)
          ? history
              .slice(-6)
              .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
              .join('\n')
          : '';

        const prompt = `${SOFTWARE_MANUAL_PROMPT}

Live Workspace Database Status for "${liveStats.companyName}":
- Total Clients: ${liveStats.totalClients}
- Workspaces: ${liveStats.totalWorkspaces} total (${liveStats.occupiedWorkspaces} occupied)
- Active Contracts: ${liveStats.activeContracts}
- Pending / Unpaid Invoices: ${liveStats.unpaidInvoices}
- Logged-in User: ${req.user?.full_name || 'User'} (${req.user?.role_name || 'Staff'})

${recentHistoryText ? `Recent Conversation:\n${recentHistoryText}\n` : ''}
User Question: ${String(question).trim()}

Provide a helpful, step-by-step response telling the user how to accomplish this in the software.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
        });

        const text = response.text?.trim() || buildSmartFallbackAnswer(String(question), liveStats);
        return res.json({
          answer: text,
          suggestedModule,
        });
      } catch (_aiErr) {
        // Graceful fallback if quota/network error occurs
        return res.json({
          answer: buildSmartFallbackAnswer(String(question), liveStats),
          suggestedModule,
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to process AI guide request' });
    }
  });
}
