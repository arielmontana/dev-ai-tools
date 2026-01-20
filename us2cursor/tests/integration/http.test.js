import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, httpGet, httpGetText, httpPost } from '../../lib/http.js';

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns response on success', async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve({ data: 'test' }) };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const res = await fetchWithTimeout('https://api.test.com', {}, 5000);
    expect(res.ok).toBe(true);
  });

  it('passes options to fetch', async () => {
    const mockResponse = { ok: true };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await fetchWithTimeout('https://api.test.com', {
      method: 'POST',
      headers: { 'X-Custom': 'value' }
    }, 5000);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Custom': 'value' }
      })
    );
  });

  it('includes abort signal in fetch options', async () => {
    const mockResponse = { ok: true };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await fetchWithTimeout('https://api.test.com', {}, 5000);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com',
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    );
  });

  it('clears timeout after successful response', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const mockResponse = { ok: true };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await fetchWithTimeout('https://api.test.com', {}, 5000);

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

describe('httpGet', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns JSON on successful response', async () => {
    const mockData = { id: 1, name: 'test' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData)
    });

    const result = await httpGet('https://api.test.com', {});
    expect(result).toEqual(mockData);
  });

  it('passes headers to fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    await httpGet('https://api.test.com', { 'Authorization': 'Bearer token' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com',
      expect.objectContaining({
        headers: { 'Authorization': 'Bearer token' }
      })
    );
  });

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found')
    });

    await expect(httpGet('https://api.test.com', {}))
      .rejects.toThrow('HTTP 404: Not found');
  });

  it('throws on 500 error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error')
    });

    await expect(httpGet('https://api.test.com', {}))
      .rejects.toThrow('HTTP 500: Internal Server Error');
  });

  it('throws on 401 unauthorized', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized')
    });

    await expect(httpGet('https://api.test.com', {}))
      .rejects.toThrow('HTTP 401: Unauthorized');
  });
});

describe('httpGetText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns text on successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('file content here')
    });

    const result = await httpGetText('https://api.test.com', {});
    expect(result).toBe('file content here');
  });

  it('returns null on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });

    const result = await httpGetText('https://api.test.com', {});
    expect(result).toBeNull();
  });

  it('passes headers to fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('')
    });

    await httpGetText('https://api.test.com', { 'X-Custom': 'value' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com',
      expect.objectContaining({
        headers: { 'X-Custom': 'value' }
      })
    );
  });
});

describe('httpPost', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns JSON on successful response', async () => {
    const mockData = { success: true };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData)
    });

    const result = await httpPost('https://api.test.com', {}, { data: 'test' });
    expect(result).toEqual(mockData);
  });

  it('sends POST method', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    await httpPost('https://api.test.com', {}, {});

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('sets Content-Type to application/json', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    await httpPost('https://api.test.com', {}, {});

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    );
  });

  it('merges custom headers with Content-Type', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    await httpPost('https://api.test.com', { 'Authorization': 'Bearer token' }, {});

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com',
      expect.objectContaining({
        headers: {
          'Authorization': 'Bearer token',
          'Content-Type': 'application/json'
        }
      })
    );
  });

  it('stringifies body as JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    const body = { name: 'test', count: 42 };
    await httpPost('https://api.test.com', {}, body);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com',
      expect.objectContaining({
        body: JSON.stringify(body)
      })
    );
  });

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad Request')
    });

    await expect(httpPost('https://api.test.com', {}, {}))
      .rejects.toThrow('HTTP 400: Bad Request');
  });

  it('throws on 403 forbidden', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden')
    });

    await expect(httpPost('https://api.test.com', {}, {}))
      .rejects.toThrow('HTTP 403: Forbidden');
  });
});
