import { useState, type ReactNode } from 'react';
import {
  Bookmark,
  Check,
  Copy,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { MessageBubbleProps } from './types';

export function MessageBubble({ message, onCopy, onRegenerate }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const isAssistant = message.role === 'assistant';

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleCodeCopy = (code: string, blockId: string) => {
    void navigator.clipboard.writeText(code);
    setCodeCopied(blockId);
    window.setTimeout(() => setCodeCopied(null), 1600);
  };

  const renderInline = (text: string) => {
    const boldParts = text.split(/(\*\*.*?\*\*)/g);
    return boldParts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <span key={i} className="font-semibold text-slate-100">
            {part.slice(2, -2)}
          </span>
        );
      }

      const codeParts = part.split(/(`[^`]+`)/g);
      return codeParts.map((codePart, j) => {
        if (codePart.startsWith('`') && codePart.endsWith('`')) {
          return (
            <code
              key={`${i}-${j}`}
              className="rounded-md bg-primary-500/10 px-1.5 py-0.5 text-xs text-primary-300"
            >
              {codePart.slice(1, -1)}
            </code>
          );
        }
        return <span key={`${i}-${j}`}>{codePart}</span>;
      });
    });
  };

  const renderContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).split('\n');
        const language = lines[0] || 'text';
        const code = lines.slice(1).join('\n');
        const blockId = `${message.id}-${index}`;

        return (
          <div
            key={blockId}
            className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#090c14]"
          >
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-xs text-slate-400">{language}</span>
              <button
                onClick={() => handleCodeCopy(code, blockId)}
                className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
              >
                {codeCopied === blockId ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="overflow-x-auto p-3">
              <code className="text-xs text-emerald-300">{code}</code>
            </pre>
          </div>
        );
      }

      return (
        <span key={`${message.id}-content-${index}`}>
          {part.split('\n').map((line, lineIdx) => (
            <span key={`${message.id}-line-${lineIdx}`}>
              {lineIdx > 0 && <br />}
              {renderInline(line)}
            </span>
          ))}
        </span>
      );
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative flex gap-3 px-4 py-4 ${isAssistant ? '' : 'flex-row-reverse'}`}
    >
      <div className="mt-1 shrink-0">
        {isAssistant ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-900/30">
            <Sparkles className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.08] text-xs font-bold text-slate-200">
            U
          </div>
        )}
      </div>

      <div className={`min-w-0 flex-1 ${isAssistant ? 'max-w-[85%]' : 'max-w-[75%]'}`}>
        <div className={`mb-1.5 flex items-center gap-2 ${isAssistant ? '' : 'flex-row-reverse'}`}>
          <span className="text-sm text-slate-200">{isAssistant ? message.model ?? 'Rental AI Core' : 'You'}</span>
          <span className="text-[10px] text-slate-500">{message.timestamp}</span>
        </div>

        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isAssistant
              ? 'border border-white/[0.08] bg-white/[0.03] text-slate-100'
              : 'border border-primary-500/20 bg-primary-600/20 text-white'
          }`}
        >
          {renderContent(message.content)}
        </div>

        {hovered && !isAssistant && (
          <div className="mt-1.5 flex items-center justify-end gap-1">
            <ActionButton
              icon={copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              onClick={handleCopy}
              title="Copy"
            />
          </div>
        )}

        {hovered && isAssistant && (
          <div className="mt-1.5 flex items-center gap-1">
            <ActionButton
              icon={copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              onClick={handleCopy}
              title="Copy"
            />
            {onRegenerate && (
              <ActionButton
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={onRegenerate}
                title="Regenerate"
              />
            )}
            <ActionButton icon={<ThumbsUp className="h-3.5 w-3.5" />} onClick={() => {}} title="Good" />
            <ActionButton icon={<ThumbsDown className="h-3.5 w-3.5" />} onClick={() => {}} title="Bad" />
            <ActionButton icon={<Bookmark className="h-3.5 w-3.5" />} onClick={() => {}} title="Save" />
            <ActionButton icon={<MoreHorizontal className="h-3.5 w-3.5" />} onClick={() => {}} title="More" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ActionButton({
  icon,
  onClick,
  title,
}: {
  icon: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-white/[0.06] hover:text-slate-200"
    >
      {icon}
    </button>
  );
}

export function StreamingIndicator() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 px-4 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-900/30">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
              className="h-2 w-2 rounded-full bg-primary-400"
            />
          ))}
        </div>
        <span className="text-sm text-slate-400">Thinking...</span>
      </div>
    </motion.div>
  );
}
