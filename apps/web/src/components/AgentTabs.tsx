import { useState } from 'react';
import { Cloud, HardDrive } from 'lucide-react';
import { motion } from 'motion/react';
import type { AgentTabsProps } from './types';

export function AgentTabs({ activeAgent, agents, onAgentChange }: AgentTabsProps) {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const activeMeta = agents.find((agent) => agent.id === hoveredAgent);

  return (
    <div className="w-full">
      <div className="flex items-center gap-1 overflow-x-auto px-4 py-2 no-scrollbar">
        {agents.map((agent) => {
          const isActive = activeAgent === agent.id;

          return (
            <button
              key={agent.id}
              onClick={() => onAgentChange(agent.id)}
              onMouseEnter={() => setHoveredAgent(agent.id)}
              onMouseLeave={() => setHoveredAgent(null)}
              className={`relative flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs transition-all ${
                isActive
                  ? 'border border-primary-500/30 bg-primary-600/15 text-primary-200'
                  : 'border border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <agent.icon className="h-3.5 w-3.5" />
              <span>{agent.name}</span>
              {isActive && <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              {isActive && (
                <motion.div
                  layoutId="activeAgentIndicator"
                  className="absolute inset-0 -z-10 rounded-xl border border-primary-500/20 bg-primary-500/10"
                />
              )}
            </button>
          );
        })}
      </div>

      {activeMeta && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mx-4 mb-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
        >
          <div className="mb-2 flex items-center gap-2">
            <activeMeta.icon className="h-4 w-4 text-primary-300" />
            <span className="text-sm text-slate-100">{activeMeta.name}</span>
            <span className="text-[10px] text-slate-500">{activeMeta.description}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Cloud className="h-3 w-3 text-blue-400" />
              <span className="text-[10px] text-slate-400">Cloud</span>
            </div>
            <div className="flex items-center gap-1">
              <HardDrive className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] text-slate-400">Vault Ready</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
