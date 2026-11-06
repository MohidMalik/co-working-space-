import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import {
  Bot,
  Send,
  X,
  BookOpen,
  MessageSquare,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  suggestedModule?: { key: string; label: string } | null;
}

const QUICK_QUESTIONS = [
  'How do I add Client Pic, CNIC Front/Back & Print Complete Profile?',
  'How do I add Chairs, Tables, AC & custom items in a Contract?',
  'How do I attach a Transaction Screenshot in Payments & Receipts?',
  'How do I create & print an A4 Invoice?',
  'Step-by-step guide for a new user to set up the software',
  'How do I create or restore a database backup?',
];

const MODULE_GUIDES = [
  {
    key: 'clients',
    title: '1. Clients, CNIC (Front/Back), Client Photo & Complete Profile Print',
    summary: 'Register clients, upload Client Picture + CNIC Front & Back, and print the complete A4 client profile dossier.',
    steps: [
      'Go to "Clients" and click "+ Add New Client" (or click "Edit" on any existing client).',
      'Upload the Client Picture, CNIC Front Picture, and CNIC Back Picture in the upload boxes.',
      'Click "Profile" on any client row to open the Client 360 Detail screen.',
      'Inside Client Detail, you can also upload/replace/preview the Client Picture, CNIC Front, and CNIC Back directly.',
      'Click the green "Print Complete Profile" button at the top-right to print the full A4 Client Dossier with photo, CNIC front/back, contracts, invoices, and payment ledger.',
    ],
  },
  {
    key: 'workspaces',
    title: '2. Workspaces & Offices Management',
    summary: 'Add Private Offices, Dedicated Desks, Hot Desks, and Boardrooms with seat capacity and monthly/daily rent.',
    steps: [
      'Go to "Workspaces & Offices" and click "+ Add Workspace".',
      'Enter Workspace Number (e.g., PO-101, DD-204), Type, Name, Floor, Capacity, and Monthly Rent.',
      'Status automatically updates to "Occupied" when an active client or contract is assigned.',
    ],
  },
  {
    key: 'contracts',
    title: '3. Contracts — Chairs, Tables, AC Units & Custom Requirements',
    summary: 'Create rental agreements with exact Chair/Table/AC/Locker counts and custom text requirements, plus A4 Contract Printing.',
    steps: [
      'Go to "Contracts" and click "New Contract".',
      'Select the Client, Workspace, Start/End Dates, Monthly Rent, and Security Deposit.',
      'In "Allocated Inventory, Furniture, AC & Custom Client Requirements", enter how many Chairs, Tables/Desks, AC Units, and Lockers the client needs.',
      'Use the quick-add chips or type anything the client requires in the "Additional Items & Custom Client Requirements" text box.',
      'Click the Printer icon in the Contracts table to print the complete A4 Rental Agreement.',
    ],
  },
  {
    key: 'invoices',
    title: '4. A4 Invoices & Multi-Line Billing',
    summary: 'Generate professional A4 invoices with custom paragraphs, multiple line items, discounts, and quick payment recording.',
    steps: [
      'Go to "Invoices" and click "Create Invoice".',
      'Select a Client — their active workspace and monthly rent auto-populate.',
      'Edit the Custom Invoice Description Paragraph and add any additional line items (Electricity, Meeting Room, etc.).',
      'Click the Printer icon to preview, print, or save the A4 Invoice as PDF.',
    ],
  },
  {
    key: 'payments',
    title: '5. Payments, Receipts & Transaction Screenshots',
    summary: 'Record client payments against invoices, attach Transaction Screenshots, and print A4 Payment Receipts.',
    steps: [
      'Go to "Payments & Receipts" and click "Record Payment" (or click the "$" icon on an invoice row).',
      'Select the Invoice, enter Amount Received, Payment Method, and Reference / TXN #.',
      'Click "Upload Screenshot" to attach the bank transfer / Raast / JazzCash / EasyPaisa screenshot proof.',
      'Click "Proof" in the table to view the screenshot full-screen, or click the Printer icon to print the A4 Receipt with the screenshot embedded.',
    ],
  },
  {
    key: 'expenses',
    title: '6. Monthly Expenses & A4 Expense Sheets',
    summary: 'Track monthly operational costs (Rent, Electricity, Internet, Salaries, Maintenance) and print A4 Expense Sheets.',
    steps: [
      'Go to "Monthly Expenses" and click "Add Expense".',
      'Filter by month/category and click "Print A4 Expense Sheet" or "Export Excel".',
    ],
  },
  {
    key: 'reports',
    title: '7. Business Reports & P&L Analytics',
    summary: 'Review monthly revenue vs. expenses, net income, occupancy, and print executive A4 reports.',
    steps: [
      'Go to "Business Reports" and select the Month and Year.',
      'Click "Print A4 Executive Report" to print a formal financial summary.',
    ],
  },
  {
    key: 'settings',
    title: '8. Company Settings, Website Name, Logo & Database Backups',
    summary: 'Edit your Website / Company Name, Website Domain URL, Logo, bank account details, invoice prefixes, and 1-click SQLite backups.',
    steps: [
      'Go to "Company Settings" in the left sidebar (under Administration).',
      'In the "Website / Company Name (Software Title) *" field, type your new website/company name — it updates the sidebar, login page, browser tab title, and all A4 printouts.',
      'In the "Website Domain / URL (Optional)" field, enter your website address (e.g., www.yourcoworking.com), upload your Logo, and click "Save Company Settings".',
      'Go to "Backups & Restore" to create, download, or restore SQLite database backups anytime.',
    ],
  },
];

