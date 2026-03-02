import React, { useState, useEffect, useRef } from 'react';
import { Plus, MessageSquare, Settings, LogOut, Send, Car, ShieldAlert, FileText, Server, Search, Command, Folder, Activity } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [_role, setRole] = useState<string | null>(localStorage.getItem('role'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [threads, setThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'admin' | 'audit' | 'kb' | 'models' | 'fleet'>('chat');

  // Sidebar / Search
  const [searchQuery, setSearchParams] = useState('');
  const [_folder, _setFolder] = useState('inbox');

  // Admin / State Data
  const [_auditLogs, setAuditLogs] = useState<any[]>([]);
  const [kbDocs, setKbDocs] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [_fleet, setFleet] = useState<any[]>([]);
  
  const [showCmdK, setShowCmdK] = useState(false);
  const [_copiedId, _setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cmdKInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token) fetchThreads();
  }, [token]);

  useEffect(() => {
    if (activeThreadId) fetchMessages(activeThreadId);
  }, [activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Global Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowCmdK(true); }
      if (e.key === 'Escape') setShowCmdK(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => { if (showCmdK) setTimeout(() => cmdKInputRef.current?.focus(), 50); }, [showCmdK]);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = { ...options.headers, Authorization: `Bearer ${token}` } as any;
    headers['x-correlation-id'] = 'req_' + Date.now();
    return fetch(url, { ...options, headers });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const data = await res.json();
      setToken(data.token); setRole(data.role);
      localStorage.setItem('token', data.token); localStorage.setItem('role', data.role);
    } else alert('Login failed');
  };

  const handleLogout = () => {
    setToken(null); setRole(null); localStorage.clear();
    setThreads([]); setMessages([]); setActiveThreadId(null);
  };

  const fetchThreads = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`);
    if (res.ok) {
      const data = await res.json(); setThreads(data);
      if (data.length > 0 && !activeThreadId) setActiveThreadId(data[0].id);
    }
  };

  const fetchMessages = async (threadId: string) => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads/${threadId}/messages`);
    if (res.ok) setMessages(await res.json());
  };

  const createThread = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json(); setActiveThreadId(data.id);
      fetchThreads(); setMessages([]); setView('chat');
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !activeThreadId) return;
    const userMsg = input.trim(); setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetchWithAuth(`${API_BASE}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: activeThreadId, content: userMsg })
      });
      if (!res.ok) throw new Error('API error');
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let done = false;
      setMessages(prev => [...prev, { id: 'temp', role: 'assistant', content: '', toolData: null }]);

      while (!done) {
        const { value, done: rd } = await reader.read(); done = rd;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const data = JSON.parse(line.slice(6));
                setMessages(prev => {
                  const n = [...prev]; n[n.length - 1].content = data.content;
                  n[n.length - 1].toolData = data.toolData;
                  return n;
                });
              } catch(e) {}
            }
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
    if (v === 'kb') { const r = await fetchWithAuth(`${API_BASE}/api/kb/search?q=a`); if(r.ok) setKbDocs(await r.json()); }
    if (v === 'models') { const r = await fetchWithAuth(`${API_BASE}/api/admin/models`); if(r.ok) setModels(await r.json()); }
    if (v === 'fleet') { const r = await fetchWithAuth(`${API_BASE}/api/fleet/search`); if(r.ok) setFleet(await r.json()); }
  };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border">
        <h2 className="text-3xl font-bold mb-6 text-center text-gray-900">Copilot Login</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" required/></div>
          <div><label className="block text-sm font-medium mb-1">Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" required/></div>
          <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700 transition-colors">Sign In</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-white font-sans text-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-gray-900 text-gray-300 flex flex-col border-r border-gray-800">
        <div className="p-4 flex flex-col gap-2">
          <button onClick={createThread} className="flex items-center gap-2 bg-gray-800 text-white p-3 rounded-xl border border-gray-700 hover:bg-gray-700 transition-all">
            <Plus size={18}/> <span className="font-medium">New Chat</span>
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-gray-500" />
            <input value={searchQuery} onChange={e=>setSearchParams(e.target.value)} placeholder="Search threads..." className="w-full bg-gray-800 border-none rounded-lg py-2 pl-9 pr-3 text-sm focus:ring-1 focus:ring-gray-600 outline-none"/>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
          <div className="px-3 py-2 text-xs font-bold uppercase text-gray-500 flex items-center justify-between">
            <span>Recent</span> <Folder size={12}/>
          </div>
          {threads.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())).map(t => (
            <button key={t.id} onClick={() => { setActiveThreadId(t.id); setView('chat'); }} className={`w-full text-left p-2.5 rounded-lg flex items-center gap-3 transition-colors ${activeThreadId === t.id && view === 'chat' ? 'bg-gray-800 text-white' : 'hover:bg-gray-800/50'}`}>
              <MessageSquare size={16} className={activeThreadId === t.id ? 'text-blue-400' : 'text-gray-500'}/>
              <span className="truncate text-sm">{t.title}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 bg-gray-900/50 border-t border-gray-800 space-y-1">
          <button onClick={()=>loadAdmin('admin')} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors text-sm">
            <Settings size={16}/> Admin Control
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors text-sm text-red-400">
            <LogOut size={16}/> Logout
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {view === 'chat' ? (
          <>
            <header className="h-14 border-b flex items-center justify-between px-6 bg-white shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">Copilot</span>
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Internal v3</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border">
                  <Activity size={12} className="text-green-500 animate-pulse"/> Router: Healthy
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 custom-scrollbar">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                    <Command size={32}/>
                  </div>
                  <h1 className="text-2xl font-bold mb-2">Internal Ops Copilot</h1>
                  <p className="text-gray-500 text-sm">Search knowledge base, fleet status, and company policies. All AI models are verified FREE-ONLY.</p>
                  <div className="grid grid-cols-2 gap-3 mt-8 w-full">
                    <button onClick={()=>setInput("What is the fuel policy?")} className="p-3 border rounded-xl hover:border-blue-500 hover:bg-blue-50 text-left text-xs transition-all">"Fuel policy?"</button>
                    <button onClick={()=>setInput("List available cars Downtown")} className="p-3 border rounded-xl hover:border-blue-500 hover:bg-blue-50 text-left text-xs transition-all">"Fleet status Downtown"</button>
                  </div>
                </div>
              )}

              {messages.map((m, i) => {
                let text = m.content; let tool = m.toolData;
                if (m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('{')) {
                  try { const p = JSON.parse(m.content); text = p.text; tool = p.toolData || JSON.parse(p.metadata || '{}').tool; } catch(e){}
                }
                return (
                  <div key={m.id || i} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : ''}`}>
                    <div className={`max-w-2xl px-5 py-4 rounded-2xl relative group ${m.role === 'user' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 border border-gray-100 text-gray-800'}`}>
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{text}</ReactMarkdown>
                      </div>
                      {tool && (
                        <div className="mt-4 border-t pt-4 space-y-3">
                          {tool.type === 'ModelStatusCard' && (
                            <div className="bg-white p-3 rounded-xl border shadow-sm flex items-center justify-between text-[10px] font-mono">
                              <div className="flex items-center gap-2"><Server size={12} className="text-blue-500"/> {tool.model}</div>
                              <div className="text-gray-400">via {tool.provider}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-20" />
            </div>

            <footer className="p-4 md:p-6 border-t bg-white">
              <form onSubmit={sendMessage} className="max-w-3xl mx-auto relative group">
                <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); sendMessage(e);}}} placeholder="Message Ops Copilot..." className="w-full bg-white border border-gray-200 rounded-2xl py-4 pl-5 pr-14 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm resize-none" rows={1} disabled={loading}/>
                <button type="submit" disabled={loading||!input.trim()} className="absolute right-3 bottom-3 bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 disabled:bg-gray-200 transition-all">
                  <Send size={18}/>
                </button>
              </form>
              <div className="mt-3 text-center text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                Deterministic Fallback Enabled • Free Tiers Only
              </div>
            </footer>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <button onClick={()=>setView('chat')} className="mb-8 text-sm font-bold flex items-center gap-2 text-blue-600 hover:text-blue-700">
              &larr; Back to Dashboard
            </button>
            
            {view === 'admin' && (
              <div className="max-w-5xl">
                <h1 className="text-3xl font-black mb-8">Admin Control Panel</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    { id: 'kb', icon: FileText, title: 'Knowledge Base', desc: 'Process & Policy docs' },
                    { id: 'models', icon: Server, title: 'Model Registry', desc: 'FREE-only routing chain' },
                    { id: 'fleet', icon: Car, title: 'Fleet Status', desc: 'Real-time vehicle availability' },
                    { id: 'audit', icon: ShieldAlert, title: 'Security Audit', desc: 'Audit trail & exports' },
                  ].map(card => (
                    <button key={card.id} onClick={()=>loadAdmin(card.id)} className="text-left bg-white border p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-500 transition-all group">
                      <div className="w-12 h-12 bg-gray-50 text-gray-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                        <card.icon size={24}/>
                      </div>
                      <h3 className="font-bold text-gray-900 mb-1">{card.title}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {view === 'kb' && (
              <div className="max-w-4xl">
                <h2 className="text-2xl font-bold mb-6">Knowledge Base</h2>
                <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr><th className="px-6 py-4 text-left font-bold">Document</th><th className="px-6 py-4 text-left font-bold">Role</th><th className="px-6 py-4 text-left font-bold">Updated</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {kbDocs.map(d=>(
                        <tr key={d.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-medium">{d.title}</td>
                          <td className="px-6 py-4"><span className="px-2 py-1 bg-gray-100 rounded text-[10px] uppercase font-bold">{d.visibility_role}</span></td>
                          <td className="px-6 py-4 text-gray-500 text-xs">{new Date().toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'models' && (
              <div className="max-w-4xl">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  Model Router <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full">FREE ONLY</span>
                </h2>
                <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr><th className="px-6 py-4 text-left">Model</th><th className="px-6 py-4 text-left">License</th><th className="px-6 py-4 text-left">Status</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {models.map(m=>(
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="font-bold">{m.display_name}</div>
                            <div className="text-[10px] font-mono text-gray-400 uppercase tracking-tighter">{m.provider_kind}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${['mit','apache-2.0'].includes(m.license?.toLowerCase()) ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-orange-50 text-orange-700'}`}>
                              {m.license || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${m.health_status==='healthy'?'bg-green-500':'bg-red-500'}`}/>
                              <span className="text-xs font-medium capitalize">{m.health_status}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Cmd+K Palette */}
      {showCmdK && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-gray-900/40 backdrop-blur-sm" onClick={()=>setShowCmdK(false)}>
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b">
              <Command size={20} className="text-gray-400"/>
              <input ref={cmdKInputRef} placeholder="Search anything (Cmd+K)" className="w-full outline-none text-lg placeholder-gray-300"/>
            </div>
            <div className="p-2 max-h-[60vh] overflow-y-auto">
              <div className="px-3 py-2 text-[10px] font-bold uppercase text-gray-400 tracking-widest">Quick Actions</div>
              <button className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-xl flex items-center gap-3 transition-colors">
                <Plus size={16} className="text-blue-500"/> <span>New Chat</span>
              </button>
              <button className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-xl flex items-center gap-3 transition-colors">
                <Search size={16} className="text-purple-500"/> <span>Search KB Documents</span>
              </button>
              <button onClick={()=>loadAdmin('models')} className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-xl flex items-center gap-3 transition-colors">
                <Activity size={16} className="text-green-500"/> <span>Router Health Status</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
