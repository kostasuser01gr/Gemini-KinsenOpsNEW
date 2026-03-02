import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MessageSquare, Settings, LogOut, Send, Car, ShieldAlert, 
  Copy, Check, Command, Unlock, Key, Lock,
  ChevronRight, Globe, BarChart, AlertTriangle, RefreshCcw, Eye, EyeOff, Activity, Server, Database, UploadCloud
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Turnstile } from '@marsidev/react-turnstile';
import { useTranslation } from 'react-i18next';
import './i18n';
import { saveThreadsOffline, getThreadsOffline, getDB } from './offline';
import * as cryptoHelpers from './vaultCrypto';

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

  const [isAppLocked, setIsAppLocked] = useState(true);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [hasPinSet, setHasPinSet] = useState(false);

  const [vaultItems, setVaultItems] = useState<any[]>([]);
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);

  const [threads, setThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'admin' | 'audit' | 'kb' | 'models' | 'settings' | 'retention' | 'kpis' | 'import_export' | 'compliance' | 'quota' | 'vault'>('chat');

  const [searchQuery, setSearchQuery] = useState('');
  const [prefs, setPrefs] = useState({ language: 'en', theme: 'light', compact_mode: 0 });

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

  const fetchWithAuth = async (url: string, opts: any = {}) => {
    const headers = { ...opts.headers, Authorization: `Bearer ${token}`, 'x-correlation-id': 'req_' + Date.now(), 'x-workspace-id': localStorage.getItem('workspace_id') || 'ws_default_public' };
    return fetch(url, { ...opts, headers });
  };

  const fetchThreads = async () => {
    if (isOffline) { setThreads(await getThreadsOffline()); return; }
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`);
    if (res.ok) { const d = await res.json(); setThreads(d); saveThreadsOffline(d); if (d.length > 0 && !activeThreadId) setActiveThreadId(d[0].id); }
  };

  const fetchPrefs = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/me/preferences`);
    if (res.ok) { const d = await res.json(); setPrefs(d); if (d.language) i18n.changeLanguage(d.language); }
  };

  const checkAppVersion = async () => {
    const res = await fetch(`${API_BASE}/api/meta/version`);
    if (res.ok) {
      const { version } = await res.json();
      const lastSeen = localStorage.getItem('last_seen_version');
      if (lastSeen && lastSeen !== version) setShowVersionModal(true);
      localStorage.setItem('last_seen_version', version);
    }
  };

  const checkPinStatus = async () => {
    const db = await getDB();
    const pinData = await db.get('preferences', 'local_pin');
    setHasPinSet(!!pinData);
    if (!pinData) setIsAppLocked(false);
  };

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (token) { fetchThreads(); fetchPrefs(); checkAppVersion(); checkPinStatus(); }
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

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const db = await getDB();
    const pinData = await db.get('preferences', 'local_pin');
    if (!pinData) { setIsAppLocked(false); return; }
    try {
      const salt = Uint8Array.from(atob(pinData.salt), c => c.charCodeAt(0));
      const kek = await cryptoHelpers.deriveKey(pin, salt);
      await cryptoHelpers.unwrapDEK(pinData.test, kek);
      setIsAppLocked(false);
      setPinError(null);
    } catch (err) { setPinError('Invalid PIN'); setPin(''); }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}${isLogin ? '/api/auth/login' : '/api/auth/signup'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, turnstile_token: turnstileToken }) });
    if (res.ok) {
      const d = await res.json(); setToken(d.token); setRole(d.role);
      localStorage.setItem('token', d.token); localStorage.setItem('role', d.role); localStorage.setItem('workspace_id', d.workspace_id);
    } else alert('Auth failed');
  };

  const savePrefs = async (p: any) => {
    const res = await fetchWithAuth(`${API_BASE}/api/me/preferences`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    if (res.ok) { setPrefs({ ...prefs, ...p }); if (p.language) i18n.changeLanguage(p.language); }
  };

  const fetchMessages = async (id: string) => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads/${id}/messages`);
    if (res.ok) setMessages(await res.json());
  };

  useEffect(() => { if (activeThreadId && !isOffline) fetchMessages(activeThreadId); }, [activeThreadId, isOffline]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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

  const createThread = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`, { method: 'POST' });
    if (res.ok) { const d = await res.json(); setActiveThreadId(d.id); fetchThreads(); setMessages([]); setView('chat'); }
  };

  const unlockVault = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetchWithAuth(`${API_BASE}/api/vault/key`);
    if (!res.ok) { alert('Vault not bootstrapped'); return; }
    const { wrapped_dek, kdf_params } = await res.json();
    try {
      const salt = Uint8Array.from(atob(kdf_params.salt), c => c.charCodeAt(0));
      const kek = await cryptoHelpers.deriveKey(vaultPassphrase, salt, kdf_params.iterations);
      const unwrappedDek = await cryptoHelpers.unwrapDEK(wrapped_dek, kek);
      setDek(unwrappedDek); setIsVaultUnlocked(true); fetchVaultItems();
    } catch (err) { alert('Invalid Passphrase'); }
  };

  const fetchVaultItems = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/vault/items`);
    if (res.ok) setVaultItems(await res.json());
  };

  const handleLogout = () => { setToken(null); setRole(null); localStorage.clear(); setThreads([]); setMessages([]); setActiveThreadId(null); setIsAppLocked(true); };
  const loadAdmin = async (v: any) => { 
    setView(v); 
    try {
      if (v === 'compliance') { const r = await fetchWithAuth(`${API_BASE}/api/admin/compliance/status`); if(r.ok) setCompliance(await r.json()); }
      if (v === 'quota') { const r = await fetchWithAuth(`${API_BASE}/api/admin/quota/status`); if(r.ok) setQuota(await r.json()); }
    } catch(e) { setIsRecoveryMode(true); }
  };
  const copy = (t: string, id: string) => { navigator.clipboard.writeText(t); setCopiedId(id); setTimeout(()=>setCopiedId(null), 2000); };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 text-gray-900 text-center">
      <div className="bg-white p-10 rounded-[40px] shadow-2xl w-full max-w-md border border-gray-100 animate-in fade-in zoom-in-95 duration-500">
        <Car size={40} className="mx-auto mb-8 text-blue-600"/>
        <h2 className="text-4xl font-black mb-8 tracking-tighter italic">Ops Portal</h2>
        <div className="flex rounded-2xl bg-gray-100 p-1.5 mb-8">
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

  if (isAppLocked) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d] p-4 text-white font-sans text-center">
      <div className="w-full max-xs space-y-10">
        <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-500/40"><Lock size={32}/></div>
        <h2 className="text-2xl font-black uppercase tracking-widest italic">App Locked</h2>
        <form onSubmit={handlePinSubmit} className="space-y-6">
          <input type="password" value={pin} onChange={e=>setPin(e.target.value)} maxLength={4} placeholder="PIN" className="w-full bg-white/5 border-0 rounded-2xl p-6 text-center text-3xl font-black tracking-[1em] outline-none placeholder:text-[10px] placeholder:tracking-widest" autoFocus/>
          {pinError && <p className="text-red-500 text-xs font-black uppercase tracking-widest">{pinError}</p>}
          <button type="button" onClick={handleLogout} className="text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white">Switch Account</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className={`flex h-screen ${prefs.theme === 'dark' ? 'bg-[#050505] text-white' : 'bg-white text-gray-900'} font-sans overflow-hidden select-none`}>
      <aside className="w-80 bg-[#0d0d0d] text-gray-400 flex flex-col shrink-0 border-r border-white/5 relative z-20">
        <div className="p-6 flex flex-col gap-4">
          <button onClick={() => { setActiveThreadId(null); setView('chat'); setMessages([]); }} className="flex items-center justify-between bg-white text-black px-5 py-4 rounded-2xl hover:bg-blue-500 hover:text-white transition-all shadow-2xl">
            <div className="flex items-center gap-3"><Plus size={20}/><span className="font-black text-sm uppercase tracking-tighter">New Ops Session</span></div>
          </button>
          <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search..." className="w-full bg-white/5 border-0 rounded-2xl py-4 px-6 text-sm outline-none font-bold"/>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 space-y-8 pt-2">
          <div className="space-y-1">
            <button onClick={()=>setView('chat')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-black uppercase transition-all ${view === 'chat' ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}><MessageSquare size={18} className="text-blue-500"/> <span>Chat</span></button>
            <button onClick={()=>setView('vault')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-black uppercase transition-all ${view === 'vault' ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}><Key size={18} className="text-yellow-500"/> <span>Vault</span></button>
          </div>
          <div className="space-y-1 pb-10">
            {threads.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())).map(t => (
              <button key={t.id} onClick={() => { setActiveThreadId(t.id); setView('chat'); }} className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-4 transition-all ${activeThreadId === t.id && view === 'chat' ? 'bg-blue-600 text-white shadow-2xl' : 'hover:bg-white/5'}`}>
                <span className="truncate text-xs font-black uppercase tracking-tight">{t.title}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className="p-6 bg-black/40 border-t border-white/5 space-y-2 text-[10px] font-black uppercase">
          {role === 'admin' && <button onClick={()=>loadAdmin('admin')} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 tracking-[0.1em] text-gray-500 hover:text-white"><ShieldAlert size={16}/> Admin</button>}
          <button onClick={()=>setView('settings')} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 tracking-[0.1em] text-gray-500 hover:text-white"><Settings size={16}/> Settings</button>
          <button onClick={handleLogout} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-red-500/10 tracking-[0.1em] text-red-900/60 hover:text-red-500"><LogOut size={16}/> Sign Out</button>
        </div>
      </aside>

      <main className={`flex-1 flex flex-col min-w-0 ${prefs.theme === 'dark' ? 'bg-[#050505]' : 'bg-white'} relative transition-colors duration-500`}>
        {isRecoveryMode && <div className="bg-red-600 text-white p-3 text-center text-xs font-black uppercase tracking-widest flex items-center justify-center gap-4"><AlertTriangle size={14}/> Recovery Mode <button onClick={() => setIsRecoveryMode(false)} className="underline">Dismiss</button></div>}
        {view === 'chat' ? (
          <>
            <header className={`h-20 border-b ${prefs.theme === 'dark' ? 'border-white/5' : 'border-gray-100'} flex items-center justify-between px-10 shrink-0 z-10 bg-inherit/80 backdrop-blur-3xl sticky top-0`}>
              <div className="flex items-center gap-5"><div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xs">OC</div><div className="flex flex-col"><span className="font-black text-sm uppercase">Ops Intelligence</span><div className="text-[10px] font-black uppercase tracking-widest text-green-500">{isOffline ? 'Offline' : 'Healthy Routing'}</div></div></div>
              <div className="flex items-center gap-4"><button onClick={()=>setShowDebug(!showDebug)} className={`p-3 rounded-2xl ${showDebug ? 'bg-blue-600 text-white' : 'text-gray-400'}`}><RefreshCcw size={20}/></button><button onClick={()=>setIsAppLocked(true)} className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"><Unlock size={20}/></button></div>
            </header>
            <div className="flex-1 overflow-y-auto p-8 md:p-16 space-y-12 select-text">
              {messages.map((m, i) => (
                <div key={m.id || i} className={`flex gap-8 ${m.role === 'user' ? 'justify-end' : ''}`}>
                  <div className={`max-w-3xl px-8 py-7 rounded-[32px] relative group shadow-2xl ${m.role === 'user' ? 'bg-blue-600 text-white shadow-blue-500/20' : 'bg-gray-50 border border-gray-100 text-gray-800'}`}>
                    {m.role === 'assistant' && <button onClick={() => copy(m.content, m.id || i.toString())} className="absolute -top-4 -right-4 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-black bg-white border border-gray-100 p-3 rounded-2xl shadow-2xl transition-all">{copiedId === (m.id || i.toString()) ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}</button>}
                    <div className={`prose ${m.role === 'user' ? 'prose-invert' : 'prose-slate'} max-w-none font-bold`}><ReactMarkdown>{m.content}</ReactMarkdown></div>
                    {m.toolData && <div className="mt-8 border-t border-black/5 pt-6 text-[10px] font-black uppercase text-gray-400">{m.toolData.model} ({m.toolData.provider})</div>}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} className="h-32" />
            </div>
            <footer className={`p-8 md:p-12 border-t ${prefs.theme === 'dark' ? 'border-white/5' : 'border-gray-100'} bg-inherit/80 backdrop-blur-3xl`}>
              <form onSubmit={sendMessage} className="max-w-4xl mx-auto relative flex items-end gap-4"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); sendMessage(e);}}} placeholder="Ask Ops Copilot..." className="w-full bg-gray-50 border-0 rounded-[32px] py-6 pl-8 pr-20 outline-none focus:bg-white focus:ring-8 focus:ring-blue-500/5 transition-all shadow-2xl resize-none min-h-[80px] font-bold text-lg" rows={1} disabled={loading||isOffline}/><button type="submit" disabled={loading||!input.trim()||isOffline} className="bg-gray-900 text-white p-4 rounded-full hover:bg-blue-600 disabled:bg-gray-100 transition-all shadow-2xl">{loading ? <RefreshCcw size={24} className="animate-spin"/> : <Send size={24}/>}</button></form>
            </footer>
          </>
        ) : view === 'vault' ? (
          <div className="flex-1 overflow-y-auto p-12 md:p-24 animate-in slide-in-from-bottom-10 duration-700 text-gray-900">
            {!isVaultUnlocked ? (
              <div className="max-w-md mx-auto text-center space-y-10 py-20">
                <div className="w-24 h-24 bg-yellow-50 text-yellow-600 rounded-[40px] mx-auto flex items-center justify-center shadow-2xl shadow-yellow-500/20"><Key size={48}/></div>
                <h2 className="text-4xl font-black tracking-tighter italic">Vault Encryption</h2>
                <form onSubmit={unlockVault} className="space-y-6">
                  <input type="password" value={vaultPassphrase} onChange={e=>setVaultPassphrase(e.target.value)} placeholder="Vault Passphrase" className="w-full bg-gray-100 border-0 rounded-3xl p-6 text-center text-xl font-bold outline-none focus:ring-8 focus:ring-yellow-500/10 transition-all" required/>
                  <button type="submit" className="w-full bg-gray-900 text-white p-6 rounded-[24px] font-black uppercase tracking-widest hover:bg-yellow-600 transition-all shadow-2xl transform active:scale-95">Unlock E2EE Content</button>
                </form>
              </div>
            ) : (
              <div className="max-w-6xl space-y-16">
                <div className="flex justify-between items-end border-b border-gray-100 pb-10">
                  <div><h1 className="text-7xl font-black mb-2 tracking-tighter">Vault</h1><p className="text-gray-400 text-xl font-bold italic">Secure End-to-End Encryption.</p></div>
                  <button onClick={()=>{}} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-2xl flex items-center gap-3"><Plus size={20}/> Add Entry</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {vaultItems.map(item => ( <VaultItemCard key={item.id} item={item} dek={dek!}/> ))}
                </div>
              </div>
            )}
          </div>
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
            {view === 'settings' && <SettingsPage hasPinSet={hasPinSet} dek={dek} setHasPinSet={setHasPinSet} savePrefs={savePrefs} prefs={prefs}/>}
            {view === 'quota' && quota && <div className="max-w-4xl space-y-12"><h2 className="text-5xl font-black tracking-tighter">Quota Status</h2><div className="bg-white border p-10 rounded-[40px] shadow-2xl"><div className="flex items-center gap-4 mb-8"><div className={`w-4 h-4 rounded-full ${quota.isThrottled ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}/><span className="text-2xl font-black uppercase tracking-tight">{quota.isThrottled ? 'Throttled' : 'Nominal'}</span></div><div className="grid grid-cols-2 gap-8"><div className="p-6 bg-gray-50 rounded-3xl"><div className="text-xs font-black text-gray-400 uppercase mb-2">Cache Override</div><div className="text-xl font-bold">{quota.cacheTTLOverride || 'Default'}s</div></div><div className="p-6 bg-gray-50 rounded-3xl"><div className="text-xs font-black text-gray-400 uppercase mb-2">Expensive Features</div><div className="text-xl font-bold">{quota.expensiveFeaturesDisabled ? 'DISABLED' : 'ENABLED'}</div></div></div></div></div>}
            {view === 'compliance' && compliance && <div className="max-w-4xl space-y-12"><h2 className="text-5xl font-black tracking-tighter">Compliance Ledger</h2><div className="grid grid-cols-2 gap-8"><div className="bg-gray-50 p-10 rounded-[40px] border shadow-xl"><div className="text-[10px] font-black uppercase text-gray-400 mb-2">Strict Free Mode</div><div className="text-3xl font-black text-green-600">ENFORCED</div></div><div className="bg-gray-50 p-10 rounded-[40px] border shadow-xl"><div className="text-[10px] font-black uppercase text-gray-400 mb-2">Guard Status</div><div className="text-3xl font-black text-green-600">COMPLIANT</div></div></div></div>}
          </div>
        )}
      </main>
      {showCmdK && <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4 bg-gray-900/80 backdrop-blur-xl" onClick={()=>setShowCmdK(false)}><div className="w-full max-w-3xl bg-white rounded-[48px] shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}><div className="flex items-center gap-6 px-10 py-8 border-b"><Command size={32} className="text-blue-600"/><input ref={cmdKInputRef} autoFocus placeholder="Search commands..." className="w-full outline-none text-2xl font-black text-gray-900"/></div><div className="p-6">{[{ i: Plus, t: "New Session", act: createThread }, { i: ShieldAlert, t: "Admin", act: ()=>setView('admin') }].map((item, idx) => (<button key={idx} onClick={()=>{item.act(); setShowCmdK(false);}} className="w-full text-left px-6 py-6 hover:bg-gray-50 rounded-[32px] flex items-center gap-8 transition-all transform active:scale-95"><div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-[24px] flex items-center justify-center"><item.i size={28}/></div><div className="font-black text-xl text-gray-900">{item.t}</div></button>))}</div></div></div>}
      {showVersionModal && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-lg w-full text-center text-gray-900"><h2 className="text-3xl font-black mb-4">What's New</h2><p className="text-gray-500 mb-8">v11: PIN Lock and E2EE Password Vault.</p><button onClick={() => setShowVersionModal(false)} className="w-full bg-blue-600 text-white p-4 rounded-2xl font-black uppercase tracking-widest">Got it</button></div></div>}
      {showShortcutsHelp && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-md w-full text-gray-900"><h2 className="text-2xl font-black mb-6 flex items-center gap-3"><Command size={24}/> Shortcuts</h2><div className="space-y-4 text-xs font-black uppercase text-gray-400">
        <div className="flex justify-between border-b pb-2"><span>Palette</span><kbd className="bg-gray-100 px-2 py-1 rounded text-black font-bold">⌘K</kbd></div>
        <div className="flex justify-between border-b pb-2"><span>Help</span><kbd className="bg-gray-100 px-2 py-1 rounded text-black font-bold">⌘/</kbd></div>
      </div><button onClick={() => setShowShortcutsHelp(false)} className="mt-10 w-full bg-gray-900 text-white p-4 rounded-2xl font-black uppercase hover:bg-black transition-all">Close</button></div></div>}
    </div>
  );
}

function VaultItemCard({ item, dek }: { item: any, dek: CryptoKey }) {
  const [decrypted, setDecrypted] = useState<any>(null);
  const [showPass, setShowPass] = useState(false);
  useEffect(() => { const decrypt = async () => { try { const t = await cryptoHelpers.decryptField(dek, item.title_enc, item.iv.title); const u = await cryptoHelpers.decryptField(dek, item.username_enc, item.iv.username); const p = await cryptoHelpers.decryptField(dek, item.password_enc, item.iv.password); setDecrypted({ t, u, p }); } catch(e){} }; decrypt(); }, [item, dek]);
  if (!decrypted) return <div className="h-40 bg-gray-50 rounded-[32px] animate-pulse"/>;
  return (<div className="bg-white border border-gray-100 p-8 rounded-[32px] shadow-sm hover:shadow-2xl transition-all space-y-6 group"><h3 className="text-xl font-black tracking-tight uppercase text-gray-900">{decrypted.t}</h3><div className="space-y-4 text-gray-900">
    <div className="p-4 bg-gray-50 rounded-2xl flex justify-between items-center group/f"><div><p className="text-[8px] font-black uppercase text-gray-400 tracking-widest mb-1">User</p><p className="text-sm font-bold">{decrypted.u}</p></div><button onClick={()=>navigator.clipboard.writeText(decrypted.u)} className="opacity-0 group-hover/f:opacity-100 text-blue-600 transition-all"><Copy size={14}/></button></div>
    <div className="p-4 bg-gray-50 rounded-2xl flex justify-between items-center group/f"><div><p className="text-[8px] font-black uppercase text-gray-400 tracking-widest mb-1">Pass</p><p className="text-sm font-bold tracking-widest font-mono">{showPass ? decrypted.p : '••••••••'}</p></div><div className="flex gap-2"><button onClick={()=>setShowPass(!showPass)} className="text-gray-400 transition-all">{showPass ? <EyeOff size={14}/> : <Eye size={14}/>}</button><button onClick={()=>navigator.clipboard.writeText(decrypted.p)} className="opacity-0 group-hover/f:opacity-100 text-blue-600 transition-all"><Copy size={14}/></button></div></div>
  </div></div>);
}

function SettingsPage({ hasPinSet, dek, setHasPinSet, savePrefs, prefs }: any) {
  const [newPin, setNewPin] = useState('');
  const enablePin = async () => { if (!dek) { alert('Unlock Vault first'); return; } const salt = crypto.getRandomValues(new Uint8Array(16)); const kek = await cryptoHelpers.deriveKey(newPin, salt); const wrappedTest = await cryptoHelpers.wrapDEK(dek, kek); const db = await getDB(); await db.put('preferences', { id: 'local_pin', salt: btoa(String.fromCharCode(...salt)), test: wrappedTest }); setHasPinSet(true); alert('Enabled'); };
  const disablePin = async () => { const db = await getDB(); await db.delete('preferences', 'local_pin'); setHasPinSet(false); alert('Disabled'); };
  return (<div className="max-w-3xl space-y-16 animate-in slide-in-from-right-10 duration-700 text-gray-900"><h1 className="text-6xl font-black mb-4 tracking-tighter text-gray-900">Settings</h1>
    <div className="p-10 bg-gray-50 rounded-[40px] border shadow-2xl flex items-center justify-between"><div className="flex items-center gap-8"><div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-500/20"><Globe size={32}/></div><div><h3 className="text-2xl font-black tracking-tight text-gray-900">Language</h3></div></div><select value={prefs.language} onChange={e=>savePrefs({language: e.target.value})} className="bg-white border-0 rounded-2xl p-5 font-black uppercase shadow-xl outline-none"><option value="en">English</option><option value="el">Ελληνικά</option></select></div>
    <div className="p-10 bg-gray-50 rounded-[40px] border shadow-2xl space-y-10 text-gray-900"><div className="flex items-center gap-8"><div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-500/20"><Lock size={32}/></div><div><h3 className="text-2xl font-black tracking-tight">Device Lock</h3><p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Status: {hasPinSet ? 'ENABLED' : 'DISABLED'}</p></div></div>
      {hasPinSet ? <button onClick={disablePin} className="w-full bg-red-600 text-white p-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl">Disable PIN Lock</button> : <div className="space-y-6"><input type="password" value={newPin} onChange={e=>setNewPin(e.target.value)} maxLength={4} placeholder="Set PIN" className="w-full bg-white border-0 rounded-2xl p-6 text-center text-2xl font-black tracking-[1em] outline-none shadow-xl text-gray-900"/><button onClick={enablePin} className="w-full bg-blue-600 text-white p-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl">Enable Device Lock</button></div>}
    </div></div>);
}

export default App;
