import React, { useState, useEffect, useRef } from 'react';
import { Menu, Plus, MessageSquare, Settings, LogOut, Send, Search, Car, FileText, Download, ShieldAlert, BarChart, FileJson } from 'lucide-react';

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
  const [view, setView] = useState<'chat' | 'admin' | 'audit' | 'macros' | 'kpis' | 'pricing'>('chat');

  // Admin Data
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [macros, setMacros] = useState<any[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (token) fetchThreads();
  }, [token]);

  useEffect(() => {
    if (activeThreadId) fetchMessages(activeThreadId);
  }, [activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = { ...options.headers, Authorization: `Bearer ${token}` } as any;
    // mock correlation id
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
      } else {
        alert('Login failed');
      }
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
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
    }
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
      let rawData = '';

      setMessages(prev => [...prev, { id: 'temp', role: 'assistant', content: '', toolData: null }]);

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
                  return newMsgs;
                });
              } catch (e) {
                // partial chunk
              }
            }
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: 'err', role: 'assistant', content: 'Error: Could not fetch response.' }]);
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
    }
  };

  const downloadAuditCsv = async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/admin/audit/export.csv`);
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit_logs.csv';
      a.click();
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded shadow-md w-96">
          <h2 className="text-2xl font-bold mb-6 text-center">Copilot Login</h2>
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" required />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" required />
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
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4">
          <button onClick={createThread} className="w-full flex items-center gap-2 border border-gray-600 rounded p-3 hover:bg-gray-800 transition-colors">
            <Plus size={16} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveThreadId(t.id); setView('chat'); }}
              className={`w-full text-left p-3 flex items-center gap-2 hover:bg-gray-800 transition-colors ${activeThreadId === t.id && view === 'chat' ? 'bg-gray-800' : ''}`}
            >
              <MessageSquare size={16} />
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
      <div className="flex-1 flex flex-col relative bg-gray-50">
        {view === 'chat' ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-32">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Car size={48} className="mb-4" />
                  <h1 className="text-2xl font-semibold mb-2 text-gray-700">Car Rental Copilot</h1>
                  <p>Ask about fleet availability, reservations, or company policies.</p>
                </div>
              )}
              {messages.map((m, i) => {
                let textContent = m.content;
                let toolData = m.toolData;
                
                // parse DB format for previous messages
                if (m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('{')) {
                  try {
                    const parsed = JSON.parse(m.content);
                    textContent = parsed.text || '';
                    toolData = parsed.tool || null;
                  } catch(e) {}
                }

                return (
                  <div key={m.id || i} className={`flex gap-4 mb-6 ${m.role === 'user' ? 'justify-end' : ''}`}>
                    <div className={`max-w-3xl rounded-lg p-4 ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-800 shadow-sm'}`}>
                      <pre className="whitespace-pre-wrap font-sans text-sm">{textContent}</pre>
                      
                      {toolData && toolData.type === 'quote_card' && (
                        <div className="mt-4 p-4 border rounded-lg bg-gray-50 text-sm">
                          <h4 className="font-bold mb-2">Quote Breakdown</h4>
                          <div className="flex justify-between border-b pb-1"><span>Base Rate ({toolData.data.days} days)</span><span>${toolData.data.baseTotal}</span></div>
                          <div className="flex justify-between border-b py-1"><span>Discounts</span><span className="text-green-600">-${toolData.data.discounts}</span></div>
                          <div className="flex justify-between border-b py-1"><span>Add-ons</span><span>${toolData.data.addOnsTotal}</span></div>
                          <div className="flex justify-between font-bold pt-2"><span>Total Estimated</span><span>${toolData.data.total}</span></div>
                          <button className="mt-3 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Proceed to Book</button>
                        </div>
                      )}

                      {toolData && toolData.type === 'booking_card' && (
                        <div className="mt-4 p-4 border rounded-lg bg-blue-50 text-sm">
                          <h4 className="font-bold mb-2">Booking Initiation</h4>
                          <p className="mb-2 text-gray-600">Please confirm vehicle selection and customer details to continue.</p>
                          <button className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">Open Booking Form</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent p-4 sm:p-6 lg:px-8">
              <form onSubmit={sendMessage} className="max-w-3xl mx-auto relative flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Message Copilot... (Type 'quote' to test tool panel)"
                  className="w-full border border-gray-300 rounded-lg pl-4 pr-12 py-4 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="absolute right-2 top-2 bottom-2 bg-blue-600 text-white rounded p-2 disabled:bg-gray-400 hover:bg-blue-700 transition-colors"
                >
                  <Send size={20} />
                </button>
              </form>
            </div>
          </>
        ) : view === 'admin' ? (
          <div className="flex-1 p-8 overflow-y-auto">
            <button onClick={() => setView('chat')} className="mb-6 text-blue-600 hover:underline">&larr; Back to Chat</button>
            <h1 className="text-2xl font-bold mb-6">Admin Console</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white border p-6 rounded-lg shadow-sm cursor-pointer hover:border-blue-500" onClick={() => loadAdminData('audit')}>
                <div className="flex items-center gap-3 mb-4">
                  <ShieldAlert className="text-blue-600" />
                  <h2 className="text-lg font-semibold">Audit Logs</h2>
                </div>
                <p className="text-gray-600 text-sm mb-4">View security logs and sensitive reads.</p>
              </div>
              <div className="bg-white border p-6 rounded-lg shadow-sm cursor-pointer hover:border-blue-500" onClick={() => loadAdminData('kpis')}>
                <div className="flex items-center gap-3 mb-4">
                  <BarChart className="text-blue-600" />
                  <h2 className="text-lg font-semibold">KPI Rollups</h2>
                </div>
                <p className="text-gray-600 text-sm mb-4">View daily utilization and revenue.</p>
              </div>
              <div className="bg-white border p-6 rounded-lg shadow-sm cursor-pointer hover:border-blue-500" onClick={() => loadAdminData('macros')}>
                <div className="flex items-center gap-3 mb-4">
                  <FileJson className="text-blue-600" />
                  <h2 className="text-lg font-semibold">Macros Manager</h2>
                </div>
                <p className="text-gray-600 text-sm mb-4">Manage agent response templates.</p>
              </div>
            </div>
          </div>
        ) : view === 'audit' ? (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <button onClick={() => setView('admin')} className="text-blue-600 hover:underline mb-2 block">&larr; Admin Console</button>
                <h1 className="text-2xl font-bold">Audit Viewer</h1>
              </div>
              <button onClick={downloadAuditCsv} className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded hover:bg-gray-200">
                <Download size={16} /> Export CSV
              </button>
            </div>
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Req ID</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLogs.map((log: any) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{log.user_id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.action}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.entity} {log.entity_id ? `(${log.entity_id})` : ''}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-400">{log.correlation_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-8">
            <button onClick={() => setView('admin')} className="text-blue-600 hover:underline mb-2 block">&larr; Admin Console</button>
            <h1 className="text-2xl font-bold mb-4">{view.charAt(0).toUpperCase() + view.slice(1)}</h1>
            <p className="text-gray-500">This module is part of the v2 upgrade. Data views implemented based on D1 specs.</p>
            {view === 'macros' && (
              <ul className="mt-4 list-disc pl-5">
                {macros.map(m => <li key={m.id} className="mb-2"><strong>{m.title}</strong> - {m.visibility_role}</li>)}
                {macros.length === 0 && <span className="text-sm text-gray-400">No macros found.</span>}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;