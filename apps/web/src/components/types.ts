import type { ElementType } from 'react';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  timestamp: string;
  model?: string;
  model_id?: string;
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  status: string;
  last_sync: string;
}

export interface ChatModelOption {
  id: string;
  name: string;
  icon: string;
  tier: string;
}

export interface AgentOption {
  id: string;
  name: string;
  description: string;
  icon: ElementType;
}

export interface FleetStat {
  id: string;
  label: string;
  count: number;
  colorClass: string;
}

export interface AlertItem {
  id: string;
  title: string;
  subtitle: string;
}

export interface SidebarProps {
  chats: ChatThreadSummary[];
  activeChatId: string | null;
  selectedModel: string;
  models: ChatModelOption[];
  collapsed: boolean;
  language: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onModelChange: (model: string) => void;
  onToggle: () => void;
  onOpenCommandPalette: () => void;
  onToggleLanguage: () => void;
}

export interface AgentTabsProps {
  activeAgent: string;
  agents: AgentOption[];
  onAgentChange: (agent: string) => void;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  onCopy: (content: string) => void;
  onRegenerate?: () => void;
}

export interface ChatAreaProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onCopy: (content: string) => void;
  onRegenerate: () => void;
  onQuickAction: (prompt: string) => void;
}

export interface InputComposerProps {
  value: string;
  placeholder: string;
  isStreaming: boolean;
  selectedModel: string;
  models: ChatModelOption[];
  onChange: (value: string) => void;
  onSend: () => void;
  onModelChange: (model: string) => void;
}

export interface RightPanelProps {
  isOpen: boolean;
  fleetStats: FleetStat[];
  alerts: AlertItem[];
  onClose: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
  onToggleLanguage: () => void;
}
