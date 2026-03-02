import { useCallback, useEffect, useMemo, useState } from 'react';
import { Car, Command, PanelLeftClose, PanelRightClose, Sparkles, User } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AgentTabs } from './components/AgentTabs';
import { ChatArea } from './components/ChatArea';
import { CommandPalette } from './components/CommandPalette';
import { InputComposer } from './components/InputComposer';
import { RightPanel } from './components/RightPanel';
import { Sidebar } from './components/Sidebar';
import { PINScreen, VaultProvider, useVault } from './components/Vault';
import type {
  AgentOption,
  AlertItem,
  ChatMessage,
  ChatModelOption,
  ChatThreadSummary,
  FleetStat,
} from './components/types';
import { apiRequest, streamChatMessage } from './lib/api';
import { trackTelemetry } from './lib/telemetry';
import { enqueueOfflineChatMessage, startOfflineSync, stopOfflineSync } from './offline';
import {
  getMessagesByThread,
  getThreads,
  initDB,
  saveMessages,
  saveThreads,
  type MessageRecord,
} from './store';

const MODEL_OPTIONS: ChatModelOption[] = [
  { id: 'rental-core', name: 'Rental Core', icon: '✦', tier: 'Ultra' },
  { id: 'rental-fast', name: 'Rental Fast', icon: '◆', tier: 'Fast' },
  { id: 'rental-standard', name: 'Rental Standard', icon: '●', tier: 'Standard' },
  { id: 'ops-codex', name: 'Ops Codex', icon: '⟐', tier: 'Code' },
];

const AGENTS: AgentOption[] = [
  { id: 'assistant', name: 'Assistant', description: 'General operational assistant', icon: Sparkles },
  { id: 'fleet', name: 'Fleet Manager', description: 'Vehicle state and dispatch operations', icon: Car },
  { id: 'support', name: 'Support', description: 'Customer and driver support tasks', icon: User },
];

const FLEET_STATS: FleetStat[] = [
  { id: 'available', label: 'Available', count: 12, colorClass: 'text-emerald-400' },
  { id: 'active', label: 'In Use', count: 45, colorClass: 'text-primary-300' },
  { id: 'maintenance', label: 'Maintenance', count: 3, colorClass: 'text-rose-400' },
];

const ALERTS: AlertItem[] = [
  {
    id: 'a-1',
    title: 'Vehicle #402 requires cleaning',
    subtitle: 'Location: Terminal 2 • 14m ago',
  },
  {
    id: 'a-2',
    title: 'Driver app timeout increased in Athens region',
    subtitle: 'Operations monitor • 9m ago',
  },
  {
    id: 'a-3',
    title: 'Maintenance ticket #118 opened for EV charging',
    subtitle: 'Garage B • 4m ago',
  },
];

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeThread(raw: unknown): ChatThreadSummary {
  const value = raw as Partial<ChatThreadSummary>;
  return {
    id: String(value.id ?? crypto.randomUUID()),
    title: String(value.title ?? 'Untitled Chat'),
    status: String(value.status ?? 'active'),
    last_sync: String(value.last_sync ?? new Date().toISOString()),
  };
}

function normalizeMessage(raw: unknown, fallbackThreadId: string): ChatMessage {
  const value = raw as Partial<ChatMessage> & { role?: string };
  const createdAt = String(value.created_at ?? new Date().toISOString());
  const role = value.role === 'assistant' || value.role === 'system' ? value.role : 'user';

  return {
    id: String(value.id ?? crypto.randomUUID()),
    thread_id: String(value.thread_id ?? fallbackThreadId),
    role,
    content: String(value.content ?? ''),
    created_at: createdAt,
    timestamp: String(value.timestamp ?? formatTime(createdAt)),
    model: value.model,
    model_id: value.model_id,
  };
}

