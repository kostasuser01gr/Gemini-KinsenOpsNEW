import React, { useState, useEffect, useRef } from 'react';
import { Plus, MessageSquare, Settings, LogOut, Send, Car, ShieldAlert, FileText, Server, Search, Copy, Check, Command, Archive, Bookmark, Activity, Paperclip, ChevronRight, Hash, Pin, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Turnstile } from '@marsidev/react-turnstile';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'; // Dummy key for dev

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [_role, setRole] = useState<string | null>(localStorage.getItem('role'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  const [threads, setThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'admin' | 'audit' | 'kb' | 'models' | 'fleet'>('chat');

  // Sidebar state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState('inbox');

  // Admin / Tool State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [_kbDocs, setKbDocs] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  
  const [showCmdK, setShowCmdK] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cmdKInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = () => {
    setToken(null); setRole(null); localStorage.clear();
    setThreads([]); setMessages([]); setActiveThreadId(null);
  };

  useEffect(() => { if (token) fetchThreads(); }, [token]);
  useEffect(() => { if (activeThreadId) fetchMessages(activeThreadId); }, [activeThreadId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Global Cmd+K
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowCmdK(true); }
      if (e.key === 'Escape') setShowCmdK(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => { if (showCmdK) setTimeout(() => cmdKInputRef.current?.focus(), 50); }, [showCmdK]);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = { ...options.headers, Authorization: `Bearer ${token}`, 'x-correlation-id': 'req_' + Date.now() } as any;
    return fetch(url, { ...options, headers });
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
    } else {
      const err = await res.text();
      alert(`Auth failed: ${err}`);
    }
  };

  const fetchThreads = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`);
    if (res.ok) {
      const data = await res.json(); setThreads(data);
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
    if (!input.trim() || !activeThreadId) return;
    const msg = input.trim(); setInput('');
    setMessages(prev => [...prev, { id: 'temp_u', role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await fetchWithAuth(`${API_BASE}/api/chat/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: activeThreadId, content: msg }) });
      if (!res.ok) {
        if (res.status === 429) throw new Error('Rate limit exceeded. Slow down.');
        throw new Error('API error');
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      setMessages(prev => [...prev, { id: 'temp_a', role: 'assistant', content: '', toolData: null }]);

      while (true) {
        const { value, done: isDone } = await reader.read();
        if (isDone) break;
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
    } catch(e: any) {
      setMessages(prev => [...prev, { id: 'err', role: 'assistant', content: `Fallback: ${e.message || 'Error contacting ops engine.'}` }]);
    } finally { setLoading(false); fetchThreads(); }
  };

  const loadAdmin = async (v: any) => {
    setView(v);
    if (v === 'audit') { const r = await fetchWithAuth(`${API_BASE}/api/admin/audit`); if(r.ok) setAuditLogs(await r.json()); }
    if (v === 'kb') { const r = await fetchWithAuth(`${API_BASE}/api/kb/search?q=a`); if(r.ok) setKbDocs(await r.json()); }
    if (v === 'models') { const r = await fetchWithAuth(`${API_BASE}/api/admin/models`); if(r.ok) setModels(await r.json()); }
  };

  const copy = (t: string, id: string) => { navigator.clipboard.writeText(t); setCopiedId(id); setTimeout(()=>setCopiedId(null), 2000); };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100">
        <div className="flex justify-center mb-6"><div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200"><Car size={32}/></div></div>
        <h2 className="text-3xl font-black mb-2 text-center text-gray-900 tracking-tight">Ops Copilot</h2>
        <p className="text-center text-gray-500 mb-6 text-sm font-medium">Internal Knowledge Base & SOP Support</p>
        
        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          <button onClick={() => setIsLogin(true)} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${isLogin ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Sign In</button>
          <button onClick={() => setIsLogin(false)} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${!isLogin ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Sign Up</button>
        </div>

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" className="w-full bg-gray-50 border-0 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" required/>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" minLength={8} className="w-full bg-gray-50 border-0 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" required/>
          
          <div className="flex justify-center my-4">
            <Turnstile siteKey={TURNSTILE_SITE_KEY} onSuccess={setTurnstileToken} />
          </div>

          <button type="submit" disabled={!turnstileToken} className="w-full bg-gray-900 text-white p-4 rounded-xl font-bold hover:bg-black transition-all shadow-xl shadow-gray-200 disabled:opacity-50 disabled:cursor-not-allowed">
            {isLogin ? 'Access Portal' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-white font-sans text-gray-900 overflow-hidden select-none">
      {/* Sidebar */}
      <aside className="w-80 bg-[#0d0d0d] text-gray-400 flex flex-col shrink-0 border-r border-white/5">
        <div className="p-4 flex flex-col gap-3">
          <button onClick={createThread} className="flex items-center justify-between bg-white/10 text-white px-4 py-3 rounded-xl border border-white/5 hover:bg-white/15 transition-all group">
            <div className="flex items-center gap-3"><Plus size={18} className="text-blue-400"/><span className="font-semibold text-sm tracking-tight">New Conversation</span></div>
            <div className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded border border-white/5 opacity-50 group-hover:opacity-100">⌘N</div>
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-3.5 text-gray-600" />
            <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search threads..." className="w-full bg-white/5 border-none rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-1 focus:ring-white/20 outline-none placeholder-gray-600 transition-all"/>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-6 custom-scrollbar pt-2">
          <div>
            <div className="px-3 py-2 text-[10px] font-black uppercase text-gray-600 tracking-widest flex items-center justify-between mb-1">
              <span>Workspace</span> <ChevronRight size={12}/>
            </div>
            <div className="space-y-0.5">
              {['inbox', 'starred', 'archived'].map(f => (
                <button key={f} onClick={()=>setActiveFolder(f)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeFolder === f ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-gray-200'}`}>
                  {f === 'inbox' && <MessageSquare size={16}/>}
                  {f === 'starred' && <Bookmark size={16}/>}
                  {f === 'archived' && <Archive size={16}/>}
                  <span className="capitalize">{f}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="px-3 py-2 text-[10px] font-black uppercase text-gray-600 tracking-widest flex items-center justify-between mb-1">
              <span>Recent Activity</span> <Hash size={12}/>
            </div>
            <div className="space-y-0.5 pb-8">
              {threads.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())).map(t => (
                <button key={t.id} onClick={() => { setActiveThreadId(t.id); setView('chat'); }} className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 group transition-all ${activeThreadId === t.id && view === 'chat' ? 'bg-blue-600 text-white' : 'hover:bg-white/5 hover:text-gray-200'}`}>
                  <div className="shrink-0">{t.pinned ? <Pin size={12} className="rotate-45 text-blue-400"/> : <MessageSquare size={14} className="opacity-40 group-hover:opacity-100"/>}</div>
                  <span className="truncate text-sm font-medium leading-none">{t.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 bg-black/40 border-t border-white/5 space-y-1">
          <button onClick={()=>loadAdmin('admin')} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-sm font-semibold text-gray-300">
            <Settings size={16} className="text-gray-500"/> System Admin
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 transition-all text-sm font-semibold text-red-400/80 hover:text-red-400">
            <LogOut size={16}/> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        {view === 'chat' ? (
          <>
            <header className="h-16 border-b border-gray-100 flex items-center justify-between px-8 bg-white/80 backdrop-blur-md shrink-0 z-10 sticky top-0">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-black text-xs shadow-sm">OC</div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm leading-tight">Internal Ops Copilot</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-green-600 font-bold uppercase tracking-tight">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/> Router: Healthy
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all"><Paperclip size={18}/></button>
                <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all"><Pin size={18}/></button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-10 custom-scrollbar select-text">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-8 shadow-inner"><Command size={40}/></div>
                  <h1 className="text-3xl font-black mb-3 tracking-tight">Operational Intelligence</h1>
                  <p className="text-gray-500 text-sm leading-relaxed font-medium">Welcome back. I can assist with fleet logistics, fuel policies, and standard operating procedures. Every response is verified via the internal knowledge base.</p>
                  <div className="grid grid-cols-2 gap-4 mt-12 w-full">
                    {[
                      { l: "What is the out-of-hours pickup policy?", q: "out of hours pickup" },
                      { l: "How do I process a fuel surcharge?", q: "fuel surcharge process" },
                      { l: "List vehicle classes at Downtown Hub", q: "downtown hub fleet classes" },
                      { l: "Incident reporting procedure", q: "incident reporting steps" }
                    ].map((btn, i) => (
                      <button key={i} onClick={()=>setInput(btn.q)} className="p-4 border border-gray-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 text-left text-xs font-bold transition-all shadow-sm group">
                        <span className="text-gray-400 group-hover:text-blue-400 mr-2">/</span> {btn.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => {
                let text = m.content; let tool = m.toolData;
                if (m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('{')) {
                  try { const p = JSON.parse(m.content); text = p.text; tool = p.toolData || JSON.parse(p.metadata_json || '{}').tool; } catch(e){}
                }
                return (
                  <div key={m.id || i} className={`flex gap-6 animate-in fade-in duration-300 ${m.role === 'user' ? 'justify-end' : ''}`}>
                    <div className={`max-w-2xl px-6 py-5 rounded-3xl relative group shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-50 border border-gray-100 text-gray-800'}`}>
                      {m.role === 'assistant' && (
                        <button onClick={() => copy(text, m.id)} className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-900 bg-white border border-gray-100 p-2 rounded-xl shadow-lg transition-all transform scale-90 group-hover:scale-100">
                          {copiedId === m.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                      )}
                      <div className="prose prose-sm max-w-none prose-headings:font-black prose-p:leading-relaxed prose-a:text-blue-600 prose-code:bg-black/5 prose-code:px-1.5 prose-code:rounded prose-pre:bg-gray-900 prose-pre:text-white">
                        <ReactMarkdown>{text}</ReactMarkdown>
                      </div>
                      {tool && (
                        <div className="mt-6 border-t border-gray-200/50 pt-5 space-y-4">
                          {tool.type === 'ModelStatusCard' && (
                            <div className="bg-white/80 p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3"><div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"/> <span className="text-gray-900">{tool.model}</span></div>
                                <div className="bg-gray-100 px-2 py-1 rounded-md">{tool.provider}</div>
                              </div>
                              {tool.kbHits && tool.kbHits.length > 0 && (
                                <div className="mt-2 text-blue-600 flex gap-2"><FileText size={12}/> Sources: {tool.kbHits.join(', ')}</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-24" />
            </div>

            <footer className="p-6 md:p-10 border-t border-gray-100 bg-white/80 backdrop-blur-md sticky bottom-0">
              <form onSubmit={sendMessage} className="max-w-3xl mx-auto relative flex items-end gap-3 group">
                <div className="relative flex-1">
                  <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); sendMessage(e);}}} placeholder="Ask about policies, fleet, or operations..." className="w-full bg-gray-50 border border-gray-100 rounded-[24px] py-5 pl-6 pr-16 outline-none focus:bg-white focus:border-blue-500 focus:ring-8 focus:ring-blue-500/5 transition-all shadow-inner resize-none min-h-[64px] font-medium" rows={1} disabled={loading}/>
                  <div className="absolute right-4 bottom-4 flex items-center gap-2">
                    <button type="submit" disabled={loading||!input.trim()} className="bg-gray-900 text-white p-3 rounded-full hover:bg-blue-600 disabled:bg-gray-100 disabled:text-gray-300 transition-all shadow-lg hover:shadow-blue-200">
                      <Send size={20}/>
                    </button>
                  </div>
                </div>
              </form>
              <div className="mt-4 text-center flex items-center justify-center gap-4">
                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Verification: FTS5 Engine Enabled</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Security: Correlation Tracked</span>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-12 custom-scrollbar animate-in fade-in duration-500">
            <button onClick={()=>setView('chat')} className="mb-10 text-xs font-black uppercase tracking-widest flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors">
              <ChevronRight size={14} className="rotate-180"/> Back to Dashboard
            </button>
            
            {view === 'admin' && (
              <div className="max-w-6xl">
                <h1 className="text-4xl font-black mb-2 tracking-tighter">System Administration</h1>
                <p className="text-gray-500 mb-12 font-medium">Control governance, routing nodes, and enterprise auditing.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { id: 'kb', icon: FileText, title: 'Ops Knowledge', desc: 'Policy & SOP Repository', color: 'text-blue-600', bg: 'bg-blue-50' },
                    { id: 'models', icon: Server, title: 'Model Registry', desc: 'FREE-Only Routing', color: 'text-purple-600', bg: 'bg-purple-50' },
                    { id: 'fleet', icon: Car, title: 'Fleet Logistics', desc: 'Real-time Status Feed', color: 'text-green-600', bg: 'bg-green-50' },
                    { id: 'audit', icon: ShieldAlert, title: 'Audit Trail', desc: 'Security Logging', color: 'text-red-600', bg: 'bg-red-50' },
                  ].map(card => (
                    <button key={card.id} onClick={()=>loadAdmin(card.id)} className="text-left bg-white border border-gray-100 p-8 rounded-[32px] shadow-sm hover:shadow-xl hover:border-blue-200 transition-all group relative overflow-hidden">
                      <div className={`w-14 h-14 ${card.bg} ${card.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                        <card.icon size={28}/>
                      </div>
                      <h3 className="font-black text-gray-900 mb-2 tracking-tight">{card.title}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed font-medium">{card.desc}</p>
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight size={16} className="text-gray-300"/></div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {view === 'audit' && (
              <div className="max-w-5xl">
                <div className="flex justify-between items-end mb-10">
                  <div><h2 className="text-3xl font-black tracking-tight mb-2">Audit Ledger</h2><p className="text-sm text-gray-500 font-medium">Real-time security trail with correlation tracking.</p></div>
                  <button className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-gray-200 hover:bg-black transition-all">
                    <Download size={16}/> Export Ledger
                  </button>
                </div>
                <div className="bg-white border border-gray-100 rounded-[32px] overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr><th className="px-8 py-5 text-left font-black uppercase text-[10px] tracking-widest text-gray-400">Timestamp</th><th className="px-8 py-5 text-left font-black uppercase text-[10px] tracking-widest text-gray-400">Identity</th><th className="px-8 py-5 text-left font-black uppercase text-[10px] tracking-widest text-gray-400">Event</th><th className="px-8 py-5 text-left font-black uppercase text-[10px] tracking-widest text-gray-400">Entity</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-medium">
                      {auditLogs.map(l=>(
                        <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-8 py-5 text-gray-400 text-xs tabular-nums">{new Date(l.created_at).toLocaleString()}</td>
                          <td className="px-8 py-5 font-bold text-gray-900">{l.user_id}</td>
                          <td className="px-8 py-5"><span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black uppercase">{l.action}</span></td>
                          <td className="px-8 py-5 text-gray-500 text-xs">{l.entity} <span className="opacity-30">{l.correlation_id?.slice(0,8)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'models' && (
              <div className="max-w-5xl">
                <h2 className="text-3xl font-black tracking-tight mb-10 flex items-center gap-4">
                  Routing Chain <span className="text-[10px] bg-green-500 text-white px-3 py-1 rounded-full font-black uppercase tracking-tighter">Verified Free</span>
                </h2>
                <div className="grid gap-4">
                  {models.map(m=>(
                    <div key={m.id} className="bg-white border border-gray-100 p-6 rounded-[24px] flex items-center justify-between group hover:border-blue-200 transition-all shadow-sm">
                      <div className="flex items-center gap-6">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${m.health_status==='healthy'?'bg-green-50 text-green-600':'bg-red-50 text-red-600'}`}><Server size={24}/></div>
                        <div>
                          <div className="font-black text-gray-900 tracking-tight">{m.display_name}</div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">{m.provider_kind} <span className="opacity-20">•</span> {m.model_id}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">License</div>
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase border ${['mit','apache-2.0'].includes(m.license?.toLowerCase()) ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>{m.license || 'N/A'}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Health</div>
                          <div className="flex items-center gap-2 justify-end">
                            <div className={`w-2 h-2 rounded-full ${m.health_status==='healthy'?'bg-green-500 animate-pulse':'bg-red-500'}`}/>
                            <span className="text-xs font-black capitalize text-gray-900">{m.health_status}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Cmd+K Palette */}
      {showCmdK && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4 bg-gray-900/60 backdrop-blur-md animate-in fade-in duration-200" onClick={()=>setShowCmdK(false)}>
          <div className="w-full max-w-2xl bg-white rounded-[32px] shadow-2xl border border-white/20 overflow-hidden shadow-black/20" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-4 px-8 py-6 border-b border-gray-100">
              <Command size={24} className="text-blue-600 font-bold"/>
              <input ref={cmdKInputRef} placeholder="Search commands, threads, or KB..." className="w-full outline-none text-xl font-bold placeholder-gray-300 tracking-tight"/>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Global Actions</div>
              {[
                { i: Plus, t: "New Conversation", d: "Start a fresh ops session", c: "text-blue-500", bg: "bg-blue-50", act: createThread },
                { i: FileText, t: "Search Knowledge Base", d: "Query internal policies", c: "text-purple-500", bg: "bg-purple-50", act: ()=>loadAdmin('kb') },
                { i: Activity, t: "Router Health Status", d: "View real-time AI latency", c: "text-green-500", bg: "bg-green-50", act: ()=>loadAdmin('models') },
                { i: ShieldAlert, t: "Security Audit", d: "Export system access logs", c: "text-red-500", bg: "bg-red-50", act: ()=>loadAdmin('audit') },
              ].map((item, idx) => (
                <button key={idx} onClick={()=>{item.act(); setShowCmdK(false);}} className="w-full text-left px-4 py-4 hover:bg-gray-50 rounded-2xl flex items-center gap-5 transition-all group">
                  <div className={`w-12 h-12 ${item.bg} ${item.c} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}><item.i size={20}/></div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900 text-sm">{item.t}</div>
                    <div className="text-xs text-gray-400 font-medium">{item.d}</div>
                  </div>
                  <ChevronRight size={14} className="text-gray-200 group-hover:text-gray-400 transition-colors"/>
                </button>
              ))}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[10px] font-black uppercase text-gray-400 tracking-widest">
              <span>ESC to Close</span>
              <span>ENTER to Select</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
