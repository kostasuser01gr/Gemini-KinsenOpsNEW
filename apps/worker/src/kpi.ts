import { Env } from './types';

export async function rollupKpis(env: Env, date: string, locationId: string) {
  // Simple synchronous rollup
  const [revRes, utilRes] = await Promise.all([
    env.DB.prepare(`
      SELECT SUM(json_extract(price_breakdown_json, '$.total')) as total_rev, COUNT(*) as count 
      FROM bookings 
      WHERE date(start_at) = ? AND vehicle_id IN (SELECT id FROM vehicles WHERE location_id = ?)
      AND status != 'cancelled'
    `).bind(date, locationId).first(),
    
    env.DB.prepare(`
      SELECT COUNT(*) as cancellations 
      FROM bookings 
      WHERE date(start_at) = ? AND vehicle_id IN (SELECT id FROM vehicles WHERE location_id = ?)
      AND status = 'cancelled'
    `).bind(date, locationId).first()
  ]);

  const rev = (revRes?.total_rev as number) || 0;
  const count = (revRes?.count as number) || 0;
  const cancellations = (utilRes?.cancellations as number) || 0;

  await env.DB.prepare(`
    INSERT INTO daily_kpis (date, location_id, revenue, bookings_count, cancellations)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date, location_id) DO UPDATE SET
      revenue = excluded.revenue,
      bookings_count = excluded.bookings_count,
      cancellations = excluded.cancellations,
      created_at = CURRENT_TIMESTAMP
  `).bind(date, locationId, rev, count, cancellations).run();
}
