import { IRequest, Router, error, json, createCors } from 'itty-router';
import { Env, Action } from './types';
import { withAuth, withCorrelationId, requirePermission } from './middleware';
import { logAudit } from './audit';
import { calculateQuote, QuoteRequest, PricingRule } from './pricing';
import { canTransition } from './bookings';
import { rollupKpis } from './kpi';
import { getCached } from './cache';

const { preflight, corsify } = createCors({
  origins: ['*'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  headers: ['*'] // To allow cf-access-jwt-assertion
});

const router = Router<IRequest, [Env, ExecutionContext]>();

router.all('*', preflight);
router.all('*', withCorrelationId);

// --- AUTH ---
router.post('/api/auth/login', async (req, env: Env) => {
  const { email, password } = await req.json() as any;
  const stmt = env.DB.prepare(`SELECT id, role FROM users WHERE email = ? AND password_hash = ?`);
  const user = await stmt.bind(email, password).first();
  if (!user) {
    await logAudit(env, 'system', 'login_failed', 'auth', null, { email }, req.correlationId);
    return error(401, 'Invalid credentials');
  }
  await logAudit(env, user.id as string, 'login_success', 'auth', null, {}, req.correlationId);
  return json({ token: user.id, role: user.role });
});

// --- FLEET (Cached & Audit) ---
router.get('/api/fleet/search', withAuth, requirePermission('fleet:read'), async (req, env: Env) => {
  return await getCached(req as any, async () => {
    const url = new URL(req.url);
    const location = url.searchParams.get('location');
    const vClass = url.searchParams.get('class');
    
    let query = 'SELECT * FROM vehicles WHERE status = "available"';
    const params: any[] = [];
    if (vClass) {
      query += ' AND class = ?';
      params.push(vClass);
    }
    const { results } = await env.DB.prepare(query).bind(...params).all();
    return json(results) as any;
  });
});

// --- PRICING ENGINE (Deterministic Quote) ---
router.post('/api/quote', withAuth, requirePermission('bookings:read'), async (req, env: Env) => {
  const quoteReq = await req.json() as QuoteRequest;
  const { results } = await env.DB.prepare('SELECT * FROM pricing_rules WHERE active = 1 ORDER BY priority DESC').all();
  const quote = calculateQuote(quoteReq, results as unknown as PricingRule[]);
  return json(quote);
});

// --- BOOKINGS (State Machine) ---
router.post('/api/bookings', withAuth, requirePermission('bookings:write'), async (req, env: Env) => {
  const data = await req.json() as any;
  const id = 'bk_' + Date.now();
  
  await env.DB.prepare(`
    INSERT INTO bookings (id, customer_name, customer_phone, vehicle_id, start_at, end_at, status, price_breakdown_json)
    VALUES (?, ?, ?, ?, ?, ?, 'requested', ?)
  `).bind(id, data.customer_name, data.customer_phone, data.vehicle_id, data.start_at, data.end_at, JSON.stringify(data.price_breakdown)).run();
  
  await env.DB.prepare(`INSERT INTO booking_events (id, booking_id, event_type, payload_json) VALUES (?, ?, ?, ?)`)
    .bind('ev_' + Date.now(), id, 'status_changed', JSON.stringify({ from: null, to: 'requested' })).run();
  
  await logAudit(env, req.userId, 'create', 'booking', id, { vehicle_id: data.vehicle_id }, req.correlationId);
  return json({ id });
});

router.patch('/api/bookings/:id/status', withAuth, requirePermission('bookings:write'), async (req, env: Env) => {
  const { id } = req.params;
  const { status } = await req.json() as { status: string };
  
  const booking = await env.DB.prepare('SELECT status, vehicle_id, start_at FROM bookings WHERE id = ?').bind(id).first();
  if (!booking) return error(404, 'Booking not found');
  
  if (!canTransition(booking.status as string, status)) {
    return error(400, `Invalid transition from ${booking.status} to ${status}`);
  }
  
  await env.DB.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(status, id).run();
  
  await env.DB.prepare(`INSERT INTO booking_events (id, booking_id, event_type, payload_json) VALUES (?, ?, ?, ?)`)
    .bind('ev_' + Date.now(), id, 'status_changed', JSON.stringify({ from: booking.status, to: status })).run();
    
  if (status === 'picked_up') {
    await env.DB.prepare("UPDATE vehicles SET status = 'rented' WHERE id = ?").bind(booking.vehicle_id).run();
  } else if (status === 'returned' || status === 'cancelled') {
    await env.DB.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").bind(booking.vehicle_id).run();
  }
  
  const dateStr = (booking.start_at as string).split('T')[0];
  const vehicle = await env.DB.prepare('SELECT location_id FROM vehicles WHERE id = ?').bind(booking.vehicle_id).first();
  if (vehicle) {
    req.waitUntil?.(rollupKpis(env, dateStr, vehicle.location_id as string));
  }
  
  await logAudit(env, req.userId, 'update_status', 'booking', id, { from: booking.status, to: status }, req.correlationId);
  return json({ success: true });
});

router.get('/api/bookings/:id', withAuth, requirePermission('bookings:read'), async (req, env: Env) => {
  const { id } = req.params;
  const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  if (!booking) return error(404);
  
  await logAudit(env, req.userId, 'read_sensitive', 'booking', id, { fields: ['customer_phone'] }, req.correlationId);
  return json(booking);
});

// --- ADMIN ENDPOINTS ---
router.get('/api/admin/audit', withAuth, requirePermission('audit:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
  return json(results);
});

router.get('/api/admin/audit/export.csv', withAuth, requirePermission('audit:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000').all();
  let csv = 'id,user_id,action,entity,entity_id,correlation_id,created_at\n';
  results.forEach((r: any) => {
    csv += `${r.id},${r.user_id},${r.action},${r.entity},${r.entity_id},${r.correlation_id},${r.created_at}\n`;
  });
  return new Response(csv, { headers: { 'Content-Type': 'text/csv' } });
});

