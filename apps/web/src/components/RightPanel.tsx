import { useState } from 'react';
import type { ElementType } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Layers,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { RightPanelProps } from './types';

type TabId = 'fleet' | 'alerts' | 'health';

const tabs: Array<{ id: TabId; label: string; icon: ElementType }> = [
  { id: 'fleet', label: 'Fleet', icon: BarChart3 },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'health', label: 'Health', icon: ShieldCheck },
];

export function RightPanel({ isOpen, fleetStats, alerts, onClose }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('fleet');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex h-full flex-col overflow-hidden border-l border-white/[0.06] bg-black/20 backdrop-blur-xl"
          style={{ minWidth: 0 }}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary-300" />
              <span className="text-sm text-slate-200">Context Panel</span>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex border-b border-white/[0.06]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs transition-all ${
                  activeTab === tab.id ? 'text-primary-300' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {activeTab === tab.id && (
                  <motion.div layoutId="rightPanelTab" className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary-500" />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <AnimatePresence mode="wait">
              {activeTab === 'fleet' && (
                <motion.div key="fleet" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-3">
                  {fleetStats.map((stat) => {
                    const total = fleetStats.reduce((sum, item) => sum + item.count, 0);
                    const width = total > 0 ? Math.round((stat.count / total) * 100) : 0;

                    return (
                      <div key={stat.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{stat.label}</span>
                          <span className={`text-lg font-black ${stat.colorClass}`}>{stat.count}</span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-black/30">
                          <div className={`h-full ${stat.colorClass.replace('text', 'bg')}`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              )}

              {activeTab === 'alerts' && (
                <motion.div key="alerts" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-2">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="mb-1 flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-400" />
                        <p className="text-xs text-slate-200">{alert.title}</p>
                      </div>
                      <p className="pl-5 text-[11px] text-slate-500">{alert.subtitle}</p>
                    </div>
                  ))}
                </motion.div>
              )}

              {activeTab === 'health' && (
                <motion.div key="health" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-2">
                  <HealthRow icon={CheckCircle2} label="Worker Runtime" value="Operational" valueClass="text-emerald-400" />
                  <HealthRow icon={Wrench} label="Maintenance Queue" value="3 pending" valueClass="text-amber-400" />
                  <HealthRow icon={Clock} label="Last Sync" value="< 1 min" valueClass="text-primary-300" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function HealthRow({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: ElementType;
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className={`text-sm font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}
