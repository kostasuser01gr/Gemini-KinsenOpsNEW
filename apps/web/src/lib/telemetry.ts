interface TelemetryEvent {
  name: string;
  ts: string;
  data?: Record<string, unknown>;
}

const STORAGE_KEY = 'ops.telemetry.buffer';

function readBuffer(): TelemetryEvent[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as TelemetryEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBuffer(events: TelemetryEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-200)));
}

export function trackTelemetry(name: string, data?: Record<string, unknown>) {
  const event: TelemetryEvent = {
    name,
    ts: new Date().toISOString(),
    data,
  };
  const buffer = readBuffer();
  buffer.push(event);
  writeBuffer(buffer);
  console.log(JSON.stringify({ level: 'info', kind: 'telemetry', ...event }));
}

export function flushTelemetry(): TelemetryEvent[] {
  const buffer = readBuffer();
  writeBuffer([]);
  return buffer;
}