export default function SoftwareGuideAgent({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { setActiveTab, user } = useApp();
  const [mode, setMode] = useState<'chat' | 'manual'>('chat');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Assalam-o-Alaikum ${user?.full_name || ''}! I am your **DaftarPro AI Software Guide**. Ask me anything in **English** or **Roman Urdu** about how to use this software:\n\n• Adding **Client Picture, CNIC Front/Back** & **Printing Complete Client Profile**\n• Adding **Chairs, Tables, AC Units & Custom Requirements** in Contracts\n• Uploading **Transaction Screenshots** in Payments & Receipts\n• Generating & printing **A4 Invoices, Receipts, Contracts & Reports**`,
      suggestedModule: null,
    },
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && mode === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, mode]);

  if (!isOpen) return null;

  const handleAsk = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiRequest<{
        answer: string;
        suggestedModule?: { key: string; label: string } | null;
      }>('/ai-assistant/ask', {
        method: 'POST',
        body: JSON.stringify({
          question: trimmed,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.answer,
          suggestedModule: res.suggestedModule || null,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: `You can use the **Step-by-Step Manual** tab above to browse instructions for every module, or try asking your question again. (${err.message || 'Connection error'})`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleJumpToModule = (moduleKey: string) => {
    setActiveTab(moduleKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex justify-end no-print">
      <div className="bg-white w-full max-w-xl h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500 text-slate-950 flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">DaftarPro AI Software Guide</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  How to Use
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Ask how to use any feature in English or Roman Urdu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setMode('chat')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'chat'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Ask AI Agent (Chat)
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'manual'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Step-by-Step Manual (All Modules)
          </button>
        </div>

        {mode === 'chat' ? (
          <>
            {/* Quick Questions Strip */}
            <div className="px-4 py-2.5 bg-white border-b border-slate-100 shrink-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-teal-600" />
                Quick How-To Topics (Click to Ask):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleAsk(q)}
                    disabled={loading}
                    className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-md text-[11px] font-medium transition-colors text-left cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                      m.role === 'user'
                        ? 'bg-teal-600 text-white'
                        : 'bg-white text-slate-800 border border-slate-200'
                    }`}
                  >
                    <div className="whitespace-pre-line">{m.text}</div>

                    {m.suggestedModule && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500 font-medium">
                          Want to go there right now?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleJumpToModule(m.suggestedModule!.key)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold cursor-pointer"
                        >
                          <span>{m.suggestedModule.label}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-start">
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 flex items-center gap-2 shadow-xs">
                    <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                    Preparing step-by-step instructions...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAsk(input);
              }}
              className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask how to use any feature (English or Roman Urdu)..."
                className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-teal-600 focus:bg-white"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                Ask
              </button>
            </form>
          </>
        ) : (
          /* Step-by-Step Visual Manual */
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3.5 text-xs text-teal-900 flex items-start gap-2.5">
              <HelpCircle className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Complete Software User Manual</div>
                <p className="text-[11px] text-teal-800 mt-0.5">
                  Follow these step-by-step instructions for every module, or click "Open Module" on any card to jump directly there.
                </p>
              </div>
            </div>

            {MODULE_GUIDES.map((g) => (
              <div
                key={g.key}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{g.title}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">{g.summary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleJumpToModule(g.key)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer"
                  >
                    <span>Open Module</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <ol className="space-y-1.5 pt-2 border-t border-slate-100 text-xs text-slate-700">
                  {g.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
