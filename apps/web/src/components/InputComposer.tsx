import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ChevronDown,
  Globe,
  HardDrive,
  Paperclip,
  Send,
  Slash,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { InputComposerProps } from './types';

const slashCommands = [
  { cmd: '/fleet', desc: 'Fleet insights' },
  { cmd: '/support', desc: 'Support workflow' },
  { cmd: '/audit', desc: 'System audit checklist' },
  { cmd: '/summary', desc: 'Summarize updates' },
];

export function InputComposer({
  value,
  placeholder,
  isStreaming,
  selectedModel,
  models,
  onChange,
  onSend,
  onModelChange,
}: InputComposerProps) {
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (value === '/') {
      setShowSlashMenu(true);
      return;
    }
    if (!value.startsWith('/') || value.includes(' ')) {
      setShowSlashMenu(false);
    }
  }, [value]);

  const currentModel = models.find((model) => model.id === selectedModel) ?? models[0];

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isStreaming && value.trim()) {
        onSend();
        setAttachments([]);
      }
    }
  };

  const handleSlashSelect = (command: string) => {
    onChange(`${command} `);
    setShowSlashMenu(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <AnimatePresence>
        {showSlashMenu && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10131d]/95 shadow-xl"
          >
            <div className="border-b border-white/[0.06] px-3 py-2 text-xs text-slate-400">Commands</div>
            {slashCommands.map((command) => (
              <button
                key={command.cmd}
                onClick={() => handleSlashSelect(command.cmd)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
              >
                <Slash className="h-4 w-4 text-primary-300" />
                <div>
                  <div className="text-sm text-slate-100">{command.cmd}</div>
                  <div className="text-xs text-slate-500">{command.desc}</div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModelPicker && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10131d]/95 shadow-xl"
          >
            <div className="border-b border-white/[0.06] px-3 py-2 text-xs text-slate-400">Select Model</div>
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  onModelChange(model.id);
                  setShowModelPicker(false);
                }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.05] ${
                  selectedModel === model.id ? 'bg-primary-500/10' : ''
                }`}
              >
                <span>{model.icon}</span>
                <span className="text-sm text-slate-100">{model.name}</span>
                <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-400">
                  {model.tier}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl transition-all hover:border-white/[0.14] focus-within:border-primary-500/40">
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 px-4 pt-3">
                {attachments.map((file, index) => (
                  <div
                    key={file}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5"
                  >
                    <Paperclip className="h-3 w-3 text-slate-500" />
                    <span className="text-xs text-slate-400">{file}</span>
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                      className="rounded p-0.5 text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-slate-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 px-4 py-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (!isStreaming && value.trim()) {
                onSend();
                setAttachments([]);
              }
            }}
            disabled={!value.trim() || isStreaming}
            className={`shrink-0 rounded-xl p-2 transition-all ${
              value.trim() && !isStreaming
                ? 'bg-primary-600 text-white hover:bg-primary-500'
                : 'cursor-not-allowed bg-white/[0.05] text-slate-500'
            }`}
          >
            <Send className="h-4 w-4" />
          </motion.button>
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowModelPicker((prev) => !prev)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/[0.04]"
            >
              <span className="text-xs">{currentModel.icon}</span>
              <span className="text-xs text-slate-300">{currentModel.name}</span>
              <ChevronDown className="h-3 w-3 text-slate-500" />
            </button>

            <div className="mx-1 h-4 w-px bg-white/[0.08]" />

            <button
              onClick={() => setAttachments((prev) => [...prev, `attachment_${prev.length + 1}.pdf`])}
              className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-white/[0.04] hover:text-slate-300"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <button className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-white/[0.04] hover:text-slate-300" title="Web mode">
              <Globe className="h-4 w-4" />
            </button>

            <button className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-white/[0.04] hover:text-slate-300" title="Vault mode">
              <HardDrive className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Sparkles className="h-3 w-3 text-primary-400" />
            <span>Secure runtime enabled</span>
          </div>
        </div>
      </div>
    </div>
  );
}
