export async function getCached(req: Request, fetcher: () => Promise<Response>) {
  const cache = caches.default;
  const cacheKey = new Request(req.url, req);
  let response = await cache.match(cacheKey);
  
  if (!response) {
    response = await fetcher();
    // Cache for 1 minute for read-heavy routes to avoid hitting D1 limits
    response.headers.set('Cache-Control', 'public, max-age=60');
    await cache.put(cacheKey, response.clone());
  }
  return response;
}
