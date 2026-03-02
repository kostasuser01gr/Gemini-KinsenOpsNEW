export interface QuoteRequest {
  startAt: string; // ISO date
  endAt: string; // ISO date
  basePriceDay: number;
  deposit: number;
  locationId: string;
  vehicleClass: string;
  addOns?: string[];
  promoCode?: string;
}

export interface PricingRule {
  id: string;
  name: string;
  priority: number;
  rule_json: string;
}

export interface RuleJson {
  type: 'discount' | 'tax' | 'addon';
  valueType: 'percentage' | 'fixed';
  value: number;
  conditions?: {
    locationId?: string;
    vehicleClass?: string;
    minDays?: number;
    promoCode?: string;
    addOnId?: string;
  };
}

export interface QuoteBreakdown {
  days: number;
  baseTotal: number;
  discounts: number;
  addOnsTotal: number;
  taxes: number;
  total: number;
  deposit: number;
  currency: string;
  appliedRules: string[];
}

export function calculateQuote(req: QuoteRequest, activeRules: PricingRule[]): QuoteBreakdown {
  const start = new Date(req.startAt).getTime();
  const end = new Date(req.endAt).getTime();
  const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  
  let baseTotal = days * req.basePriceDay;
  let discounts = 0;
  let addOnsTotal = 0;
  let taxes = 0;
  const appliedRules: string[] = [];

  // Sort rules by priority desc
  const sortedRules = [...activeRules].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    let parsed: RuleJson;
    try {
      parsed = JSON.parse(rule.rule_json);
    } catch { continue; }

    const cond = parsed.conditions || {};
    let matches = true;

    if (cond.locationId && cond.locationId !== req.locationId) matches = false;
    if (cond.vehicleClass && cond.vehicleClass !== req.vehicleClass) matches = false;
    if (cond.minDays && days < cond.minDays) matches = false;
    if (cond.promoCode && cond.promoCode !== req.promoCode) matches = false;
    if (cond.addOnId && (!req.addOns || !req.addOns.includes(cond.addOnId))) matches = false;

    if (matches) {
      appliedRules.push(rule.name);
      
      let amount = 0;
      if (parsed.valueType === 'percentage') {
        amount = baseTotal * (parsed.value / 100);
      } else {
        amount = parsed.type === 'addon' ? parsed.value * days : parsed.value;
      }

      if (parsed.type === 'discount') {
        discounts += amount;
      } else if (parsed.type === 'addon') {
        addOnsTotal += amount;
      } else if (parsed.type === 'tax') {
        taxes += amount;
      }
    }
  }

  const subtotal = baseTotal - discounts + addOnsTotal;
  // Let's assume taxes apply to subtotal
  const calculatedTaxes = taxes > 0 ? taxes : 0; 
  // If rule had tax percentage, it might be added differently. 
  // For simplicity, if taxes is an absolute value we add it. 
  // If it was percentage calculated earlier, it's in 'taxes'.

  const total = subtotal + calculatedTaxes;

  return {
    days,
    baseTotal,
    discounts,
    addOnsTotal,
    taxes: calculatedTaxes,
    total,
    deposit: req.deposit,
    currency: 'USD',
    appliedRules
  };
}
