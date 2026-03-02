import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  Command,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SidebarProps } from './types';

function formatSyncTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Sidebar({
  chats,
  activeChatId,
  selectedModel,
  models,
  collapsed,
  language,
  onSelectChat,
  onNewChat,
  onModelChange,
  onToggle,
  onOpenCommandPalette,
  onToggleLanguage,
}: SidebarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [showModels, setShowModels] = useState(false);

  const filteredChats = useMemo(() => {
    const lower = query.toLowerCase().trim();
    if (!lower) return chats;
    return chats.filter((chat) => chat.title.toLowerCase().includes(lower));
  }, [chats, query]);

  const currentModel = models.find((model) => model.id === selectedModel) ?? models[0];

  if (collapsed) {
    return (
      <motion.aside
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 56, opacity: 1 }}
        className="flex h-full flex-col items-center gap-3 border-r border-white/[0.06] bg-black/20 py-4 backdrop-blur-xl"
      >
        <button
          onClick={onToggle}
          className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/[0.06]"
          title="Expand sidebar"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
        <button
          onClick={onNewChat}
          className="rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-500"
          title={t('common.new_chat')}
        >
          <Plus className="h-5 w-5" />
        </button>
      </motion.aside>
    );
  }

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex h-full flex-col border-r border-white/[0.06] bg-black/20 backdrop-blur-xl"
      style={{ width: 280 }}
    >
      <div className="px-4 pb-2 pt-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">Rental Master</span>
          </div>
          <button onClick={onToggle} className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-white/[0.06]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-current">
              <rect x="2" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="9" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        <button
          onClick={onNewChat}
          className="group flex w-full items-center gap-2 rounded-xl border border-primary-500/30 bg-primary-600/15 px-3 py-2.5 transition-all hover:border-primary-500/50 hover:bg-primary-600/25"
        >
          <Plus className="h-4 w-4 text-primary-300" />
          <span className="text-sm text-primary-100">{t('common.new_chat')}</span>
          <span className="ml-auto rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-400">⌘N</span>
        </button>

        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('common.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary-500/40 focus:outline-none"
          />
        </div>

        <button
          onClick={onOpenCommandPalette}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-slate-300 transition-all hover:bg-white/[0.05]"
        >
          <span className="flex items-center gap-2">
            <Command className="h-3.5 w-3.5" />
            Command palette
          </span>
          <kbd className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-400">⌘K</kbd>
        </button>

        <div className="relative mt-3">
          <button
            onClick={() => setShowModels((prev) => !prev)}
            className="flex w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
          >
            <span className="text-sm">{currentModel.icon}</span>
            <span className="text-sm text-slate-200">{currentModel.name}</span>
            <span className="ml-auto rounded-full bg-primary-500/20 px-1.5 py-0.5 text-[10px] text-primary-200">
              {currentModel.tier}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          </button>

          <AnimatePresence>
            {showModels && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131d]/95 shadow-xl"
              >
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onModelChange(model.id);
                      setShowModels(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] ${
                      selectedModel === model.id ? 'bg-primary-500/10' : ''
                    }`}
                  >
                    <span>{model.icon}</span>
                    <span className="text-sm text-slate-200">{model.name}</span>
                    <span className="ml-auto text-[10px] text-slate-400">{model.tier}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Conversations</div>
        <div className="space-y-1">
          {filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`w-full rounded-xl px-3 py-2.5 text-left transition-all ${
                chat.id === activeChatId
                  ? 'border border-primary-500/30 bg-primary-600/15 text-primary-100'
                  : 'border border-transparent text-slate-300 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{chat.title}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">{formatSyncTime(chat.last_sync)}</p>
                </div>
              </div>
            </button>
          ))}
          {filteredChats.length === 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center text-xs text-slate-500">
              No chats found
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t border-white/[0.06] p-4">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <span>Language</span>
          <button onClick={onToggleLanguage} className="text-primary-300">
            {language.toUpperCase()}
          </button>
        </div>
        <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-100">
          <Settings className="h-4 w-4" />
          System Settings
        </button>
      </div>
    </motion.aside>
  );
}
