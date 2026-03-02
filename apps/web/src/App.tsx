import React, { useState, useEffect, useRef } from 'react';
import { Plus, MessageSquare, Settings, LogOut, Send, Car, Download, ShieldAlert, FileText, Search, Copy, Check, Command, Archive, Bookmark, Activity, Paperclip, ChevronRight, Hash, Pin, Globe, Moon, Sun, Database, UploadCloud, BarChart } from 'lucide-react';
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
  const [view, setView] = useState<'chat' | 'admin' | 'audit' | 'kb' | 'models' | 'settings' | 'retention' | 'kpis' | 'import_export'>('chat');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder] = useState('inbox');
  const [prefs, setPrefs] = useState({ language: 'en', theme: 'light', compact_mode: 0 });

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [_models, setModels] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  
  const [showCmdK, setShowCmdK] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cmdKInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (token) {
      fetchThreads();
      fetchPrefs();
    }
  }, [token]);

  useEffect(() => { if (activeThreadId && !isOffline) fetchMessages(activeThreadId); }, [activeThreadId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = { ...options.headers, Authorization: `Bearer ${token}`, 'x-correlation-id': 'req_' + Date.now() } as any;
    return fetch(url, { ...options, headers });
  };

  const fetchPrefs = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/me/preferences`);
    if (res.ok) {
      const data = await res.json();
      setPrefs(data);
      if (data.language) i18n.changeLanguage(data.language);
    }
  };

  const savePrefs = async (newPrefs: any) => {
    const res = await fetchWithAuth(`${API_BASE}/api/me/preferences`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPrefs)
    });
    if (res.ok) {
      setPrefs({ ...prefs, ...newPrefs });
      if (newPrefs.language) i18n.changeLanguage(newPrefs.language);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
    const res = await fetch(`${API_BASE}${endpoint}`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ email, password, turnstile_token: turnstileToken }) 
    });
    if (res.ok) {
      const data = await res.json(); setToken(data.token); setRole(data.role);
      localStorage.setItem('token', data.token); localStorage.setItem('role', data.role);
    } else alert('Auth failed');
  };

  const fetchThreads = async () => {
    if (isOffline) {
      setThreads(await getThreadsOffline());
      return;
    }
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`);
    if (res.ok) {
      const data = await res.json();
      setThreads(data);
      saveThreadsOffline(data);
      if (data.length > 0 && !activeThreadId) setActiveThreadId(data[0].id);
    }
  };

  const fetchMessages = async (id: string) => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads/${id}/messages`);
    if (res.ok) setMessages(await res.json());
  };

  const createThread = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json(); setActiveThreadId(data.id); fetchThreads(); setMessages([]); setView('chat');
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !activeThreadId || isOffline) return;
    const msg = input.trim(); setInput('');
    setMessages(prev => [...prev, { id: 'temp_u', role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await fetchWithAuth(`${API_BASE}/api/chat/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: activeThreadId, content: msg }) });
      if (!res.ok) throw new Error();
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      setMessages(prev => [...prev, { id: 'temp_a', role: 'assistant', content: '', toolData: null }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.slice(6));
              setMessages(prev => {
                const n = [...prev]; const last = n[n.length-1];
                last.content = data.content; last.toolData = data.toolData;
                return n;
              });
            } catch(e){}
          }
        }
      }
    } catch(e) {
      setMessages(prev => [...prev, { id: 'err', role: 'assistant', content: 'Fallback: Error contacting backend.' }]);
    } finally { setLoading(false); fetchThreads(); }
  };

  const loadAdmin = async (v: any) => {
    setView(v);
    if (v === 'audit') { const r = await fetchWithAuth(`${API_BASE}/api/admin/audit`); if(r.ok) setAuditLogs(await r.json()); }
    if (v === 'models') { const r = await fetchWithAuth(`${API_BASE}/api/admin/models`); if(r.ok) setModels(await r.json()); }
    if (v === 'kpis') { const r = await fetchWithAuth(`${API_BASE}/api/admin/models/kpis`); if(r.ok) setKpis(await r.json()); }
  };

  const handleLogout = () => {
    setToken(null); setRole(null); localStorage.clear();
    setThreads([]); setMessages([]); setActiveThreadId(null);
  };

  const copy = (t: string, id: string) => { navigator.clipboard.writeText(t); setCopiedId(id); setTimeout(()=>setCopiedId(null), 2000); };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="bg-white p-10 rounded-[40px] shadow-2xl w-full max-w-md border border-gray-100">
        <div className="flex justify-center mb-8"><div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-200"><Car size={40}/></div></div>
        <h2 className="text-4xl font-black mb-2 text-center text-gray-900 tracking-tighter">Ops Copilot</h2>
        <p className="text-center text-gray-500 mb-10 text-sm font-bold uppercase tracking-widest opacity-60">Internal Enterprise Hub</p>
        
        <div className="flex rounded-2xl bg-gray-100 p-1.5 mb-8">
          <button onClick={() => setIsLogin(true)} className={`flex-1 py-3 text-sm font-black uppercase tracking-widest rounded-xl transition-all ${isLogin ? 'bg-white shadow-xl text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>{t('common.login')}</button>
          <button onClick={() => setIsLogin(false)} className={`flex-1 py-3 text-sm font-black uppercase tracking-widest rounded-xl transition-all ${!isLogin ? 'bg-white shadow-xl text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>{t('common.signup')}</button>
        </div>

        <form onSubmit={handleAuthSubmit} className="space-y-6">
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Corporate email" className="w-full bg-gray-50 border-0 rounded-2xl p-5 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-bold" required/>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password (min 8 chars)" minLength={8} className="w-full bg-gray-50 border-0 rounded-2xl p-5 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-bold" required/>
          <div className="flex justify-center py-2"><Turnstile siteKey={TURNSTILE_SITE_KEY} onSuccess={setTurnstileToken} /></div>
          <button type="submit" disabled={!turnstileToken} className="w-full bg-gray-900 text-white p-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-2xl shadow-gray-300 disabled:opacity-30 disabled:cursor-not-allowed">
            {isLogin ? t('common.login') : t('common.signup')}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className={`flex h-screen ${prefs.theme === 'dark' ? 'bg-[#050505] text-white' : 'bg-white text-gray-900'} font-sans overflow-hidden select-none`}>
      {/* Sidebar */}
      <aside className="w-80 bg-[#0d0d0d] text-gray-400 flex flex-col shrink-0 border-r border-white/5">
        <div className="p-6 flex flex-col gap-4">
          <button onClick={createThread} className="flex items-center justify-between bg-white text-black px-5 py-4 rounded-2xl hover:bg-blue-500 hover:text-white transition-all group shadow-xl">
            <div className="flex items-center gap-3"><Plus size={20}/><span className="font-black text-sm uppercase tracking-tighter">{t('common.new_chat')}</span></div>
            <Command size={14} className="opacity-20"/>
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-4 top-4 text-gray-600" />
            <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder={t('common.search')} className="w-full bg-white/5 border-0 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none placeholder-gray-700 transition-all font-bold"/>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 space-y-8 custom-scrollbar pt-2">
          <div>
            <div className="px-4 py-2 text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] flex items-center justify-between mb-2">
              <span>Navigation</span> <ChevronRight size={12}/>
            </div>
            <div className="space-y-1">
              {['inbox', 'starred', 'archived'].map(f => (
                <button key={f} onClick={()=>setView('chat')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-tighter transition-all ${view === 'chat' && activeFolder === f ? 'bg-white/10 text-white shadow-inner' : 'hover:bg-white/5 hover:text-gray-200'}`}>
                  {f === 'inbox' && <MessageSquare size={18}/>}
                  {f === 'starred' && <Bookmark size={18}/>}
                  {f === 'archived' && <Archive size={18}/>}
                  <span>{f}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="px-4 py-2 text-[10px] font-black uppercase text-gray-600 tracking-[0.2em] flex items-center justify-between mb-2">
              <span>Recents</span> <Hash size={12}/>
            </div>
            <div className="space-y-1 pb-10">
              {threads.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())).map(t => (
                <button key={t.id} onClick={() => { setActiveThreadId(t.id); setView('chat'); }} className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-4 group transition-all ${activeThreadId === t.id && view === 'chat' ? 'bg-blue-600 text-white shadow-xl scale-[1.02]' : 'hover:bg-white/5 hover:text-gray-200'}`}>
                  <div className="shrink-0">{t.pinned ? <Pin size={14} className="rotate-45 text-blue-400"/> : <div className="w-1.5 h-1.5 rounded-full bg-gray-700 group-hover:bg-blue-500 transition-colors"/>}</div>
                  <span className="truncate text-xs font-black uppercase tracking-tight">{t.title}</span>
                </button>
              ))}
            </div>
          </div>
        </nav>

        <div className="p-6 bg-black/40 border-t border-white/5 space-y-2">
          {role === 'admin' && (
            <button onClick={()=>setView('admin')} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all text-[10px] font-black uppercase tracking-[0.1em] text-gray-500 hover:text-white">
              <ShieldAlert size={16}/> {t('common.admin')}
            </button>
          )}
          <button onClick={()=>setView('settings')} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all text-[10px] font-black uppercase tracking-[0.1em] text-gray-500 hover:text-white">
            <Settings size={16}/> {t('common.settings')}
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-red-500/10 transition-all text-[10px] font-black uppercase tracking-[0.1em] text-red-900/60 hover:text-red-500">
            <LogOut size={16}/> {t('common.logout')}
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className={`flex-1 flex flex-col min-w-0 ${prefs.theme === 'dark' ? 'bg-[#050505]' : 'bg-white'} relative transition-colors duration-500`}>
        {view === 'chat' ? (
          <>
            <header className={`h-20 border-b ${prefs.theme === 'dark' ? 'border-white/5' : 'border-gray-100'} flex items-center justify-between px-10 shrink-0 z-10 sticky top-0 bg-inherit/80 backdrop-blur-3xl`}>
              <div className="flex items-center gap-5">
                <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-xl shadow-blue-500/20">OC</div>
                <div className="flex flex-col">
                  <span className="font-black text-sm uppercase tracking-tight">Ops Engine v6.0</span>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                    {isOffline ? (
                      <span className="text-red-500 flex items-center gap-1.5"><Activity size={10}/> {t('chat.offline')}</span>
                    ) : (
                      <span className="text-green-500 flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/> Router: Healthy</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all shadow-sm"><Paperclip size={20}/></button>
                <button className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all shadow-sm"><Pin size={20}/></button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 md:p-16 space-y-12 custom-scrollbar select-text">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto py-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                  <div className="w-24 h-24 bg-blue-600/5 text-blue-600 rounded-[40px] flex items-center justify-center mb-10 shadow-inner border border-blue-600/10"><Command size={48}/></div>
                  <h1 className="text-5xl font-black mb-4 tracking-tighter text-gray-900">{t('chat.welcome')}</h1>
                  <p className="text-gray-400 text-lg font-bold leading-relaxed max-w-md mx-auto">{t('chat.placeholder')}</p>
                  <div className="grid grid-cols-2 gap-4 mt-16 w-full">
                    {[
                      { l: "Out-of-hours Policy", q: "What is the out-of-hours pickup policy?" },
                      { l: "Fuel Surcharge SOP", q: "How do I process a fuel surcharge?" }
                    ].map((btn, i) => (
                      <button key={i} onClick={()=>setInput(btn.q)} className="p-6 border border-gray-100 rounded-3xl hover:border-blue-500 hover:bg-blue-50/50 text-left text-xs font-black uppercase tracking-widest transition-all shadow-2xl shadow-gray-100 group">
                        <span className="text-blue-600 group-hover:scale-110 inline-block mr-3">/</span> {btn.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => {
                let text = m.content; let tool = m.toolData;
                if (m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('{')) {
                  try { const p = JSON.parse(m.content); text = p.text; tool = p.toolData; } catch(e){}
                }
                return (
                  <div key={m.id || i} className={`flex gap-8 animate-in fade-in duration-500 ${m.role === 'user' ? 'justify-end' : ''}`}>
                    <div className={`max-w-3xl px-8 py-7 rounded-[32px] relative group shadow-2xl ${m.role === 'user' ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-gray-50 border border-gray-100 text-gray-800 shadow-gray-100'}`}>
                      {m.role === 'assistant' && (
                        <button onClick={() => copy(text, m.id)} className="absolute -top-4 -right-4 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-black bg-white border border-gray-100 p-3 rounded-2xl shadow-2xl transition-all transform hover:scale-110">
                          {copiedId === m.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                        </button>
                      )}
                      <div className={`prose ${m.role === 'user' ? 'prose-invert' : 'prose-slate'} max-w-none prose-headings:font-black prose-p:leading-relaxed prose-code:bg-black/5 prose-code:p-1 prose-code:rounded-lg`}>
                        <ReactMarkdown>{text}</ReactMarkdown>
                      </div>
                      {tool && (
                        <div className="mt-8 border-t border-black/5 pt-6 space-y-4">
                          {tool.type === 'ModelStatusCard' && (
                            <div className="bg-white/50 p-5 rounded-2xl border border-black/5 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
                              <div className="flex items-center gap-4"><div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-xl shadow-blue-200"/> <span className="text-black">{tool.model}</span></div>
                              <div className="bg-black/5 px-3 py-1.5 rounded-lg">{tool.provider}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-32" />
            </div>

            <footer className={`p-8 md:p-12 border-t ${prefs.theme === 'dark' ? 'border-white/5' : 'border-gray-100'} sticky bottom-0 bg-inherit/80 backdrop-blur-3xl`}>
              <form onSubmit={sendMessage} className="max-w-4xl mx-auto relative flex items-end gap-4 group">
                <div className="relative flex-1">
                  <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); sendMessage(e);}}} placeholder={t('chat.placeholder')} className="w-full bg-gray-50 border-0 rounded-[32px] py-6 pl-8 pr-20 outline-none focus:bg-white focus:ring-8 focus:ring-blue-500/5 transition-all shadow-2xl shadow-inner resize-none min-h-[80px] font-bold text-lg" rows={1} disabled={loading||isOffline}/>
                  <div className="absolute right-4 bottom-4 flex items-center gap-3">
                    <button type="submit" disabled={loading||!input.trim()||isOffline} className="bg-gray-900 text-white p-4 rounded-full hover:bg-blue-600 disabled:bg-gray-100 disabled:text-gray-300 transition-all shadow-2xl hover:scale-110 active:scale-95">
                      <Send size={24}/>
                    </button>
                  </div>
                </div>
              </form>
              <div className="mt-6 text-center flex items-center justify-center gap-8 opacity-30 font-black text-[10px] uppercase tracking-[0.3em]">
                <span>Strict Free Mode</span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"/>
                <span>Auto-Archive Enabled</span>
              </div>
            </footer>
          </>
        ) : view === 'settings' ? (
          <div className="flex-1 overflow-y-auto p-12 md:p-24 custom-scrollbar animate-in slide-in-from-right-10 duration-700">
            <button onClick={()=>setView('chat')} className="mb-12 text-xs font-black uppercase tracking-[0.2em] flex items-center gap-3 text-blue-600 hover:scale-105 transition-all">
              <ChevronRight size={16} className="rotate-180"/> Back to Dashboard
            </button>
            
            <h1 className="text-6xl font-black mb-4 tracking-tighter">{t('common.settings')}</h1>
            <p className="text-gray-400 text-xl font-bold mb-20 max-w-lg">Customize your operational workspace and language preferences.</p>
            
            <div className="max-w-3xl space-y-16">
              <div className="flex items-center justify-between p-10 bg-gray-50 rounded-[40px] border border-gray-100 shadow-2xl shadow-gray-100">
                <div className="flex items-center gap-8">
                  <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-200"><Globe size={32}/></div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">Language / Γλώσσα</h3>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">i18n Localization</p>
                  </div>
                </div>
                <select value={prefs.language} onChange={e=>savePrefs({language: e.target.value})} className="bg-white border-0 rounded-2xl p-5 font-black uppercase tracking-widest text-xs shadow-xl outline-none ring-4 ring-blue-500/5">
                  <option value="en">English (US)</option>
                  <option value="el">Ελληνικά (GR)</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-10 bg-gray-50 rounded-[40px] border border-gray-100 shadow-2xl shadow-gray-100">
                <div className="flex items-center gap-8">
                  <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-200">{prefs.theme === 'dark' ? <Moon size={32}/> : <Sun size={32}/>}</div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">Visual Theme</h3>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Light / Dark Interface</p>
                  </div>
                </div>
                <div className="flex bg-white p-2 rounded-2xl shadow-xl">
                  <button onClick={()=>savePrefs({theme: 'light'})} className={`p-4 rounded-xl transition-all ${prefs.theme === 'light' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}><Sun size={20}/></button>
                  <button onClick={()=>savePrefs({theme: 'dark'})} className={`p-4 rounded-xl transition-all ${prefs.theme === 'dark' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}><Moon size={20}/></button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-12 md:p-24 custom-scrollbar">
            <button onClick={()=>setView('chat')} className="mb-12 text-xs font-black uppercase tracking-[0.2em] flex items-center gap-3 text-blue-600 hover:scale-105 transition-all">
              <ChevronRight size={16} className="rotate-180"/> Back to Dashboard
            </button>
            
            {view === 'admin' && (
              <div className="max-w-6xl">
                <h1 className="text-6xl font-black mb-4 tracking-tighter">Administration</h1>
                <p className="text-gray-400 text-xl font-bold mb-20 max-w-lg">Manage governance, data retention, and performance rollups.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {[
                    { id: 'kb', icon: FileText, title: 'Knowledge', desc: 'Policy repository', color: 'text-blue-600', bg: 'bg-blue-50' },
                    { id: 'kpis', icon: BarChart, title: 'AI Analytics', desc: 'Model performance', color: 'text-purple-600', bg: 'bg-purple-50' },
                    { id: 'retention', icon: Database, title: 'Retention', desc: 'Auto-archive rules', color: 'text-orange-600', bg: 'bg-orange-50' },
                    { id: 'import_export', icon: UploadCloud, title: 'Portability', desc: 'JSON import/export', color: 'text-green-600', bg: 'bg-green-50' },
                    { id: 'audit', icon: ShieldAlert, title: 'Audit Trail', desc: 'Security logging', color: 'text-red-600', bg: 'bg-red-50' },
                  ].map(card => (
                    <button key={card.id} onClick={()=>{setView(card.id as any); loadAdmin(card.id);}} className="text-left bg-white border border-gray-100 p-10 rounded-[48px] shadow-sm hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1)] hover:border-blue-200 transition-all group relative overflow-hidden">
                      <div className={`w-16 h-16 ${card.bg} ${card.color} rounded-[24px] flex items-center justify-center mb-8 group-hover:scale-110 transition-transform`}>
                        <card.icon size={32}/>
                      </div>
                      <h3 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">{card.title}</h3>
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest leading-relaxed opacity-60">{card.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {view === 'retention' && (
              <div className="max-w-4xl space-y-12">
                <h2 className="text-4xl font-black tracking-tighter">Retention Rules</h2>
                <div className="bg-gray-50 border border-gray-100 p-12 rounded-[48px] shadow-2xl shadow-gray-100 space-y-10">
                  <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Thread Retention (Days)</label>
                      <input type="number" defaultValue={30} className="w-full bg-white border-0 rounded-2xl p-5 font-black text-lg shadow-xl outline-none ring-4 ring-blue-500/5"/>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Audit Retention (Days)</label>
                      <input type="number" defaultValue={30} className="w-full bg-white border-0 rounded-2xl p-5 font-black text-lg shadow-xl outline-none ring-4 ring-blue-500/5"/>
                    </div>
                  </div>
                  <button onClick={async () => {
                    setLoading(true);
                    const res = await fetchWithAuth(`${API_BASE}/api/admin/retention/run`, { method: 'POST' });
                    const data = await res.json();
                    alert(`Retention complete: ${JSON.stringify(data)}`);
                    setLoading(false);
                  }} disabled={loading} className="w-full bg-black text-white p-6 rounded-[24px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-2xl active:scale-95">
                    Trigger Manual Archive Run
                  </button>
                </div>
              </div>
            )}

            {view === 'kpis' && (
              <div className="max-w-6xl space-y-12">
                <h2 className="text-4xl font-black tracking-tighter">Model Performance</h2>
                <div className="grid grid-cols-1 gap-6">
                  {kpis.map((k, idx) => (
                    <div key={idx} className="bg-white border border-gray-100 p-8 rounded-[32px] shadow-sm flex items-center justify-between">
                      <div>
                        <div className="font-black text-xl">{k.model_id}</div>
                        <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest mt-1">{k.date} • {k.provider_kind}</div>
                      </div>
                      <div className="flex gap-12 text-right">
                        <div>
                          <div className="text-[10px] font-black uppercase text-gray-400 mb-1">Calls</div>
                          <div className="text-2xl font-black">{k.calls}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-black uppercase text-gray-400 mb-1">Success</div>
                          <div className="text-2xl font-black text-green-600">{Math.round((k.success_calls/k.calls)*100)}%</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-black uppercase text-gray-400 mb-1">Fallbacks</div>
                          <div className="text-2xl font-black text-orange-600">{k.fallback_used_calls}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'audit' && (
              <div className="max-w-6xl space-y-12">
                <h2 className="text-4xl font-black tracking-tighter">Audit Ledger</h2>
                <div className="bg-white border border-gray-100 rounded-[32px] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr><th className="px-8 py-5 text-left font-black uppercase text-[10px]">Identity</th><th className="px-8 py-5 text-left font-black uppercase text-[10px]">Action</th><th className="px-8 py-5 text-left font-black uppercase text-[10px]">Timestamp</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {auditLogs.map(l => (
                        <tr key={l.id}>
                          <td className="px-8 py-5 font-bold">{l.user_id}</td>
                          <td className="px-8 py-5 uppercase font-black text-blue-600">{l.action}</td>
                          <td className="px-8 py-5 text-gray-400">{new Date(l.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'import_export' && (
              <div className="max-w-4xl space-y-12">
                <h2 className="text-4xl font-black tracking-tighter">Data Portability</h2>
                <div className="grid grid-cols-2 gap-8">
                  <button onClick={async () => {
                    const res = await fetchWithAuth(`${API_BASE}/api/admin/export`);
                    const data = await res.json();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ops-copilot-export-${new Date().toISOString()}.json`;
                    a.click();
                  }} className="bg-white border border-gray-100 p-12 rounded-[48px] shadow-2xl hover:border-blue-500 transition-all text-center group">
                    <Download size={48} className="mx-auto mb-6 text-blue-600 group-hover:scale-110 transition-transform"/>
                    <h3 className="text-2xl font-black tracking-tight">Full Export</h3>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400 mt-2">Generate JSON Bundle</p>
                  </button>
                  <label className="bg-white border border-gray-100 p-12 rounded-[48px] shadow-2xl hover:border-blue-500 transition-all text-center cursor-pointer group">
                    <UploadCloud size={48} className="mx-auto mb-6 text-green-600 group-hover:scale-110 transition-transform"/>
                    <h3 className="text-2xl font-black tracking-tight">Restore Import</h3>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400 mt-2">Upload JSON Bundle</p>
                    <input type="file" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const text = await file.text();
                      const res = await fetchWithAuth(`${API_BASE}/api/admin/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: text
                      });
                      if (res.ok) alert('Import successful');
                    }}/>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Cmd+K Palette */}
      {showCmdK && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4 bg-gray-900/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={()=>setShowCmdK(false)}>
          <div className="w-full max-w-3xl bg-white rounded-[48px] shadow-[0_80px_160px_-20px_rgba(0,0,0,0.5)] border border-white/20 overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-6 px-10 py-8 border-b border-gray-100">
              <Command size={32} className="text-blue-600"/>
              <input ref={cmdKInputRef} placeholder="Search anything (threads, docs, actions)..." className="w-full outline-none text-2xl font-black placeholder-gray-200 tracking-tighter"/>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-[0.4em] opacity-40">Operational Actions</div>
              {[
                { i: Plus, t: "Create New Conversation", d: "Fresh ops session", c: "text-blue-500", bg: "bg-blue-50", act: createThread },
                { i: Globe, t: "Switch Language", d: "English / Ελληνικά", c: "text-purple-500", bg: "bg-purple-50", act: ()=>setView('settings') },
                { i: Database, t: "Run Retention Archiver", d: "Clean up D1 storage", c: "text-orange-500", bg: "bg-orange-50", act: ()=>setView('retention') },
                { i: Download, t: "Export JSON Snapshot", d: "Backup system data", c: "text-green-500", bg: "bg-green-50", act: ()=>setView('import_export') },
              ].map((item, idx) => (
                <button key={idx} onClick={()=>{item.act(); setShowCmdK(false);}} className="w-full text-left px-6 py-6 hover:bg-gray-50 rounded-[32px] flex items-center gap-8 transition-all group border border-transparent hover:border-blue-100">
                  <div className={`w-16 h-16 ${item.bg} ${item.c} rounded-[24px] flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-inherit/10`}><item.i size={28}/></div>
                  <div className="flex-1">
                    <div className="font-black text-xl text-gray-900 tracking-tight">{item.t}</div>
                    <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1 opacity-60">{item.d}</div>
                  </div>
                  <ChevronRight size={20} className="text-gray-200 group-hover:text-blue-600 transition-all group-hover:translate-x-2"/>
                </button>
              ))}
            </div>
            <div className="p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
              <span>ESC to Exit</span>
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"/> Connected to Cloudflare D1</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
