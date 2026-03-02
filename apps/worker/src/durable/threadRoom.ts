export class ThreadRoom {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/presence')) {
      const online = (await this.state.storage.get<number>('online')) || 0;
      return new Response(JSON.stringify({ ok: true, online }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname.endsWith('/join') && request.method === 'POST') {
      const online = ((await this.state.storage.get<number>('online')) || 0) + 1;
      await this.state.storage.put('online', online);
      return new Response(JSON.stringify({ ok: true, online }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname.endsWith('/leave') && request.method === 'POST') {
      const online = Math.max(((await this.state.storage.get<number>('online')) || 0) - 1, 0);
      await this.state.storage.put('online', online);
      return new Response(JSON.stringify({ ok: true, online }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }
}
