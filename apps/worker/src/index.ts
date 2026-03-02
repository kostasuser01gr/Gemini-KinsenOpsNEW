import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SignJWT, jwtVerify } from 'jose';

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  JAIL: KVNamespace;
  BACKUPS: R2Bucket;
  STRICT_FREE_MODE: string;
  SESSION_SECRET: string;
  MCP_API_KEY: string;
  HF_API_TOKEN: string; // Hugging Face for Neural-Link
}

const app = new Hono<{ Bindings: Env }>();

// --- Aegis Module: Forensic Chain Logic ---
async function logToAegis(env: Env, action: string, actorId: string, metadata: any) {
  const lastEntry: any = await env.DB.prepare('SELECT entry_hash FROM forensic_chain ORDER BY id DESC LIMIT 1').first();
  const prevHash = lastEntry ? lastEntry.entry_hash : '0000000000000000';
  const dataToHash = `${prevHash}|${action}|${actorId}|${JSON.stringify(metadata)}`;
  const entryHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataToHash))
    .then(b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''));
  
  await env.DB.prepare('INSERT INTO forensic_chain (action, actor_id, prev_hash, entry_hash, metadata_json) VALUES (?, ?, ?, ?, ?)')
    .bind(action, actorId, prevHash, entryHash, JSON.stringify(metadata)).run();
}

// --- Middlewares ---
app.use('*', cors({ origin: '*', credentials: true }));

const withAuth = async (c: any, next: any) => {
  const token = c.req.header('Cookie')?.match(/session=([^;]+)/)?.[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(c.env.SESSION_SECRET));
    c.set('user', payload);
    await next();
  } catch { return c.json({ error: 'Unauthorized' }, 401); }
};

// --- Neural-Link: Real AI Integration ---
app.post('/api/chat/message', withAuth, async (c) => {
  const { thread_id, content } = await c.req.json();
  const user = c.get('user');

  // Aegis logging
  c.executionCtx.waitUntil(logToAegis(c.env, 'AI_QUERY', user.userId, { thread_id }));

  // Call Hugging Face (Free Inference)
  const hfRes = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.env.HF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: `Staff member ${user.name} asks: ${content}. Respond as RentalMaster AI Assistant.` }),
  });
  
  const hfData: any = await hfRes.json();
  const aiResponse = hfData[0]?.generated_text || "I am processing your request. System is healthy.";

  await c.env.DB.prepare('INSERT INTO ai_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), thread_id, 'assistant', aiResponse).run();

  return c.json({ response: aiResponse });
});

// --- Edge-Sync: Real-Time SSE ---
app.get('/api/sync/pulse', async (c) => {
  return streamSSE(c, async (stream) => {
    while (true) {
      const stats: any = await c.env.DB.prepare('SELECT COUNT(*) as c FROM fleet WHERE status = "Available"').first();
      await stream.writeSSE({
        data: JSON.stringify({ available_cars: stats.c, ts: Date.now() }),
        event: 'pulse',
        id: Date.now().toString(),
      });
      await stream.sleep(5000); // 5s pulse
    }
  });
});

// --- Zero-Knowledge Message Routing ---
app.post('/api/messages/secure-send', withAuth, async (c) => {
  const { receiver_id, encrypted_content, iv } = await c.req.json();
  const sender = c.get('user');
  
  await c.env.DB.prepare('INSERT INTO private_messages (id, sender_id, receiver_id, content, iv, is_encrypted) VALUES (?, ?, ?, ?, ?, 1)')
    .bind(crypto.randomUUID(), sender.userId, receiver_id, encrypted_content, iv).run();
  
  c.executionCtx.waitUntil(logToAegis(c.env, 'MSG_SEND', sender.userId, { receiver_id }));
  return c.json({ success: true });
});

// --- Fleet & Visual-Twin ---
app.post('/api/fleet/upload-damage', withAuth, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  const fleetId = formData.get('fleet_id') as string;
  
  const r2Key = `fleet/${fleetId}/damage_${Date.now()}.jpg`;
  await c.env.BACKUPS.put(r2Key, await file.arrayBuffer());
  
  await c.env.DB.prepare('INSERT INTO fleet_media (id, fleet_id, r2_key, media_type) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), fleetId, r2Key, 'damage').run();
    
  return c.json({ success: true, key: r2Key });
});

export default app;
