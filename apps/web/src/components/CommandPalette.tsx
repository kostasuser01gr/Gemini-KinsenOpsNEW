import { useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Command,
  Globe,
  Layers,
  MessageSquare,
  PanelLeftClose,
  PanelRightClose,
  Search,
} from 'lucide-react';
import type { CommandPaletteProps } from './types';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  category: string;
  icon: ElementType;
  action: () => void;
  shortcut?: string;
}

export function CommandPalette({
  isOpen,
  onClose,
  onNewChat,
  onToggleSidebar,
  onToggleRightPanel,
  onToggleLanguage,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: 'new-chat',
        label: 'New Chat',
        description: 'Start a new conversation',
        category: 'Chat',
        icon: MessageSquare,
        action: onNewChat,
        shortcut: '⌘N',
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        description: 'Collapse or expand sidebar',
        category: 'Layout',
        icon: PanelLeftClose,
        action: onToggleSidebar,
        shortcut: '⌘B',
      },
      {
        id: 'toggle-right',
        label: 'Toggle Right Panel',
        description: 'Open or close context panel',
        category: 'Layout',
        icon: PanelRightClose,
        action: onToggleRightPanel,
        shortcut: '⌘\\',
      },
      {
        id: 'toggle-language',
        label: 'Toggle Language',
        description: 'Switch EN/EL locale',
        category: 'Settings',
        icon: Globe,
        action: onToggleLanguage,
      },
      {
        id: 'focus-search',
        label: 'Search Commands',
        description: 'Focus command search',
        category: 'Navigation',
        icon: Search,
        action: () => inputRef.current?.focus(),
      },
    ],
    [onNewChat, onToggleLanguage, onToggleRightPanel, onToggleSidebar],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.description.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower),
    );
  }, [commands, query]);

  const categories = useMemo(() => [...new Set(filtered.map((command) => command.category))], [filtered]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const command = filtered[selectedIndex];
        if (command) {
          command.action();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, isOpen, onClose, selectedIndex]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-[20%] z-[101] w-full max-w-lg -translate-x-1/2"
          >
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10131d]/95 shadow-2xl">
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
                <Command className="h-4 w-4 text-primary-300" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Type a command..."
                  className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                />
                <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-500">ESC</kbd>
              </div>

              <div className="max-h-80 overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">No results found</div>
                ) : (
                  categories.map((category) => (
                    <div key={category}>
                      <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-slate-500">{category}</div>
                      {filtered
                        .filter((command) => command.category === category)
                        .map((command) => {
                          const globalIndex = filtered.indexOf(command);
                          const selected = globalIndex === selectedIndex;

                          return (
                            <button
                              key={command.id}
                              onClick={() => {
                                command.action();
                                onClose();
                              }}
                              onMouseEnter={() => setSelectedIndex(globalIndex)}
                              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                selected ? 'bg-primary-500/10' : 'hover:bg-white/[0.04]'
                              }`}
                            >
                              <command.icon className={`h-4 w-4 ${selected ? 'text-primary-300' : 'text-slate-500'}`} />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-slate-100">{command.label}</div>
                                <div className="truncate text-xs text-slate-500">{command.description}</div>
                              </div>
                              {command.shortcut ? (
                                <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-500">
                                  {command.shortcut}
                                </kbd>
                              ) : (
                                selected && <ArrowRight className="h-3.5 w-3.5 text-primary-300/70" />
                              )}
                            </button>
                          );
                        })}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  ↑↓ navigate
                </span>
                <span>↵ select</span>
                <span>esc close</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
