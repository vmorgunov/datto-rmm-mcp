import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function importFreshApi() {
  vi.resetModules();
  return await import('../src/datto-api.js');
}

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  const mock = vi.fn();
  for (const r of responses) {
    const isString = typeof r.body === 'string';
    const text = isString ? (r.body as string) : JSON.stringify(r.body);
    mock.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => text,
      json: async () => (isString ? JSON.parse(text || '{}') : r.body),
    });
  }
  vi.stubGlobal('fetch', mock);
  return mock;
}

beforeEach(() => {
  process.env.DATTO_API_KEY = 'test-key';
  process.env.DATTO_API_SECRET = 'test-secret';
  process.env.DATTO_PLATFORM = 'merlot';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DattoApi.getToken', () => {
  it('requests an OAuth token with password grant', async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: 'tok-1', expires_in: 3600 } },
      { status: 200, body: { hello: 'world' } },
    ]);

    const { DattoApi } = await importFreshApi();
    const api = new DattoApi();
    await api.apiCall('GET', '/v2/account');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [authUrl, authInit] = fetchMock.mock.calls[0];
    expect(authUrl).toBe('https://merlot-api.centrastage.net/auth/oauth/token');
    expect(authInit.method).toBe('POST');
    expect(authInit.body).toContain('grant_type=password');
    expect(authInit.body).toContain('username=test-key');
    expect(authInit.body).toContain('password=test-secret');
    expect(authInit.headers.Authorization).toMatch(/^Basic /);
  });

  it('reuses a cached token within TTL', async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: 'tok-cache', expires_in: 3600 } },
      { status: 200, body: { call: 1 } },
      { status: 200, body: { call: 2 } },
    ]);

    const { DattoApi } = await importFreshApi();
    const api = new DattoApi();
    await api.apiCall('GET', '/v2/account');
    await api.apiCall('GET', '/v2/account');

    const tokenRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/oauth/token'),
    );
    expect(tokenRequests).toHaveLength(1);
  });

  it('throws when auth fails', async () => {
    mockFetchSequence([{ status: 401, body: 'invalid credentials' }]);

    const { DattoApi } = await importFreshApi();
    const api = new DattoApi();
    await expect(api.apiCall('GET', '/v2/account')).rejects.toThrow(/Auth failed \(401\)/);
  });
});

describe('DattoApi.apiCall', () => {
  it('targets the platform-specific base URL with /api prefix', async () => {
    process.env.DATTO_PLATFORM = 'pinotage';
    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
      { status: 200, body: { ok: true } },
    ]);

    const { DattoApi } = await importFreshApi();
    const api = new DattoApi();
    await api.apiCall('GET', '/v2/account');

    const apiCallUrl = fetchMock.mock.calls[1][0];
    expect(apiCallUrl).toBe('https://pinotage-api.centrastage.net/api/v2/account');
  });

  it('falls back to merlot for unknown platform', async () => {
    process.env.DATTO_PLATFORM = 'nonexistent';
    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
      { status: 200, body: {} },
    ]);

    const { DattoApi } = await importFreshApi();
    const api = new DattoApi();
    await api.apiCall('GET', '/v2/account');

    const apiCallUrl = fetchMock.mock.calls[1][0];
    expect(apiCallUrl).toMatch(/^https:\/\/merlot-api\.centrastage\.net\//);
  });

  it('returns success object on 204 No Content', async () => {
    mockFetchSequence([
      { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
      { status: 204, body: '' },
    ]);

    const { DattoApi } = await importFreshApi();
    const api = new DattoApi();
    const result = await api.apiCall('DELETE', '/v2/account/variable/123');
    expect(result).toEqual({ success: true });
  });

  it('serialises body as JSON for write requests', async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
      { status: 200, body: { id: 'new' } },
    ]);

    const { DattoApi } = await importFreshApi();
    const api = new DattoApi();
    await api.apiCall('PUT', '/v2/account/variable', { name: 'foo', value: 'bar' });

    const init = fetchMock.mock.calls[1][1];
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ name: 'foo', value: 'bar' });
  });

  it('throws with status code on 4xx errors', async () => {
    mockFetchSequence([
      { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
      { status: 404, body: 'Not Found' },
    ]);

    const { DattoApi } = await importFreshApi();
    const api = new DattoApi();
    await expect(api.apiCall('GET', '/v2/site/missing')).rejects.toThrow(/API error \(404\)/);
  });
});
