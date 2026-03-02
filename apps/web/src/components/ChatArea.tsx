import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Code2, Globe, Sparkles, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageBubble, StreamingIndicator } from './MessageBubble';
import type { ChatAreaProps } from './types';

const quickActions = [
  { label: 'Check fleet status', icon: Zap, prompt: 'Check luxury fleet status' },
  { label: 'Maintenance report', icon: Code2, prompt: 'Staff maintenance report' },
  { label: 'Send dispatch alert', icon: Globe, prompt: 'Send alert to drivers' },
  { label: 'Run system audit', icon: Bot, prompt: 'System health audit' },
];

const PAGE_SIZE = 200;

export function ChatArea({ messages, isStreaming, onCopy, onRegenerate, onQuickAction }: ChatAreaProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount((prev) => (messages.length > prev ? prev : Math.min(PAGE_SIZE, messages.length || PAGE_SIZE)));
  }, [messages.length]);

  const startIdx = Math.max(0, messages.length - visibleCount);
  const visibleMessages = useMemo(() => messages.slice(startIdx), [messages, startIdx]);

  const rowCount = visibleMessages.length + (isStreaming ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 132,
    overscan: 6,
  });

  useEffect(() => {
    virtualizer.scrollToIndex(Math.max(rowCount - 1, 0), { align: 'end' });
  }, [rowCount, virtualizer]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-2xl text-center"
        >
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary-500/30 bg-primary-600/15">
            <Sparkles className="h-8 w-8 text-primary-400" />
          </div>

          <h2 className="mb-2 text-3xl font-black tracking-tight text-white">How can I help you today?</h2>
          <p className="mb-8 text-sm text-slate-400">Choose a quick action or start a new chat.</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {quickActions.map((action, index) => (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.06 }}
                onClick={() => onQuickAction(action.prompt)}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition-all hover:border-primary-500/40 hover:bg-primary-500/10"
              >
                <div className="mb-2 flex items-center gap-2 text-primary-400">
                  <action.icon className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wide">{action.label}</span>
                </div>
                <p className="text-sm text-slate-300">{action.prompt}</p>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {startIdx > 0 && (
        <div className="px-4 pb-2 pt-3 text-center">
          <button
            onClick={() => setVisibleCount((count) => Math.min(messages.length, count + PAGE_SIZE))}
            className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.07]"
          >
            Load older messages ({startIdx} hidden)
          </button>
        </div>
      )}

      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl py-4" style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const isStreamingRow = isStreaming && virtualRow.index === visibleMessages.length;
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {isStreamingRow ? (
                  <StreamingIndicator />
                ) : (
                  <MessageBubble
                    message={visibleMessages[virtualRow.index]}
                    onCopy={onCopy}
                    onRegenerate={visibleMessages[virtualRow.index]?.role === 'assistant' ? onRegenerate : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
