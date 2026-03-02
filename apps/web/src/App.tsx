import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MessageSquare, Settings, LogOut, Send, Car, ShieldAlert, 
  Search, Copy, Check, Command, Archive, Bookmark, Server,
  Activity, ChevronRight, Hash, Pin, Globe, Lock, Unlock, Key, 
  Database, UploadCloud, BarChart, AlertTriangle, RefreshCcw, Eye, EyeOff, Trash2
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

  // App Lock (PIN)
  const [isAppLocked, setIsAppLocked] = useState(true);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [hasPinSet, setHasPinSet] = useState(false);

  // Vault
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
  const [activeFolder] = useState('inbox');
  const [prefs, setPrefs] = useState({ language: 'en', theme: 'light', compact_mode: 0 });

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [compliance, setCompliance] = useState<any>(null);
  const [quota, setQuota] = useState<any>(null);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  
  const [showCmdK, setShowCmdK] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cmdKInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (token) { fetchThreads(); fetchPrefs(); checkPinStatus(); }
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [token, isOffline]);

  const checkPinStatus = async () => {
    const db = await getDB();
    const pinData = await db.get('preferences', 'local_pin');
    setHasPinSet(!!pinData);
    if (!pinData) setIsAppLocked(false);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const db = await getDB();
    const pinData = await db.get('preferences', 'local_pin');
    if (!pinData) { setIsAppLocked(false); return; }

    const salt = Uint8Array.from(atob(pinData.salt), c => c.charCodeAt(0));
    const kek = await cryptoHelpers.deriveKey(pin, salt);
    const wrappedTest = pinData.test;
    
    try {
      await cryptoHelpers.unwrapDEK(wrappedTest, kek);
      setIsAppLocked(false);
      setPinError(null);
    } catch (err) {
      setPinError('Invalid PIN');
      setPin('');
    }
  };

  const unlockVault = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetchWithAuth(`${API_BASE}/api/vault/key`);
    if (!res.ok) { alert('Vault not bootstrapped'); return; }
    const { wrapped_dek, kdf_params } = await res.json();
    
    const salt = Uint8Array.from(atob(kdf_params.salt), c => c.charCodeAt(0));
    const kek = await cryptoHelpers.deriveKey(vaultPassphrase, salt, kdf_params.iterations);
    
    try {
      const unwrappedDek = await cryptoHelpers.unwrapDEK(wrapped_dek, kek);
      setDek(unwrappedDek);
      setIsVaultUnlocked(true);
      fetchVaultItems();
    } catch (err) {
      alert('Invalid Passphrase');
    }
  };

  const fetchVaultItems = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/vault/items`);
    if (res.ok) setVaultItems(await res.json());
  };

  const fetchWithAuth = async (url: string, opts: any = {}) => {
    const headers = { ...opts.headers, Authorization: `Bearer ${token}`, 'x-correlation-id': 'req_' + Date.now(), 'x-workspace-id': localStorage.getItem('workspace_id') || 'ws_default_public' };
    return fetch(url, { ...opts, headers });
  };

  const fetchThreads = async () => {
    if (isOffline) { setThreads(await getThreadsOffline()); return; }
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`);
    if (res.ok) { const d = await res.json(); setThreads(d); saveThreadsOffline(d); if (d.length > 0 && !activeThreadId) setActiveThreadId(d[0].id); }
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

  const loadAdmin = async (v: any) => { 
    setView(v); 
    try {
      if (v === 'audit') { const r = await fetchWithAuth(`${API_BASE}/api/admin/audit`); if(r.ok) setAuditLogs(await r.json()); } 
      if (v === 'compliance') { const r = await fetchWithAuth(`${API_BASE}/api/admin/compliance/status`); if(r.ok) setCompliance(await r.json()); }
      if (v === 'quota') { const r = await fetchWithAuth(`${API_BASE}/api/admin/quota/status`); if(r.ok) setQuota(await r.json()); }
    } catch(e) { setIsRecoveryMode(true); }
  };

  const fetchMessages = async (id: string) => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads/${id}/messages`);
    if (res.ok) setMessages(await res.json());
  };

  const fetchPrefs = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/me/preferences`);
    if (res.ok) { const d = await res.json(); setPrefs(d); if (d.language) i18n.changeLanguage(d.language); }
  };

  const handleLogout = () => { setToken(null); setRole(null); localStorage.clear(); setThreads([]); setMessages([]); setActiveThreadId(null); setIsAppLocked(true); };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 text-gray-900">
      <div className="bg-white p-10 rounded-[40px] shadow-2xl w-full max-w-md border border-gray-100 text-center">
        <Car size={40} className="mx-auto mb-8 text-blue-600"/>
        <h2 className="text-4xl font-black mb-8 tracking-tighter italic">Ops Portal</h2>
        <div className="flex rounded-2xl bg-gray-100 p-1.5 mb-8">
          <button onClick={() => setIsLogin(true)} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all ${isLogin ? 'bg-white shadow-xl text-blue-600' : 'text-gray-400'}`}>Sign In</button>
          <button onClick={() => setIsLogin(false)} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all ${!isLogin ? 'bg-white shadow-xl text-blue-600' : 'text-gray-400'}`}>Sign Up</button>
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
    <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d] p-4 text-white font-sans">
      <div className="w-full max-w-xs text-center space-y-10 animate-in fade-in duration-1000">
        <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-500/40"><Lock size={32}/></div>
        <h2 className="text-2xl font-black uppercase tracking-widest italic">App Locked</h2>
        <form onSubmit={handlePinSubmit} className="space-y-6">
          <input type="password" value={pin} onChange={e=>setPin(e.target.value)} maxLength={4} placeholder="Enter 4-digit PIN" className="w-full bg-white/5 border-0 rounded-2xl p-6 text-center text-3xl font-black tracking-[1em] outline-none focus:ring-4 focus:ring-blue-500/50 transition-all placeholder:text-[10px] placeholder:tracking-widest placeholder:text-gray-600" autoFocus/>
          {pinError && <p className="text-red-500 text-xs font-black uppercase tracking-widest animate-pulse">{pinError}</p>}
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-500">
            <button type="button" onClick={handleLogout} className="hover:text-white">Switch Account</button>
            <button type="button" className="hover:text-white">Forgot PIN?</button>
          </div>
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
        </div>
        <nav className="flex-1 overflow-y-auto px-4 space-y-8 pt-2">
          <div className="space-y-1">
            <button onClick={()=>setView('chat')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-tighter transition-all ${view === 'chat' ? 'bg-white/10 text-white shadow-inner' : 'hover:bg-white/5'}`}><MessageSquare size={18} className="text-blue-500"/> <span>Chat</span></button>
            <button onClick={()=>setView('vault')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-tighter transition-all ${view === 'vault' ? 'bg-white/10 text-white shadow-inner' : 'hover:bg-white/5'}`}><Key size={18} className="text-yellow-500"/> <span>Vault</span></button>
          </div>
          <div><div className="px-4 py-2 text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] flex items-center justify-between mb-2"><span>Operational Feed</span> <Hash size={12}/></div>
            <div className="space-y-1 pb-10">
              {threads.map(t => (
                <button key={t.id} onClick={() => { setActiveThreadId(t.id); setView('chat'); }} className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-4 group transition-all ${activeThreadId === t.id && view === 'chat' ? 'bg-blue-600 text-white shadow-2xl' : 'hover:bg-white/5'}`}>
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
        {view === 'chat' ? (
          <>
            <header className={`h-20 border-b ${prefs.theme === 'dark' ? 'border-white/5' : 'border-gray-100'} flex items-center justify-between px-10 shrink-0 z-10 bg-inherit/80 backdrop-blur-3xl sticky top-0`}>
              <div className="flex items-center gap-5"><div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xs">OC</div><div className="flex flex-col"><span className="font-black text-sm uppercase tracking-tight">Ops Intelligence v11</span></div></div>
              <div className="flex items-center gap-4"><button onClick={()=>setIsAppLocked(true)} className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"><Unlock size={20}/></button></div>
            </header>
            <div className="flex-1 overflow-y-auto p-8 md:p-16 space-y-12 select-text">
              {messages.map((m, i) => (
                <div key={m.id || i} className={`flex gap-8 ${m.role === 'user' ? 'justify-end' : ''}`}>
                  <div className={`max-w-3xl px-8 py-7 rounded-[32px] relative group shadow-2xl ${m.role === 'user' ? 'bg-blue-600 text-white shadow-blue-500/20' : 'bg-gray-50 border border-gray-100 text-gray-800 shadow-gray-500/5'}`}>
                    <div className={`prose ${m.role === 'user' ? 'prose-invert' : 'prose-slate'} max-w-none font-bold`}><ReactMarkdown>{m.content}</ReactMarkdown></div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} className="h-32" />
            </div>
            <footer className={`p-8 md:p-12 border-t ${prefs.theme === 'dark' ? 'border-white/5' : 'border-gray-100'} sticky bottom-0 bg-inherit/80 backdrop-blur-3xl`}>
              <form onSubmit={sendMessage} className="max-w-4xl mx-auto relative flex items-end gap-4"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); sendMessage(e);}}} placeholder="Ask Ops Copilot..." className="w-full bg-gray-50 border-0 rounded-[32px] py-6 pl-8 pr-20 outline-none focus:bg-white focus:ring-8 focus:ring-blue-500/5 transition-all shadow-2xl shadow-inner resize-none min-h-[80px] font-bold text-lg" rows={1} disabled={loading||isOffline}/><button type="submit" disabled={loading||!input.trim()||isOffline} className="bg-gray-900 text-white p-4 rounded-full hover:bg-blue-600 disabled:bg-gray-100 transition-all shadow-2xl">{loading ? <RefreshCcw size={24} className="animate-spin"/> : <Send size={24}/>}</button></form>
            </footer>
          </>
        ) : view === 'vault' ? (
          <div className="flex-1 overflow-y-auto p-12 md:p-24 animate-in slide-in-from-bottom-10 duration-700">
            {!isVaultUnlocked ? (
              <div className="max-w-md mx-auto text-center space-y-10 py-20">
                <div className="w-24 h-24 bg-yellow-50 text-yellow-600 rounded-[40px] mx-auto flex items-center justify-center shadow-2xl shadow-yellow-500/20"><Key size={48}/></div>
                <h2 className="text-4xl font-black tracking-tighter italic">Vault Encryption</h2>
                <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest leading-relaxed">Enter your master passphrase to derive the Data Encryption Key (DEK). The server never sees this string.</p>
                <form onSubmit={unlockVault} className="space-y-6">
                  <input type="password" value={vaultPassphrase} onChange={e=>setVaultPassphrase(e.target.value)} placeholder="Vault Passphrase" className="w-full bg-gray-100 border-0 rounded-3xl p-6 text-center text-xl font-bold outline-none focus:ring-8 focus:ring-yellow-500/10 transition-all" required/>
                  <button type="submit" className="w-full bg-gray-900 text-white p-6 rounded-[24px] font-black uppercase tracking-widest hover:bg-yellow-600 transition-all shadow-2xl transform active:scale-95">Unlock E2EE Content</button>
                </form>
              </div>
            ) : (
              <div className="max-w-6xl space-y-16">
                <div className="flex justify-between items-end border-b border-gray-100 pb-10">
                  <div><h1 className="text-7xl font-black mb-2 tracking-tighter">Vault</h1><p className="text-gray-400 text-xl font-bold italic">Secure, End-to-End Encrypted Credentials.</p></div>
                  <button onClick={()=>{}} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-blue-500/20 hover:scale-105 transition-all flex items-center gap-3"><Plus size={20}/> Add Entry</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {vaultItems.map(item => (
                    <VaultItemCard key={item.id} item={item} dek={dek!}/>
                  ))}
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
            {view === 'settings' && <SettingsPage hasPinSet={hasPinSet} dek={dek} setHasPinSet={setHasPinSet} handleLogout={handleLogout}/>}
          </div>
        )}
      </main>
    </div>
  );
}

function VaultItemCard({ item, dek }: { item: any, dek: CryptoKey }) {
  const [decrypted, setDecrypted] = useState<any>(null);
  const [showPassword, setShowDebug] = useState(false);

  const handleDecrypt = async () => {
    const title = await cryptoHelpers.decryptField(dek, item.title_enc, item.iv.title);
    const username = await cryptoHelpers.decryptField(dek, item.username_enc, item.iv.username);
    const password = await cryptoHelpers.decryptField(dek, item.password_enc, item.iv.password);
    setDecrypted({ title, username, password });
  };

  useEffect(() => { handleDecrypt(); }, [item, dek]);

  if (!decrypted) return <div className="h-40 bg-gray-50 rounded-[32px] animate-pulse"/>;

  return (
    <div className="bg-white border border-gray-100 p-8 rounded-[32px] shadow-sm hover:shadow-2xl transition-all space-y-6 group">
      <div className="flex justify-between items-start">
        <h3 className="text-xl font-black tracking-tight uppercase">{decrypted.title}</h3>
        <button className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
      </div>
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 rounded-2xl flex justify-between items-center group/field">
          <div><p className="text-[8px] font-black uppercase text-gray-400 tracking-widest mb-1">Username</p><p className="text-sm font-bold">{decrypted.username}</p></div>
          <button onClick={() => navigator.clipboard.writeText(decrypted.username)} className="opacity-0 group-hover/field:opacity-100 text-blue-600 transition-all"><Copy size={14}/></button>
        </div>
        <div className="p-4 bg-gray-50 rounded-2xl flex justify-between items-center group/field">
          <div><p className="text-[8px] font-black uppercase text-gray-400 tracking-widest mb-1">Password</p><p className="text-sm font-bold tracking-widest font-mono">{showPassword ? decrypted.password : '••••••••'}</p></div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowDebug(!showPassword)} className="text-gray-400 hover:text-blue-600 transition-all">{showPassword ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
            <button onClick={() => navigator.clipboard.writeText(decrypted.password)} className="opacity-0 group-hover/field:opacity-100 text-blue-600 transition-all"><Copy size={14}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ hasPinSet, dek, setHasPinSet, handleLogout }: any) {
  const [newPin, setNewPin] = useState('');
  
  const enablePin = async () => {
    if (!dek) { alert('Unlock Vault first to derive wrappers'); return; }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await cryptoHelpers.deriveKey(newPin, salt);
    const wrappedTest = await cryptoHelpers.wrapDEK(dek, kek);
    
    const db = await getDB();
    await db.put('preferences', {
      id: 'local_pin',
      salt: btoa(String.fromCharCode(...salt)),
      test: wrappedTest
    });
    setHasPinSet(true);
    alert('PIN Enabled Successfully');
  };

  const disablePin = async () => {
    const db = await getDB();
    await db.delete('preferences', 'local_pin');
    setHasPinSet(false);
    alert('PIN Disabled');
  };

  return (
    <div className="max-w-3xl space-y-16 animate-in slide-in-from-right-10 duration-700 text-gray-900">
      <h1 className="text-6xl font-black mb-4 tracking-tighter">Settings</h1>
      <div className="p-10 bg-gray-50 rounded-[40px] border shadow-2xl space-y-10">
        <div className="flex items-center gap-8">
          <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-500/20"><Lock size={32}/></div>
          <div><h3 className="text-2xl font-black tracking-tight">Device Lock (PIN)</h3><p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Status: {hasPinSet ? 'ENABLED' : 'DISABLED'}</p></div>
        </div>
        {hasPinSet ? (
          <button onClick={disablePin} className="w-full bg-red-600 text-white p-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-red-500/20 hover:scale-105 transition-all">Disable PIN Lock</button>
        ) : (
          <div className="space-y-6">
            <input type="password" value={newPin} onChange={e=>setNewPin(e.target.value)} maxLength={4} placeholder="Set 4-digit PIN" className="w-full bg-white border-0 rounded-2xl p-6 text-center text-2xl font-black tracking-[1em] outline-none shadow-xl"/>
            <button onClick={enablePin} className="w-full bg-blue-600 text-white p-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-blue-500/20 hover:scale-105 transition-all">Enable Device Lock</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
