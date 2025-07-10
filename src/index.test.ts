import { renderHook, act } from '@testing-library/react';
import { Response } from 'node-fetch';

import useManualCache, { cache_status, type cache_status_enum } from './useManualCache';

// Mock useLocalStorage
jest.mock('@blocdigital/uselocalstorage', () => {
  let store: Record<string, any> = {};
  return () => ({
    get: (key: string) => store[key],
    set: (key: string, value: any) => {
      store[key] = value;
    },
    remove: (key: string) => {
      delete store[key];
    },
    init: (key: string, value: any) => {
      store[key] = value;
    },
  });
});

// Mock window.caches
const cacheStore: Record<string, Map<string, Response>> = {};
const createMockResponse = (url: string) => new Response(`data for ${url}`, { status: 200 });

beforeAll(() => {
  Object.defineProperty(window, 'caches', {
    value: {
      open: jest.fn(async (name: string) => {
        if (!cacheStore[name]) cacheStore[name] = new Map();
        return {
          keys: jest.fn(async () => Array.from(cacheStore[name].keys()).map((url) => ({ url }))),
          match: jest.fn(async (url: string) => cacheStore[name].get(url)),
          addAll: jest.fn(async (urls: string[]) => {
            urls.forEach((url) => {
              cacheStore[name].set(url, createMockResponse(url));
            });
          }),
          delete: jest.fn(async (url: string) => cacheStore[name].delete(url)),
        };
      }),
    },
    configurable: true,
  });
});

beforeEach(() => {
  // Clear all mock storage and caches
  for (const key in cacheStore) delete cacheStore[key];
});

describe('useManualCache', () => {
  it('should initialise and expose expected API', () => {
    const { result } = renderHook(() => useManualCache());

    expect(result.current).toHaveProperty('getCache');
    expect(result.current).toHaveProperty('addCache');
    expect(result.current).toHaveProperty('removeCache');
    expect(result.current).toHaveProperty('removeByStoreName');
    expect(result.current).toHaveProperty('validateCache');
    expect(result.current).toHaveProperty('validateByStoreName');
  });

  it('addCache should add URLs to cache and localStorage', async () => {
    const { result } = renderHook(() => useManualCache());
    const urls = ['https://example.com/a', 'https://example.com/b'];
    const responses: Array<Response> = [];
    await act(async () => {
      responses.push(...(await result.current.addCache('test-cache', urls)));
    });

    expect(responses).toHaveLength(2);
    expect(responses[0]).toBeInstanceOf(Response);
    expect(responses[1]).toBeInstanceOf(Response);
  });

  it('getCache should retrieve cached response', async () => {
    const { result } = renderHook(() => useManualCache());
    const url = 'https://example.com/a';
    await act(async () => {
      await result.current.addCache('test-cache', [url]);
    });
    let response: Response | undefined = undefined;
    await act(async () => {
      response = await result.current.getCache('test-cache', url);
    });

    expect(response).toBeInstanceOf(Response);
    const text = await response.text();
    expect(text).toContain('data for');
  });

  it('removeCache should remove a URL from cache and localStorage', async () => {
    const { result } = renderHook(() => useManualCache());
    const url = 'https://example.com/a';
    await act(async () => {
      await result.current.addCache('test-cache', [url]);
    });
    let removed: boolean = false;
    await act(async () => {
      removed = await result.current.removeCache('test-cache', url);
    });

    expect(removed).toBe(true);

    // Should not be in cache anymore
    let response: Response | undefined = undefined;
    await act(async () => {
      response = await result.current.getCache('test-cache', url);
    });

    expect(response).toBeUndefined();
  });

  it('validateCache should return correct status', async () => {
    const { result } = renderHook(() => useManualCache());
    const url = 'https://example.com/a';
    let status: cache_status_enum | undefined = undefined;
    await act(async () => {
      status = await result.current.validateCache('test-cache', url);
    });
    expect(status).toBe(cache_status.NOT_CACHED);

    await act(async () => {
      await result.current.addCache('test-cache', [url]);
    });
    await act(async () => {
      status = await result.current.validateCache('test-cache', url);
    });
    expect(status).toBe(cache_status.VALID);
  });

  it('removeByStoreName should remove all URLs in a store', async () => {
    const { result } = renderHook(() => useManualCache());
    const urls = ['https://example.com/a', 'https://example.com/b'];
    await act(async () => {
      await result.current.addCache('test-cache', urls);
    });
    const removed: Array<{ url: string; removed: boolean }> = [];
    await act(async () => {
      removed.push(...(await result.current.removeByStoreName('test-cache', undefined)));
    });
    expect(removed).toHaveLength(2);
    expect(removed[0].removed).toBe(true);
    expect(removed[1].removed).toBe(true);
  });

  it('validateByStoreName should validate all URLs in a store', async () => {
    const { result } = renderHook(() => useManualCache());
    const urls = ['https://example.com/a', 'https://example.com/b'];
    await act(async () => {
      await result.current.addCache('test-cache', urls);
    });
    let statuses: Array<{ url: string; status: cache_status_enum }> = [];
    await act(async () => {
      statuses = await result.current.validateByStoreName('test-cache');
    });
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toHaveProperty('url');
    expect([cache_status.VALID, cache_status.INVALID, cache_status.NOT_CACHED]).toContain(statuses[0].status);
  });

  it('should handle empty cache gracefully', async () => {
    const { result } = renderHook(() => useManualCache());
    let response: Response | undefined = undefined;
    await act(async () => {
      response = await result.current.getCache('empty-cache', 'https://example.com/a');
    });

    expect(response).toBeUndefined();

    let status: cache_status_enum | undefined = undefined;
    await act(async () => {
      status = await result.current.validateCache('empty-cache', 'https://example.com/a', { storeName: 'empty-cache' });
    });

    expect(status).toBe(cache_status.NOT_CACHED);

    let statusList: Array<{ url: string; status: cache_status_enum }> | undefined = undefined;
    await act(async () => {
      statusList = await result.current.validateByStoreName('empty-cache', 'empty-cache');
    });

    expect(statusList).toEqual([]);
  });
});
