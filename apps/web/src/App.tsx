import React, { useState, useEffect, useRef } from 'react';
import { Plus, MessageSquare, Settings, LogOut, Send, Car, Download, ShieldAlert, BarChart, FileJson, Server, Search, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('role'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [threads, setThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'admin' | 'audit' | 'macros' | 'kpis' | 'models'>('chat');

  // Admin / Agent Data
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [, setMacros] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [showMacroPicker, setShowMacroPicker] = useState(false);
  const [showCmdK, setShowCmdK] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  // Global Cmd+K Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCmdK(true);
      }
      if (e.key === 'Escape') setShowCmdK(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (showCmdK) setTimeout(() => cmdKInputRef.current?.focus(), 50);
  }, [showCmdK]);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = { ...options.headers, Authorization: `Bearer ${token}` } as any;
    headers['x-correlation-id'] = 'req_' + Date.now();
    return fetch(url, { ...options, headers });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-correlation-id': 'login_' + Date.now() },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setRole(data.role);
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
      } else alert('Login failed');
    } catch (err) {
      alert('Error connecting to server');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setRole(null);
    localStorage.clear();
    setThreads([]);
    setMessages([]);
    setActiveThreadId(null);
  };

  const fetchThreads = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/chat/threads`);
    if (res.ok) {
      const data = await res.json();
      setThreads(data);
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
      const data = await res.json();
      setActiveThreadId(data.id);
      fetchThreads();
      setMessages([]);
      setView('chat');
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !activeThreadId) return;

    const userMsg = input.trim();
    setInput('');
    setShowMacroPicker(false);
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetchWithAuth(`${API_BASE}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: activeThreadId, content: userMsg })
      });

      if (!res.ok) throw new Error('Network response was not ok');
      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      setMessages(prev => [...prev, { id: 'temp', role: 'assistant', content: '', toolData: null, model: '' }]);

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const data = JSON.parse(line.replace('data: ', ''));
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content = data.content || '';
                  newMsgs[newMsgs.length - 1].toolData = data.toolData || null;
                  newMsgs[newMsgs.length - 1].model = data.model || 'No-AI';
                  return newMsgs;
                });
              } catch (e) {}
            }
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: 'err', role: 'assistant', content: 'Error fetching response.' }]);
    } finally {
      setLoading(false);
      fetchThreads();
    }
  };

  const loadAdminData = async (type: string) => {
    setView(type as any);
    if (type === 'audit') {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/audit`);
      if (res.ok) setAuditLogs(await res.json());
    } else if (type === 'macros') {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/macros`);
      if (res.ok) setMacros(await res.json());
    } else if (type === 'models') {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/models`);
      if (res.ok) setModels(await res.json());
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const executeCmd = (cmd: string) => {
    setShowCmdK(false);
    if (cmd === 'new') createThread();
    if (cmd === 'quote') { setInput('quote'); }
    if (cmd === 'admin' && role === 'admin') setView('admin');
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded shadow-md w-96">
          <h2 className="text-2xl font-bold mb-6 text-center">Copilot Login</h2>
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md p-2" required />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md p-2" required />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700">Login</button>
            <p className="mt-4 text-xs text-gray-500 text-center">Use admin@example.com / admin123 for demo.</p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Command Palette Overlay */}
      {showCmdK && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setShowCmdK(false)}>
          <div className="bg-white w-[500px] rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center gap-3 text-gray-500">
              <Search size={20} />
              <input ref={cmdKInputRef} className="w-full text-lg outline-none placeholder-gray-400" placeholder="Type a command..." />
            </div>
            <div className="p-2">
              <button onClick={() => executeCmd('new')} className="w-full text-left p-3 hover:bg-gray-100 rounded">Create New Chat</button>
              <button onClick={() => executeCmd('quote')} className="w-full text-left p-3 hover:bg-gray-100 rounded">Generate Quote</button>
              {role === 'admin' && <button onClick={() => executeCmd('admin')} className="w-full text-left p-3 hover:bg-gray-100 rounded">Open Admin Console</button>}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col z-10">
        <div className="p-4">
          <button onClick={createThread} className="w-full flex items-center gap-2 border border-gray-600 rounded p-3 hover:bg-gray-800 transition-colors">
            <Plus size={16} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {threads.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveThreadId(t.id); setView('chat'); }}
              className={`w-full text-left p-2 rounded flex items-center gap-2 mb-1 hover:bg-gray-800 transition-colors ${activeThreadId === t.id && view === 'chat' ? 'bg-gray-800' : ''}`}
            >
              <MessageSquare size={16} className="text-gray-400" />
              <span className="truncate text-sm">{t.title}</span>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-gray-800 text-sm">
          {role === 'admin' && (
            <button onClick={() => setView('admin')} className="flex items-center gap-2 w-full p-2 hover:bg-gray-800 rounded mb-2">
              <Settings size={16} /> Admin Console
            </button>
          )}
          <button onClick={handleLogout} className="flex items-center gap-2 w-full p-2 hover:bg-gray-800 rounded">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative bg-white border-l">
        {view === 'chat' ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-40">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Car size={48} className="mb-4" />
                  <h1 className="text-2xl font-semibold mb-2 text-gray-700">Car Rental Copilot</h1>
                  <p>Press <kbd className="bg-gray-100 px-1 py-0.5 rounded text-xs border">Cmd</kbd> + <kbd className="bg-gray-100 px-1 py-0.5 rounded text-xs border">K</kbd> to open commands.</p>
                </div>
              )}
              
              {messages.map((m, i) => {
                let textContent = m.content;
                let toolData = m.toolData;
                let modelLabel = m.model;
                
                if (m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('{')) {
                  try {
                    const parsed = JSON.parse(m.content);
                    textContent = parsed.text || '';
                    toolData = parsed.tool || null;
                    modelLabel = parsed.model;
                  } catch(e) {}
                }

                return (
                  <div key={m.id || i} className={`flex gap-4 mb-6 ${m.role === 'user' ? 'justify-end' : ''}`}>
                    <div className={`max-w-3xl rounded-lg p-5 group relative ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-50 border border-gray-100 text-gray-800 shadow-sm'}`}>
                      
                      {/* Copy Button */}
                      {m.role === 'assistant' && (
                        <button onClick={() => handleCopy(textContent, m.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 bg-white p-1 rounded border shadow-sm">
                          {copiedId === m.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                      )}

                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{textContent}</ReactMarkdown>
                      </div>
                      
                      {toolData && toolData.type === 'quote_card' && (
                        <div className="mt-4 p-4 border border-blue-100 rounded-lg bg-blue-50/50 text-sm shadow-sm">
                          <h4 className="font-bold mb-2 flex items-center gap-2"><Car size={16}/> Quote Details</h4>
                          <div className="space-y-1">
                            <div className="flex justify-between border-b border-blue-100 pb-1 text-gray-600"><span>Base Rate ({toolData.data.days} days)</span><span>${toolData.data.baseTotal}</span></div>
                            <div className="flex justify-between border-b border-blue-100 py-1 text-gray-600"><span>Discounts</span><span className="text-green-600">-${toolData.data.discounts}</span></div>
                            <div className="flex justify-between border-b border-blue-100 py-1 text-gray-600"><span>Add-ons</span><span>${toolData.data.addOnsTotal}</span></div>
                            <div className="flex justify-between font-bold pt-2 text-blue-900"><span>Total Estimated</span><span>${toolData.data.total}</span></div>
                          </div>
                          <button className="mt-4 w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 shadow-sm font-medium">Create Booking</button>
                        </div>
                      )}

                      {toolData && toolData.type === 'booking_card' && (
                        <div className="mt-4 p-4 border border-green-100 rounded-lg bg-green-50/50 text-sm">
                          <h4 className="font-bold mb-2 text-green-900">Booking Initiation</h4>
                          <button className="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 shadow-sm font-medium">Open Form</button>
                        </div>
                      )}

                      {/* Model Label */}
                      {m.role === 'assistant' && modelLabel && (
                        <div className="mt-3 text-[10px] text-gray-400 font-mono">⚡ {modelLabel}</div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent p-4 sm:p-6 lg:px-8">
              {showMacroPicker && (
                <div className="max-w-3xl mx-auto mb-2 bg-white border rounded-lg shadow-lg p-2 flex gap-2">
                  <button onClick={() => {setInput("I can give you a quote."); setShowMacroPicker(false)}} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700">Quote Template</button>
                  <button onClick={() => {setInput("Please refer to our cancellation policy."); setShowMacroPicker(false)}} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700">Cancel Policy</button>
                </div>
              )}
              <form onSubmit={sendMessage} className="max-w-3xl mx-auto relative flex items-center gap-2">
                <button type="button" onClick={() => setShowMacroPicker(!showMacroPicker)} className="absolute left-3 text-gray-400 hover:text-gray-600 z-10">
                  <FileJson size={20} />
                </button>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(e);
                    }
                  }}
                  placeholder="Message Copilot... (Press / for macros)"
                  className="w-full border border-gray-300 rounded-xl pl-10 pr-12 py-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white resize-none"
                  rows={1}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="absolute right-2 bottom-2 bg-blue-600 text-white rounded-lg p-2.5 disabled:bg-gray-300 hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        ) : view === 'admin' ? (
          <div className="flex-1 p-8 overflow-y-auto">
            <button onClick={() => setView('chat')} className="mb-6 text-blue-600 hover:underline font-medium">&larr; Back to Chat</button>
            <h1 className="text-3xl font-bold mb-8">Admin Console</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { id: 'audit', icon: ShieldAlert, title: 'Audit Logs', desc: 'Security logs and sensitive reads' },
                { id: 'kpis', icon: BarChart, title: 'KPI Rollups', desc: 'Daily utilization and revenue' },
                { id: 'macros', icon: FileJson, title: 'Macros Manager', desc: 'Agent response templates' },
                { id: 'models', icon: Server, title: 'Model Registry', desc: 'FREE-only models & Routing' }
              ].map(card => (
                <div key={card.id} className="bg-white border rounded-xl p-6 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group" onClick={() => loadAdminData(card.id)}>
                  <div className="flex items-center gap-3 mb-4 text-blue-600 group-hover:scale-110 transition-transform">
                    <card.icon />
                    <h2 className="text-lg font-semibold text-gray-900">{card.title}</h2>
                  </div>
                  <p className="text-gray-500 text-sm mb-4">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : view === 'audit' ? (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <button onClick={() => setView('admin')} className="text-blue-600 hover:underline mb-2 block font-medium">&larr; Admin Console</button>
                <h1 className="text-2xl font-bold">Audit Viewer</h1>
              </div>
              <button onClick={() => {}} className="flex items-center gap-2 bg-white border border-gray-300 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-50">
                <Download size={16} /> Export CSV
              </button>
            </div>
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Entity</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Req ID</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{log.user_id}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">{log.action}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500">{log.entity} {log.entity_id ? `(${log.entity_id})` : ''}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-gray-400">{log.correlation_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : view === 'models' ? (
          <div className="flex-1 p-8 overflow-y-auto">
             <button onClick={() => setView('admin')} className="text-blue-600 hover:underline mb-4 block font-medium">&larr; Admin Console</button>
             <h1 className="text-2xl font-bold mb-2">Model Registry (FREE-only)</h1>
             <p className="text-gray-500 mb-6">Manage allowed open-source models. The router will auto-fallback on failures. Jailbreak models are strictly prohibited.</p>
             
             <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Model</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Provider</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">License</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Priority</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {models.map((m: any) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{m.display_name}<br/><span className="text-xs font-mono text-gray-400">{m.model_id}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500">{m.provider_kind}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 py-1 rounded text-xs font-medium ${m.license === 'apache-2.0' || m.license === 'mit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{m.license}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${m.health_status === 'healthy' ? 'bg-green-100 text-green-800' : m.health_status === 'unhealthy' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>{m.health_status}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500">{m.priority}</td>
                    </tr>
                  ))}
                  {models.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-4 text-center text-gray-500">No AI models configured. Running in No-AI Deterministic mode.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-8">
            <button onClick={() => setView('admin')} className="text-blue-600 hover:underline mb-2 block">&larr; Admin Console</button>
            <h1 className="text-2xl font-bold mb-4">{view.charAt(0).toUpperCase() + view.slice(1)}</h1>
            <p className="text-gray-500">This module is part of the v2 upgrade.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;