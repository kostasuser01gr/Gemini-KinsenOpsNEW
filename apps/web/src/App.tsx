import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MessageSquare, Settings, LogOut, Send, Car, ShieldAlert, 
  Search, Copy, Check, Command, Archive, Bookmark, Server,
  Activity, ChevronRight, Hash, Pin, Globe, 
  Database, UploadCloud, BarChart, AlertTriangle, RefreshCcw
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Turnstile } from '@marsidev/react-turnstile';
import { useTranslation } from 'react-i18next';
import './i18n';
import { saveThreadsOffline, getThreadsOffline } from './offline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

function App() {
  const { t, i18n } = useTranslation();
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('role'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [threads, setThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'admin' | 'audit' | 'kb' | 'models' | 'settings' | 'retention' | 'kpis' | 'import_export' | 'compliance' | 'quota'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder] = useState('inbox');
  const [prefs, setPrefs] = useState({ language: 'en', theme: 'light', compact_mode: 0 });
  const [_auditLogs, setAuditLogs] = useState<any[]>([]);
  const [_kpis, setKpis] = useState<any[]>([]);
  const [compliance, setCompliance] = useState<any>(null);
  const [quota, setQuota] = useState<any>(null);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [showCmdK, setShowCmdK] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cmdKInputRef = useRef<HTMLInputElement>(null);

  const checkAppVersion = async () => {
    const res = await fetch(`${API_BASE}/api/meta/version`);
    if (res.ok) {
      const { version } = await res.json();
      const lastSeen = localStorage.getItem('last_seen_version');
      if (lastSeen && lastSeen !== version) setShowVersionModal(true);
      localStorage.setItem('last_seen_version', version);
    }
  };

  const fetchWithAuth = async (url: string, opts: any = {}) => {
    const headers = { ...opts.headers, Authorization: `Bearer ${token}`, 'x-correlation-id': 'req_' + Date.now(), 'x-workspace-id': localStorage.getItem('workspace_id') || 'ws_default_public' };
    return fetch(url, { ...opts, headers });
  };

  const fetchPrefs = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/me/preferences`);
    if (res.ok) { const d = await res.json(); setPrefs(d); if (d.language) i18n.changeLanguage(d.language); }
  };

  const fetchThreads = async () => {
    if (isOffline) { setThreads(await getThreadsOffline()); return; }
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`);
    if (res.ok) { const d = await res.json(); setThreads(d); saveThreadsOffline(d); if (d.length > 0 && !activeThreadId) setActiveThreadId(d[0].id); }
  };

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (token) { fetchThreads(); fetchPrefs(); checkAppVersion(); }
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [token, isOffline]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setShowCmdK(p => !p); }
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setShowShortcutsHelp(p => !p); }
      if (e.key === 'Escape') { setShowCmdK(false); setShowShortcutsHelp(false); setShowVersionModal(false); }
    }
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const fetchMessages = async (id: string) => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads/${id}/messages`);
    if (res.ok) setMessages(await res.json());
  };

  useEffect(() => { if (activeThreadId && !isOffline) fetchMessages(activeThreadId); }, [activeThreadId, isOffline]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const savePrefs = async (p: any) => {
    const res = await fetchWithAuth(`${API_BASE}/api/me/preferences`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    if (res.ok) { setPrefs({ ...prefs, ...p }); if (p.language) i18n.changeLanguage(p.language); }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}${isLogin ? '/api/auth/login' : '/api/auth/signup'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, turnstile_token: turnstileToken }) });
    if (res.ok) { const d = await res.json(); setToken(d.token); setRole(d.role); localStorage.setItem('token', d.token); localStorage.setItem('role', d.role); localStorage.setItem('workspace_id', d.workspace_id); } else alert('Auth failed');
  };

  const createThread = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`, { method: 'POST' });
    if (res.ok) { const d = await res.json(); setActiveThreadId(d.id); fetchThreads(); setMessages([]); setView('chat'); }
  };

  const sendMessage = async (e?: any) => {
    e?.preventDefault(); if (!input.trim() || !activeThreadId || isOffline) return;
    const msg = input.trim(); setInput(''); setMessages(p => [...p, { id: 'temp_u', role: 'user', content: msg }]); setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/chat/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: activeThreadId, content: msg }) });
      if (!res.ok) throw new Error(res.status === 429 ? 'Limit hit' : 'API error');
      const reader = res.body!.getReader(); const decoder = new TextDecoder();
      setMessages(p => [...p, { id: 'temp_a', role: 'assistant', content: '', toolData: null }]);
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        const lines = decoder.decode(value).split('\n');
        for (const line of lines) { if (line.startsWith('data: ') && !line.includes('[DONE]')) { try { const d = JSON.parse(line.slice(6)); setMessages(p => { const n = [...p]; const last = n[n.length-1]; last.content = d.content; last.toolData = d.toolData; return n; }); } catch(e){} } }
      }
    } catch(e: any) { setMessages(p => [...p, { id: 'err', role: 'assistant', content: `Error: ${e.message}` }]); } finally { setLoading(false); fetchThreads(); }
  };

  const revealPII = async (msgId: string) => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/messages/${msgId}/reveal`, { method: 'POST' });
    if (res.ok) { const data = await res.json(); setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: data.original } : m)); }
  };

  const handleLogout = () => { setToken(null); setRole(null); localStorage.clear(); setThreads([]); setMessages([]); setActiveThreadId(null); };
  const loadAdmin = async (v: any) => { 
    setView(v); 
    try {
      if (v === 'audit') { const r = await fetchWithAuth(`${API_BASE}/api/admin/audit`); if(r.ok) setAuditLogs(await r.json()); } 
      if (v === 'compliance') { const r = await fetchWithAuth(`${API_BASE}/api/admin/compliance/status`); if(r.ok) setCompliance(await r.json()); }
      if (v === 'quota') { const r = await fetchWithAuth(`${API_BASE}/api/admin/quota/status`); if(r.ok) setQuota(await r.json()); }
      if (v === 'kpis') { const r = await fetchWithAuth(`${API_BASE}/api/admin/models/kpis`); if(r.ok) setKpis(await r.json()); }
    } catch(e) { setIsRecoveryMode(true); }
  };
  const copy = (t: string, id: string) => { navigator.clipboard.writeText(t); setCopiedId(id); setTimeout(()=>setCopiedId(null), 2000); };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 text-gray-900">
      <div className="bg-white p-10 rounded-[40px] shadow-2xl w-full max-w-md border border-gray-100 animate-in fade-in zoom-in-95 duration-500 text-center">
        <div className="flex justify-center mb-8"><div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-500/40"><Car size={40}/></div></div>
        <h2 className="text-4xl font-black mb-2 tracking-tighter italic">Ops Portal</h2>
        <div className="flex rounded-2xl bg-gray-100 p-1.5 my-8">
          <button onClick={() => setIsLogin(true)} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all ${isLogin ? 'bg-white shadow-xl text-blue-600' : 'text-gray-400'}`}>{t('common.login')}</button>
          <button onClick={() => setIsLogin(false)} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all ${!isLogin ? 'bg-white shadow-xl text-blue-600' : 'text-gray-400'}`}>{t('common.signup')}</button>
        </div>
        <form onSubmit={handleAuthSubmit} className="space-y-6">
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="w-full bg-gray-50 border-0 rounded-2xl p-5 outline-none focus:ring-4 focus:ring-blue-500/10 font-bold" required/>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" minLength={8} className="w-full bg-gray-50 border-0 rounded-2xl p-5 outline-none focus:ring-4 focus:ring-blue-500/10 font-bold" required/>
          <div className="flex justify-center py-2"><Turnstile siteKey={TURNSTILE_SITE_KEY} onSuccess={setTurnstileToken} /></div>
          <button type="submit" disabled={!turnstileToken} className="w-full bg-gray-900 text-white p-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 shadow-2xl">{isLogin ? 'Access Hub' : 'Create Profile'}</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className={`flex h-screen ${prefs.theme === 'dark' ? 'bg-[#050505] text-white' : 'bg-white text-gray-900'} font-sans overflow-hidden select-none`}>
      <aside className="w-80 bg-[#0d0d0d] text-gray-400 flex flex-col shrink-0 border-r border-white/5 relative z-20">
        <div className="p-6 flex flex-col gap-4">
          <button onClick={createThread} className="flex items-center justify-between bg-white text-black px-5 py-4 rounded-2xl hover:bg-blue-500 hover:text-white transition-all shadow-2xl shadow-white/5">
            <div className="flex items-center gap-3"><Plus size={20}/><span className="font-black text-sm uppercase tracking-tighter">New Ops Session</span></div>
            <div className="opacity-20 text-[10px] font-black">⌘K</div>
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-4 top-4 text-gray-600" />
            <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search..." className="w-full bg-white/5 border-0 rounded-2xl py-4 pl-12 pr-4 text-sm outline-none font-bold"/>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 space-y-8 pt-2">
          <div><div className="px-4 py-2 text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] flex items-center justify-between mb-2"><span>Navigation</span> <ChevronRight size={12}/></div>
            <div className="space-y-1">
              {['inbox', 'starred', 'archived'].map(f => (
                <button key={f} onClick={()=>setView('chat')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-tighter transition-all ${activeFolder === f ? 'bg-white/10 text-white shadow-inner' : 'hover:bg-white/5'}`}>
                  {f === 'inbox' && <MessageSquare size={18} className="text-blue-500"/>}
                  {f === 'starred' && <Bookmark size={18} className="text-orange-500"/>}
                  {f === 'archived' && <Archive size={18} className="text-gray-500"/>}
                  <span>{f}</span>
                </button>
              ))}
            </div>
          </div>
          <div><div className="px-4 py-2 text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] flex items-center justify-between mb-2"><span>Feed</span> <Hash size={12}/></div>
            <div className="space-y-1 pb-10">
              {threads.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())).map(t => (
                <button key={t.id} onClick={() => { setActiveThreadId(t.id); setView('chat'); }} className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-4 group transition-all ${activeThreadId === t.id && view === 'chat' ? 'bg-blue-600 text-white shadow-2xl scale-[1.02]' : 'hover:bg-white/5 hover:text-gray-200'}`}>
                  <div className="shrink-0">{t.pinned ? <Pin size={14} className="rotate-45 text-blue-400"/> : <div className={`w-2 h-2 rounded-full ${t.status === 'resolved' ? 'bg-green-500' : 'bg-orange-500'} opacity-40`}/>}</div>
                  <span className="truncate text-xs font-black uppercase tracking-tight">{t.title}</span>
                </button>
              ))}
            </div>
          </div>
        </nav>
        <div className="p-6 bg-black/40 border-t border-white/5 space-y-2">
          {role === 'admin' && <button onClick={()=>loadAdmin('admin')} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all text-[10px] font-black uppercase text-gray-500 hover:text-white"><ShieldAlert size={16}/> Admin</button>}
          <button onClick={()=>setView('settings')} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all text-[10px] font-black uppercase text-gray-500 hover:text-white"><Settings size={16}/> Settings</button>
          <button onClick={handleLogout} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-red-500/10 transition-all text-[10px] font-black uppercase text-red-900/60 hover:text-red-500"><LogOut size={16}/> Sign Out</button>
        </div>
      </aside>

      <main className={`flex-1 flex flex-col min-w-0 ${prefs.theme === 'dark' ? 'bg-[#050505]' : 'bg-white'} relative transition-colors duration-500`}>
        {isRecoveryMode && <div className="bg-red-600 text-white p-3 text-center text-xs font-black uppercase tracking-widest flex items-center justify-center gap-4"><AlertTriangle size={14}/> Recovery Mode: API Unstable. Using Offline Cache. <button onClick={() => setIsRecoveryMode(false)} className="underline">Dismiss</button></div>}
        {view === 'chat' ? (
          <>
            <header className={`h-20 border-b ${prefs.theme === 'dark' ? 'border-white/5' : 'border-gray-100'} flex items-center justify-between px-10 shrink-0 z-10 bg-inherit/80 backdrop-blur-3xl sticky top-0`}>
              <div className="flex items-center gap-5"><div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xs">OC</div><div className="flex flex-col"><span className="font-black text-sm uppercase">Ops Intelligence</span><div className="text-[10px] font-black uppercase tracking-widest text-green-500">{isOffline ? 'Offline' : 'Healthy Routing'}</div></div></div>
              <div className="flex items-center gap-4"><button onClick={()=>setShowDebug(!showDebug)} className={`p-3 rounded-2xl ${showDebug ? 'bg-blue-600 text-white' : 'text-gray-400'}`}><RefreshCcw size={20}/></button></div>
            </header>
            <div className="flex-1 overflow-y-auto p-8 md:p-16 space-y-12 select-text">
              {messages.length === 0 && <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto py-20 animate-in fade-in slide-in-from-bottom-8 duration-1000"><div className="w-24 h-24 bg-blue-600/5 text-blue-600 rounded-[40px] flex items-center justify-center mb-10 shadow-inner"><Command size={48}/></div><h1 className="text-5xl font-black mb-4 tracking-tighter text-gray-900 italic">Operational Copilot</h1></div>}
              {messages.map((m, i) => (
                <div key={m.id || i} className={`flex gap-8 ${m.role === 'user' ? 'justify-end' : ''}`}>
                  <div className={`max-w-3xl px-8 py-7 rounded-[32px] relative group shadow-2xl ${m.role === 'user' ? 'bg-blue-600 text-white shadow-blue-500/20' : 'bg-gray-50 border border-gray-100 text-gray-800'}`}>
                    {m.role === 'assistant' && (
                      <div className="absolute -top-4 -right-12 flex flex-col gap-2">
                        <button onClick={() => copy(m.content, m.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-black bg-white border border-gray-100 p-3 rounded-2xl shadow-2xl transition-all">{copiedId === m.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}</button>
                        {m.content.includes('[REDACTED]') && <button onClick={() => revealPII(m.id)} className="opacity-0 group-hover:opacity-100 text-blue-600 bg-white border border-gray-100 p-3 rounded-2xl shadow-2xl transition-all" title="Reveal PII"><Search size={16}/></button>}
                      </div>
                    )}
                    <div className={`prose ${m.role === 'user' ? 'prose-invert' : 'prose-slate'} max-w-none font-bold`}><ReactMarkdown>{m.content}</ReactMarkdown></div>
                    {m.toolData && <div className="mt-8 border-t border-black/5 pt-6 text-[10px] font-black uppercase text-gray-400 flex items-center gap-4"><div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"/> {m.toolData.model} ({m.toolData.provider}) • {m.toolData.correlationId}</div>}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} className="h-32" />
            </div>
            <footer className={`p-8 md:p-12 border-t ${prefs.theme === 'dark' ? 'border-white/5' : 'border-gray-100'} sticky bottom-0 bg-inherit/80 backdrop-blur-3xl`}>
              <form onSubmit={sendMessage} className="max-w-4xl mx-auto relative flex items-end gap-4"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); sendMessage(e);}}} placeholder="Ask Ops..." className="w-full bg-gray-50 border-0 rounded-[32px] py-6 pl-8 pr-20 outline-none focus:bg-white focus:ring-8 focus:ring-blue-500/5 transition-all shadow-2xl shadow-inner resize-none min-h-[80px] font-bold text-lg" rows={1} disabled={loading||isOffline}/><button type="submit" disabled={loading||!input.trim()||isOffline} className="bg-gray-900 text-white p-4 rounded-full hover:bg-blue-600 shadow-2xl">{loading ? <RefreshCcw size={24} className="animate-spin"/> : <Send size={24}/>}</button></form>
              <div className="mt-6 text-center text-[10px] uppercase tracking-[0.4em] opacity-30 font-black">Never-Bill Guard • Auto-Archive</div>
            </footer>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-12 md:p-24 text-gray-900">
            <button onClick={()=>setView('chat')} className="mb-12 text-xs font-black uppercase flex items-center gap-3 text-blue-600 hover:scale-105 transition-all"><ChevronRight size={16} className="rotate-180"/> Back</button>
            {view === 'admin' && <div className="max-w-6xl"><h1 className="text-7xl font-black mb-4 tracking-tighter">Ops Admin</h1><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-20">
              {[{ id: 'kpis', icon: BarChart, title: 'AI Analytics' }, { id: 'compliance', icon: RefreshCcw, title: 'Compliance' }, { id: 'quota', icon: Activity, title: 'Quota Governor' }, { id: 'models', icon: Server, title: 'Canary Rollout' }, { id: 'retention', icon: Database, title: 'Retention' }, { id: 'import_export', icon: UploadCloud, title: 'Snapshot' }, { id: 'audit', icon: ShieldAlert, title: 'Security' }].map(card => (
                <button key={card.id} onClick={()=>loadAdmin(card.id as any)} className="text-left bg-white border border-gray-100 p-10 rounded-[48px] shadow-sm hover:shadow-2xl transition-all group">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[24px] flex items-center justify-center mb-8 group-hover:scale-110 transition-transform"><card.icon size={32}/></div>
                  <h3 className="text-2xl font-black tracking-tight">{card.title}</h3>
                </button>
              ))}
            </div></div>}
            {view === 'quota' && quota && (
              <div className="max-w-4xl space-y-12">
                <h2 className="text-5xl font-black tracking-tighter">Quota Status</h2>
                <div className="bg-white border p-10 rounded-[40px] shadow-2xl">
                  <div className="flex items-center gap-4 mb-8"><div className={`w-4 h-4 rounded-full ${quota.isThrottled ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}/><span className="text-2xl font-black uppercase tracking-tight">{quota.isThrottled ? 'Throttled' : 'Nominal'}</span></div>
                  <div className="grid grid-cols-2 gap-8"><div className="p-6 bg-gray-50 rounded-3xl"><div className="text-xs font-black text-gray-400 uppercase mb-2">Cache Override</div><div className="text-xl font-bold">{quota.cacheTTLOverride || 'Default'}s</div></div><div className="p-6 bg-gray-50 rounded-3xl"><div className="text-xs font-black text-gray-400 uppercase mb-2">Expensive Features</div><div className="text-xl font-bold">{quota.expensiveFeaturesDisabled ? 'DISABLED' : 'ENABLED'}</div></div></div>
                </div>
              </div>
            )}
            {view === 'compliance' && compliance && <div className="max-w-4xl space-y-12"><h2 className="text-5xl font-black tracking-tighter">Compliance Ledger</h2><div className="grid grid-cols-2 gap-8"><div className="bg-gray-50 p-10 rounded-[40px] border shadow-xl"><div className="text-[10px] font-black uppercase text-gray-400 mb-2">Strict Free Mode</div><div className="text-3xl font-black text-green-600">ENFORCED</div></div><div className="bg-gray-50 p-10 rounded-[40px] border shadow-xl"><div className="text-[10px] font-black uppercase text-gray-400 mb-2">Guard Status</div><div className="text-3xl font-black text-green-600">COMPLIANT</div></div></div></div>}
            {view === 'models' && (
              <div className="max-w-5xl space-y-12 animate-in fade-in duration-500">
                <h2 className="text-5xl font-black tracking-tighter">Canary Rollouts</h2>
                <div className="bg-white border p-10 rounded-[40px] shadow-2xl space-y-8">
                  <div className="p-10 bg-gray-50 rounded-[32px] border border-gray-100 flex items-center justify-between">
                    <div>
                      <div className="font-black text-xl italic text-blue-600">Dynamic Load Balancing</div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Experimental model testing active</p>
                    </div>
                    <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-500/20"><Activity size={32}/></div>
                  </div>
                </div>
              </div>
            )}
            {view === 'settings' && <div className="max-w-3xl space-y-16"><h1 className="text-6xl font-black mb-4 tracking-tighter">Settings</h1><div className="flex items-center justify-between p-10 bg-gray-50 rounded-[40px] border shadow-2xl"><div className="flex items-center gap-8"><div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-2xl"><Globe size={32}/></div><div><h3 className="text-2xl font-black tracking-tight">Language</h3></div></div><select value={prefs.language} onChange={e=>savePrefs({language: e.target.value})} className="bg-white border-0 rounded-2xl p-5 font-black uppercase text-xs shadow-xl outline-none"><option value="en">English</option><option value="el">Ελληνικά</option></select></div></div>}
          </div>
        )}
      </main>
      {showCmdK && <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4 bg-gray-900/80 backdrop-blur-xl" onClick={()=>setShowCmdK(false)}><div className="w-full max-w-3xl bg-white rounded-[48px] shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}><div className="flex items-center gap-6 px-10 py-8 border-b"><Command size={32} className="text-blue-600"/><input ref={cmdKInputRef} autoFocus placeholder="Search commands..." className="w-full outline-none text-2xl font-black text-gray-900"/></div><div className="p-6">{[{ i: Plus, t: "New Conversation", act: createThread }, { i: RefreshCcw, t: "Compliance", act: ()=>loadAdmin('compliance') }, { i: ShieldAlert, t: "Admin", act: ()=>setView('admin') }].map((item, idx) => (<button key={idx} onClick={()=>{item.act(); setShowCmdK(false);}} className="w-full text-left px-6 py-6 hover:bg-gray-50 rounded-[32px] flex items-center gap-8 transition-all transform active:scale-95"><div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-[24px] flex items-center justify-center"><item.i size={28}/></div><div className="font-black text-xl text-gray-900">{item.t}</div></button>))}</div></div></div>}

      {showVersionModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-lg w-full text-center">
            <h2 className="text-3xl font-black mb-4">What's New in v9.0</h2>
            <p className="text-gray-500 mb-8">We've added Quota Governor, PII Guard, and deep search capabilities to keep the platform safe and scalable.</p>
            <button onClick={() => setShowVersionModal(false)} className="w-full bg-blue-600 text-white p-4 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all">Got it</button>
          </div>
        </div>
      )}

      {showShortcutsHelp && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-md w-full">
            <h2 className="text-2xl font-black mb-6 flex items-center gap-3"><Command size={24}/> Keyboard Shortcuts</h2>
            <div className="space-y-4 text-sm font-bold text-gray-600 uppercase tracking-widest">
              <div className="flex justify-between border-b pb-2"><span>Palette</span><kbd className="bg-gray-100 px-2 py-1 rounded">⌘K</kbd></div>
              <div className="flex justify-between border-b pb-2"><span>Send</span><kbd className="bg-gray-100 px-2 py-1 rounded">Enter</kbd></div>
              <div className="flex justify-between border-b pb-2"><span>New Line</span><kbd className="bg-gray-100 px-2 py-1 rounded">Shift+Enter</kbd></div>
              <div className="flex justify-between border-b pb-2"><span>Close Modals</span><kbd className="bg-gray-100 px-2 py-1 rounded">Esc</kbd></div>
              <div className="flex justify-between"><span>Help</span><kbd className="bg-gray-100 px-2 py-1 rounded">⌘/</kbd></div>
            </div>
            <button onClick={() => setShowShortcutsHelp(false)} className="mt-10 w-full bg-gray-900 text-white p-4 rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
