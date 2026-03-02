export interface QuoteRequest {
  startAt: string;
  endAt: string;
  basePriceDay: number;
  deposit: number;
  locationId: string;
  vehicleClass: string;
  addOns?: string[];
}

export interface PricingRule {
  id: string;
  name: string;
  priority: number;
  rule_json: string;
}

interface RuleDefinition {
  type: 'discount' | 'addon';
  valueType: 'percentage' | 'fixed';
  value: number;
  conditions?: {
    vehicleClass?: string;
    addOnId?: string;
  };
}

export interface QuoteResult {
  days: number;
  baseTotal: number;
  discounts: number;
  addOnsTotal: number;
  total: number;
  deposit: number;
}

function parseRule(rule: PricingRule): RuleDefinition | null {
  try {
    return JSON.parse(rule.rule_json) as RuleDefinition;
  } catch {
    return null;
  }
}

function calculateDays(startAt: string, endAt: string): number {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 1;
  }

  const diffMs = end - start;
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(days, 1);
}

export function calculateQuote(req: QuoteRequest, rules: PricingRule[]): QuoteResult {
  const days = calculateDays(req.startAt, req.endAt);
  const baseTotal = req.basePriceDay * days;

  let discounts = 0;
  let addOnsTotal = 0;

  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  for (const rule of sorted) {
    const def = parseRule(rule);
    if (!def) {
      continue;
    }

    const vehicleMatch = !def.conditions?.vehicleClass || def.conditions.vehicleClass === req.vehicleClass;
    const addOnMatch =
      !def.conditions?.addOnId || (req.addOns || []).includes(def.conditions.addOnId);

    if (!vehicleMatch || !addOnMatch) {
      continue;
    }

    const baseValue = def.valueType === 'percentage' ? (baseTotal * def.value) / 100 : def.value;

    if (def.type === 'discount') {
      discounts += baseValue;
      continue;
    }

    if (def.type === 'addon') {
      addOnsTotal += def.valueType === 'fixed' ? baseValue * days : baseValue;
    }
  }

  return {
    days,
    baseTotal,
    discounts,
    addOnsTotal,
    total: baseTotal - discounts + addOnsTotal,
    deposit: req.deposit,
  };
}