const MainApp = () => {
  const { i18n, t } = useTranslation();
  const { isLocked } = useVault();

  const [dbReady, setDbReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const [activeAgent, setActiveAgent] = useState('assistant');
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].id);

  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const language = i18n.language.toLowerCase().startsWith('el') ? 'el' : 'en';

  const activeThreadTitle = useMemo(() => {
    if (!activeThread) return t('common.new_chat');
    const thread = threads.find((item) => item.id === activeThread);
    return thread?.title ?? t('common.new_chat');
  }, [activeThread, t, threads]);

  const sortThreads = useCallback(
    (value: ChatThreadSummary[]) => value.sort((a, b) => Date.parse(b.last_sync) - Date.parse(a.last_sync)),
    [],
  );

  const upsertThread = useCallback(
    (thread: ChatThreadSummary) => {
      setThreads((previous) => sortThreads([thread, ...previous.filter((item) => item.id !== thread.id)]));
    },
    [sortThreads],
  );

  const persistThread = useCallback(
    async (thread: ChatThreadSummary) => {
      upsertThread(thread);
      if (dbReady) {
        await saveThreads([thread]);
      }
    },
    [dbReady, upsertThread],
  );

  const createThread = useCallback(
    async (titleSeed: string) => {
      const now = new Date().toISOString();
      const thread: ChatThreadSummary = {
        id: crypto.randomUUID(),
        title: titleSeed.slice(0, 60) || t('common.new_chat'),
        status: 'active',
        last_sync: now,
      };

      await persistThread(thread);
      setActiveThread(thread.id);
      return thread;
    },
    [persistThread, t],
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      await initDB();
      if (cancelled) return;

      setDbReady(true);
      const storedThreads = await getThreads();
      if (cancelled) return;

      const normalized = sortThreads(storedThreads.map(normalizeThread));
      setThreads(normalized);

      if (normalized.length > 0) {
        setActiveThread(normalized[0].id);
      }

      startOfflineSync();
    };

    void bootstrap();

    return () => {
      cancelled = true;
      stopOfflineSync();
    };
  }, [sortThreads]);

  useEffect(() => {
    if (!dbReady) return;

    if (!activeThread) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      const stored = await getMessagesByThread(activeThread);
      if (cancelled) return;

      const normalized = stored
        .map((message) => normalizeMessage(message, activeThread))
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      setMessages(normalized);
    };

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [activeThread, dbReady]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }

      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault();
        setRightPanelOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sendMutation = useMutation({
    mutationFn: async (payload: {
      threadId: string;
      content: string;
      threadTitle: string;
      userMessage: ChatMessage;
      assistantId: string;
      preferredModel: string;
      idempotencyKey: string;
    }) => {
      const { threadId, content, threadTitle, userMessage, assistantId, preferredModel, idempotencyKey } = payload;

      const startedAt = new Date().toISOString();
      await persistThread({
        id: threadId,
        title: threadTitle,
        status: 'active',
        last_sync: startedAt,
      });

      if (!navigator.onLine) {
        trackTelemetry('offline.chat.queued', { thread_id: threadId });
        await enqueueOfflineChatMessage({
          thread_id: threadId,
          content,
          preferred_model_id: preferredModel,
          idempotency_key: idempotencyKey,
        });

        const queuedAt = new Date().toISOString();
        setMessages((previous) =>
          previous.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: 'Request queued offline. It will be replayed automatically when online.',
                  created_at: queuedAt,
                  timestamp: formatTime(queuedAt),
                }
              : msg,
          ),
        );

        if (dbReady) {
          const queuedAssistant: MessageRecord = {
            id: assistantId,
            thread_id: threadId,
            role: 'assistant',
            content: 'Request queued offline. It will be replayed automatically when online.',
            created_at: queuedAt,
            model_id: preferredModel,
          };
          await saveMessages([userMessage, queuedAssistant]);
        }

        await persistThread({
          id: threadId,
          title: threadTitle,
          status: 'queued',
          last_sync: queuedAt,
        });
        return;
      }

      let streamed = '';
      let doneMeta: { model_id?: string; provider?: string; latency_ms?: number; fallbacks?: string[] } = {};

      await streamChatMessage(
        {
          thread_id: threadId,
          content,
          preferred_model_id: preferredModel,
          idempotencyKey,
        },
        {
          onToken: (token) => {
            streamed = streamed ? `${streamed} ${token}` : token;
            const now = new Date().toISOString();
            setMessages((previous) =>
              previous.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: streamed,
                      created_at: now,
                      timestamp: formatTime(now),
                    }
                  : msg,
              ),
            );
          },
          onDone: (meta) => {
            doneMeta = meta;
            trackTelemetry('chat.stream.done', { latency_ms: meta.latency_ms, provider: meta.provider });
          },
        },
      );

      const completedAt = new Date().toISOString();
      const assistantRecord: MessageRecord = {
        id: assistantId,
        thread_id: threadId,
        role: 'assistant',
        content: streamed || 'No output returned from model.',
        created_at: completedAt,
        model_id: doneMeta.model_id || preferredModel,
      };

      setMessages((previous) =>
        previous.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: assistantRecord.content,
                model: assistantRecord.model_id,
                model_id: assistantRecord.model_id,
                created_at: completedAt,
                timestamp: formatTime(completedAt),
              }
            : msg,
        ),
      );

      if (dbReady) {
        await saveMessages([userMessage, assistantRecord]);
      }

      await persistThread({
        id: threadId,
        title: threadTitle,
        status: 'active',
        last_sync: completedAt,
      });

      void apiRequest('/api/v1/slo/status').catch(() => undefined);
      trackTelemetry('chat.send.success', { thread_id: threadId, model_id: assistantRecord.model_id });
    },
    onError: (error, variables) => {
      const failedAt = new Date().toISOString();
      const reason = error instanceof Error ? error.message : String(error);
      trackTelemetry('chat.send.error', { reason, thread_id: variables.threadId });
      setMessages((previous) =>
        previous.map((msg) =>
          msg.id === variables.assistantId
            ? {
                ...msg,
                content: `Request failed: ${reason}`,
                created_at: failedAt,
                timestamp: formatTime(failedAt),
              }
            : msg,
        ),
      );
    },
    onSettled: () => {
      setIsStreaming(false);
    },
  });

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInputValue('');
    void createThread(t('common.new_chat'));
  }, [createThread, t]);

  const handleToggleLanguage = useCallback(() => {
    void i18n.changeLanguage(language === 'en' ? 'el' : 'en');
  }, [i18n, language]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isStreaming || sendMutation.isPending) return;

    const content = inputValue.trim();
    setInputValue('');

    const run = async () => {
      let threadId = activeThread;
      let threadTitle =
        threads.find((item) => item.id === activeThread)?.title ?? content.slice(0, 50) ?? t('common.new_chat');

      if (!threadId) {
        const createdThread = await createThread(content.slice(0, 50));
        threadId = createdThread.id;
        threadTitle = createdThread.title;
      }

      if (!threadId) {
        return;
      }

      const userCreatedAt = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        thread_id: threadId,
        role: 'user',
        content,
        created_at: userCreatedAt,
        timestamp: formatTime(userCreatedAt),
      };

      const assistantId = crypto.randomUUID();
      const assistantPlaceholder: ChatMessage = {
        id: assistantId,
        thread_id: threadId,
        role: 'assistant',
        content: '',
        created_at: userCreatedAt,
        timestamp: formatTime(userCreatedAt),
        model: selectedModel,
        model_id: selectedModel,
      };

      setMessages((previous) => [...previous, userMessage, assistantPlaceholder]);
      setIsStreaming(true);

      const idempotencyKey = `web-chat-${threadId}-${Date.now()}`;

      await sendMutation.mutateAsync({
        threadId,
        content,
        threadTitle,
        userMessage,
        assistantId,
        preferredModel: selectedModel,
        idempotencyKey,
      });
    };

    void run();
  }, [
    activeThread,
    createThread,
    inputValue,
    isStreaming,
    selectedModel,
    sendMutation,
    t,
    threads,
  ]);

  const handleCopy = useCallback((content: string) => {
    void navigator.clipboard.writeText(content);
  }, []);

  const handleRegenerate = useCallback(() => {
    if (isStreaming || !activeThread || messages.length === 0) return;

    const latestUser = [...messages].reverse().find((msg) => msg.thread_id === activeThread && msg.role === 'user');
    if (!latestUser) {
      return;
    }

    setInputValue(latestUser.content);
  }, [activeThread, isStreaming, messages]);

  if (isLocked) {
    return <PINScreen onUnlock={() => {}} />;
  }

  return (
    <div className="flex size-full overflow-hidden bg-[#08080f] font-['Inter',_sans-serif] text-slate-200">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-primary-600/[0.05] blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-indigo-600/[0.05] blur-[120px]" />
      </div>

      <div className="relative z-10 flex-shrink-0">
        <Sidebar
          chats={threads}
          activeChatId={activeThread}
          selectedModel={selectedModel}
          models={MODEL_OPTIONS}
          collapsed={sidebarCollapsed}
          language={language}
          onSelectChat={setActiveThread}
          onNewChat={handleNewChat}
          onModelChange={setSelectedModel}
          onToggle={() => setSidebarCollapsed((prev) => !prev)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onToggleLanguage={handleToggleLanguage}
        />
      </div>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/[0.06] bg-black/20 px-4 py-2 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <h3 className="max-w-xs truncate text-sm text-slate-100">{activeThreadTitle}</h3>
              <span className="rounded-full border border-primary-500/20 bg-primary-600/15 px-2 py-0.5 text-[10px] text-primary-200">
                {selectedModel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 transition-all hover:bg-white/[0.06]"
            >
              <Command className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">Search</span>
              <kbd className="rounded border border-white/[0.08] bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-500">⌘K</kbd>
            </button>
            <button
              onClick={() => setRightPanelOpen((prev) => !prev)}
              className={`rounded-lg p-1.5 transition-colors ${
                rightPanelOpen ? 'bg-primary-600/20 text-primary-300' : 'text-slate-400 hover:bg-white/[0.06]'
              }`}
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="border-b border-white/[0.06]">
          <AgentTabs activeAgent={activeAgent} agents={AGENTS} onAgentChange={setActiveAgent} />
        </div>

        <ChatArea
          messages={messages}
          isStreaming={isStreaming}
          onCopy={handleCopy}
          onRegenerate={handleRegenerate}
          onQuickAction={setInputValue}
        />

        <div className="px-4 pb-4 pt-2">
          <InputComposer
            value={inputValue}
            placeholder={t('chat.placeholder')}
            isStreaming={isStreaming || sendMutation.isPending}
            selectedModel={selectedModel}
            models={MODEL_OPTIONS}
            onChange={setInputValue}
            onSend={handleSend}
            onModelChange={setSelectedModel}
          />
          <div className="mt-2 flex items-center justify-center gap-3">
            <span className="text-[10px] text-slate-600">
              {t('chat.offline')} • {dbReady ? 'IndexedDB ready' : 'Initializing storage'}
            </span>
          </div>
        </div>
      </main>

      <div className="relative z-10 flex-shrink-0">
        <RightPanel isOpen={rightPanelOpen} fleetStats={FLEET_STATS} alerts={ALERTS} onClose={() => setRightPanelOpen(false)} />
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNewChat={handleNewChat}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        onToggleRightPanel={() => setRightPanelOpen((prev) => !prev)}
        onToggleLanguage={handleToggleLanguage}
      />
    </div>
  );
};

const App = () => (
  <VaultProvider>
    <MainApp />
  </VaultProvider>
);

export default App;
