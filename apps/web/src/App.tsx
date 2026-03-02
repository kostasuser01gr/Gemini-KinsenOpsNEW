import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquare, Settings, 
  Send, Paperclip, Loader2, 
  Search, Command, PanelLeftClose, PanelRightClose,
  Car, User, History, Zap
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { VaultProvider, useVault, PINScreen } from './components/Vault';
import { initDB, getThreads, getMessagesByThread, saveMessages } from './store';

// --- Premium Components ---

const AgentTab: React.FC<{ icon: any, label: string, active: boolean, onClick: () => void }> = ({ icon: Icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
      active 
        ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30' 
        : 'text-slate-500 hover:text-slate-300'
    }`}
  >
    <Icon className="w-3.5 h-3.5" />
    <span>{label}</span>
  </button>
);

const MainApp: React.FC = () => {
  const { i18n } = useTranslation();
  const { isLocked } = useVault();
  
  // UI State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [activeAgent, setActiveAgent] = useState('assistant');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  
  // Data State
  const [threads, setThreads] = useState<any[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    initDB().then(async () => {
      const stored = await getThreads();
      setThreads(stored);
    });
  }, []);

  useEffect(() => {
    if (activeThread) {
      getMessagesByThread(activeThread).then(msgs => setMessages(msgs));
    }
  }, [activeThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg = { id: crypto.randomUUID(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // AI Simulation
    setTimeout(() => {
      const assistantMsg = { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: `**[${activeAgent.toUpperCase()}]** I've analyzed your request regarding "${input}". How else can I assist with the fleet today?` 
      };
      setMessages(prev => [...prev, assistantMsg]);
      setIsLoading(false);
      if (activeThread) saveMessages([userMsg, assistantMsg]);
    }, 1200);
  }, [input, isLoading, activeAgent, activeThread]);

  if (isLocked) {
    return <PINScreen onUnlock={() => console.log('Unlocked')} />;
  }

  return (
    <div className="size-full flex bg-[#08080f] text-slate-200 overflow-hidden font-['Inter',_sans-serif]">
      {/* Dynamic Background Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-600/[0.05] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-600/[0.05] rounded-full blur-[120px]" />
      </div>

      {/* Sidebar (Premium Refactor) */}
      {!sidebarCollapsed && (
        <aside className="relative z-10 w-72 flex flex-col border-r border-white/[0.04] bg-black/20 backdrop-blur-xl">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-6 h-6 text-primary-500 fill-primary-500/20" />
              <h1 className="text-lg font-black tracking-tighter text-white">RENTAL MASTER</h1>
            </div>
            <button onClick={() => setSidebarCollapsed(true)} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500">
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 mb-6">
            <button 
              onClick={() => setCommandPaletteOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:bg-white/[0.06] transition-all"
            >
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5" />
                <span className="text-xs">Search...</span>
              </div>
              <kbd className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded border border-white/10 opacity-50">⌘K</kbd>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 space-y-1">
            {threads.map(t => (
              <button 
                key={t.id} 
                onClick={() => setActiveThread(t.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all ${
                  activeThread === t.id 
                    ? 'bg-primary-600/10 text-primary-400 border border-primary-500/20' 
                    : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-300'
                }`}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="truncate text-xs font-semibold">{t.title}</span>
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-white/[0.04] space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active</span>
              </div>
              <button onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'el' : 'en')} className="text-[10px] font-black text-primary-500">
                {i18n.language.toUpperCase()}
              </button>
            </div>
            <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white transition-colors rounded-lg text-xs font-medium">
              <Settings className="w-4 h-4" />
              <span>System Settings</span>
            </button>
          </div>
        </aside>
      )}

      {/* Main Content (ChatGPT-style) */}
      <main className="flex-1 relative z-10 flex flex-col min-w-0 bg-transparent">
        <header className="h-14 flex items-center justify-between px-6 border-b border-white/[0.04] bg-black/10 backdrop-blur-md">
          <div className="flex items-center gap-4">
            {sidebarCollapsed && (
              <button onClick={() => setSidebarCollapsed(false)} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500 transition-all">
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <AgentTab icon={Zap} label="Assistant" active={activeAgent === 'assistant'} onClick={() => setActiveAgent('assistant')} />
              <AgentTab icon={Car} label="Fleet Manager" active={activeAgent === 'fleet'} onClick={() => setActiveAgent('fleet')} />
              <AgentTab icon={User} label="Support" active={activeAgent === 'support'} onClick={() => setActiveAgent('support')} />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={() => setRightPanelOpen(!rightPanelOpen)} className={`p-1.5 rounded-lg transition-all ${rightPanelOpen ? 'text-primary-400 bg-primary-500/10' : 'text-slate-500 hover:bg-white/[0.05]'}`}>
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat Scroll Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8 custom-scrollbar">
          <div className="max-w-3xl mx-auto space-y-8">
            {messages.length === 0 ? (
              <div className="text-center py-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                <div className="w-20 h-20 bg-primary-600/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-primary-500/20">
                  <Zap className="w-10 h-10 text-primary-500" />
                </div>
                <h2 className="text-4xl font-black text-white mb-4 tracking-tighter">How can I help you, Admin?</h2>
                <p className="text-slate-500 text-sm mb-12">Select a task or start a new conversation with Rental AI.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                  {['Check luxury fleet status', 'Staff maintenance report', 'Send alert to drivers', 'System health audit'].map(p => (
                    <button key={p} onClick={() => setInput(p)} className="text-left px-5 py-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl text-xs font-bold text-slate-400 hover:border-primary-500/50 hover:bg-primary-500/5 transition-all">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex gap-6 animate-in fade-in duration-500 ${m.role === 'assistant' ? 'flex-row' : 'flex-row-reverse'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    m.role === 'assistant' 
                      ? 'bg-primary-600 border-primary-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]' 
                      : 'bg-white/[0.05] border-white/[0.1] text-slate-400'
                  }`}>
                    {m.role === 'assistant' ? <Zap className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>
                  <div className={`flex flex-col max-w-[80%] ${m.role === 'assistant' ? 'items-start' : 'items-end'}`}>
                    <div className={`px-5 py-4 rounded-2xl text-sm leading-relaxed ${
                      m.role === 'assistant' 
                        ? 'bg-white/[0.03] text-slate-200 border border-white/[0.06] shadow-xl' 
                        : 'bg-primary-600 text-white shadow-[0_10px_20px_rgba(37,99,235,0.2)]'
                    }`}>
                      <ReactMarkdown>
                        {m.content}
                      </ReactMarkdown>
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 mt-2 uppercase tracking-tighter">
                      {m.role === 'assistant' ? 'Rental AI Core' : 'Authorized Personnel'}
                    </span>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-6 animate-pulse">
                <div className="w-9 h-9 rounded-xl bg-white/[0.05]" />
                <div className="space-y-3 flex-1">
                  <div className="h-3 bg-white/[0.05] rounded w-1/4" />
                  <div className="h-12 bg-white/[0.05] rounded-2xl w-full" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Premium Input Composer */}
        <footer className="p-6">
          <div className="max-w-3xl mx-auto">
            <div className="relative group p-[1px] rounded-[22px] bg-gradient-to-b from-white/10 to-transparent focus-within:from-primary-500/50 transition-all">
              <div className="bg-[#0c0c14] rounded-[21px] flex flex-col gap-2 p-2">
                <textarea 
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Message Rental AI..."
                  className="w-full bg-transparent px-4 py-3 outline-none text-sm text-slate-200 placeholder-slate-600 resize-none"
                />
                <div className="flex items-center justify-between px-2 pb-1">
                  <div className="flex items-center gap-1">
                    <button className="p-2 text-slate-500 hover:text-slate-300 transition-colors">
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-slate-500 hover:text-slate-300 transition-colors">
                      <History className="w-4 h-4" />
                    </button>
                  </div>
                  <button 
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:grayscale text-white text-xs font-black rounded-xl transition-all shadow-lg active:scale-95"
                  >
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{isLoading ? 'ANALYZING' : 'EXECUTE'}</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-6">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">Master Ultra Core v2.1</p>
              <div className="h-1 w-1 rounded-full bg-slate-800" />
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">Hardware Encrypted</p>
            </div>
          </div>
        </footer>
      </main>

      {/* Right Context Panel (Fleet Dashboard Simulation) */}
      {rightPanelOpen && (
        <aside className="w-80 border-l border-white/[0.04] bg-black/20 backdrop-blur-xl p-6 overflow-y-auto">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Fleet Pulse</h3>
          <div className="space-y-4">
            {[
              { label: 'Available', count: 12, color: 'text-green-500', bg: 'bg-green-500/10' },
              { label: 'In Use', count: 45, color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { label: 'Maintenance', count: 3, color: 'text-red-500', bg: 'bg-red-500/10' },
            ].map(s => (
              <div key={s.label} className={`p-4 rounded-2xl ${s.bg} border border-white/[0.02]`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{s.label}</span>
                  <span className={`text-xl font-black ${s.color}`}>{s.count}</span>
                </div>
                <div className="w-full h-1 bg-black/20 rounded-full overflow-hidden">
                  <div className={`h-full ${s.color.replace('text', 'bg')}`} style={{ width: `${(s.count/60)*100}%` }} />
                </div>
              </div>
            ))}
          </div>
          
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mt-10 mb-6">Recent Alerts</h3>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 p-3 rounded-xl hover:bg-white/[0.02] transition-colors group cursor-pointer">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 group-hover:scale-125 transition-transform" />
                <div className="space-y-1">
                  <p className="text-[11px] font-bold text-slate-300">Vehicle #402 requires cleaning</p>
                  <p className="text-[9px] font-medium text-slate-600">Location: Terminal 2 • 14m ago</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Command Palette Overlay */}
      {commandPaletteOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-32 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-[#0c0c14] border border-white/10 rounded-2xl shadow-2xl overflow-hidden scale-in-center">
            <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
              <Command className="w-5 h-5 text-primary-500" />
              <input 
                autoFocus
                placeholder="Search fleet, users, or system tools..."
                className="bg-transparent flex-1 outline-none text-sm text-slate-200"
              />
              <button onClick={() => setCommandPaletteOpen(false)} className="text-[10px] font-bold text-slate-600">ESC</button>
            </div>
            <div className="p-2">
              <div className="px-3 py-2 text-[10px] font-black text-slate-600 uppercase tracking-widest">Quick Actions</div>
              <div className="space-y-1">
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-primary-600/10 text-slate-300 hover:text-primary-400 group transition-all">
                  <div className="flex items-center gap-3">
                    <Car className="w-4 h-4" />
                    <span className="text-xs font-bold">List Luxury Vehicles</span>
                  </div>
                  <span className="text-[10px] opacity-0 group-hover:opacity-100 font-bold tracking-tighter">FLEET</span>
                </button>
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-primary-600/10 text-slate-300 hover:text-primary-400 group transition-all">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4" />
                    <span className="text-xs font-bold">Switch to Night Shift Support</span>
                  </div>
                  <span className="text-[10px] opacity-0 group-hover:opacity-100 font-bold tracking-tighter">AUTH</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <VaultProvider>
      <MainApp />
    </VaultProvider>
  );
};

export default App;