router.post('/api/admin/kpis/recompute', withAuth, requirePermission('kpis:write'), async (req, env: Env) => {
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  if (!date) return error(400, 'date required');
  
  const { results } = await env.DB.prepare('SELECT id FROM locations').all();
  for (const loc of results) {
    await rollupKpis(env, date, loc.id as string);
  }
  await logAudit(env, req.userId, 'recompute', 'kpis', null, { date }, req.correlationId);
  return json({ success: true });
});

router.get('/api/admin/macros', withAuth, requirePermission('macros:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM macros').all();
  return json(results);
});

router.post('/api/admin/macros', withAuth, requirePermission('macros:write'), async (req, env: Env) => {
  const data = await req.json() as any;
  const id = 'mac_' + Date.now();
  await env.DB.prepare(`INSERT INTO macros (id, title, body, tags_json, visibility_role) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, data.title, data.body, JSON.stringify(data.tags || []), data.visibility_role || 'agent').run();
  await logAudit(env, req.userId, 'create', 'macro', id, { title: data.title }, req.correlationId);
  return json({ id });
});

// --- CHAT ENGINE (Mode A) ---
router.post('/api/chat/messages', withAuth, async (req, env: Env) => {
  const { thread_id, content } = await req.json() as any;
  const msgId = 'msg_' + Date.now();
  
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)').bind(msgId, thread_id, 'user', content).run();
  
  // Pluggable models check (DEFAULT disabled)
  let reply = "I'm not sure how to help with that. Use the booking Tool Panel to proceed.";
  let toolData = null;

  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('quote') || lowerContent.includes('price')) {
    const { results } = await env.DB.prepare('SELECT * FROM pricing_rules WHERE active = 1 ORDER BY priority DESC').all();
    const mockQuoteReq: QuoteRequest = {
      startAt: new Date().toISOString(), endAt: new Date(Date.now() + 86400000).toISOString(),
      basePriceDay: 50, deposit: 200, locationId: 'loc_1', vehicleClass: 'compact'
    };
    const quote = calculateQuote(mockQuoteReq, results as unknown as PricingRule[]);
    reply = "Here is a quote based on your request. Check the Tool Panel.";
    toolData = { type: 'quote_card', data: quote };
  } else if (lowerContent.includes('book')) {
    reply = "You can initiate a booking from the Tool Panel.";
    toolData = { type: 'booking_card' };
  } else {
    // FTS search
    const { results: kbResults } = await env.DB.prepare('SELECT title, snippet(kb_fts, -1, "**", "**", "...", 64) as snippet FROM kb_fts WHERE kb_fts MATCH ? LIMIT 1').bind(content.replace(/[^a-zA-Z0-9 ]/g, ' ')).all();
    if (kbResults.length > 0) {
      reply = `According to our KB (${kbResults[0].title}):\n\n${kbResults[0].snippet}`;
    }
  }
  
  const assistantMsgId = 'msg_' + (Date.now() + 1);
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)').bind(assistantMsgId, thread_id, 'assistant', JSON.stringify({ text: reply, tool: toolData })).run();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: reply, toolData })}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
});

router.all('*', () => error(404));

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) =>
    router.handle(req, env, ctx).then(corsify).catch(async e => {
      console.error(e);
      return corsify(error(500, e.message));
    }),
};