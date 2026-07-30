import { renderHook, act } from '@testing-library/react';

import useManualCache, { cache_status, type cache_status_enum } from './useManualCache';

// Mock useLocalStorage
const store: Record<string, unknown> = {};
let staleReadsAfterWrite = false;
let staleReadsRemaining = 0;
const faultedReadKeys = new Set<string>();
const storage = {
  get: (key: string) => {
    if (faultedReadKeys.has(key)) return null;
    if (staleReadsRemaining > 0) {
      staleReadsRemaining -= 1;

      return null;
    }

    return store[key];
  },
  set: (key: string, value: unknown) => {
    store[key] = value;
    if (staleReadsAfterWrite) staleReadsRemaining = 10;
  },
  remove: (key: string) => {
    delete store[key];
  },
  init: (key: string, value: unknown) => {
    store[key] = value;
  },
};
jest.mock('@blocdigital/uselocalstorage', () => {
  return {
    __esModule: true,
    default: () => storage,
    StorageEvents: {
      acquire: () => storage,
      release: jest.fn(),
    },
  };
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
          put: jest.fn(async (url: string, response: Response) => {
            cacheStore[name].set(url, response);
          }),
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

beforeAll(() => {
  Object.defineProperty(global, 'Response', {
    value: class Response {
      body: string;
      status: number;
      ok: boolean;

      constructor(body: string = '', init: { status?: number } = {}) {
        this.body = body;
        this.status = init.status || 200;
        this.ok = this.status >= 200 && this.status < 300;
      }

      async text() {
        return this.body;
      }
    },
    configurable: true,
  });
  Object.defineProperty(global, 'fetch', {
    value: jest.fn(async (url: RequestInfo | URL) => {
      const urlString = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;

      return createMockResponse(urlString);
    }),
    configurable: true,
  });
});

beforeEach(() => {
  // Clear all mock storage and caches
  for (const key in cacheStore) delete cacheStore[key];
  for (const key in store) delete store[key];
  staleReadsAfterWrite = false;
  staleReadsRemaining = 0;
  faultedReadKeys.clear();
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
    const responses: Array<Response | undefined> = [];
    await act(async () => {
      responses.push(...(await result.current.addCache('test-cache', urls)));
    });

    expect(responses).toHaveLength(2);
    expect(responses[0]).toBeInstanceOf(Response);
    expect(responses[1]).toBeInstanceOf(Response);
  });

  it('addCache should not purge fresh assets when storage reads are stale after writes', async () => {
    const { result } = renderHook(() => useManualCache());
    const url = 'https://example.com/ios-webkit';
    let response: Response | undefined;
    staleReadsAfterWrite = true;

    await act(async () => {
      [response] = await result.current.addCache('test-cache', [url]);
    });

    expect(response).toBeInstanceOf(Response);
    expect(cacheStore['test-cache'].has(url)).toBe(true);
  });

  it('should skip destructive cache tidying when the store list cannot be read', async () => {
    const { result } = renderHook(() => useManualCache());
    const trackedUrl = 'https://example.com/tracked';
    const untrackedUrl = 'https://example.com/untracked';

    await act(async () => {
      await result.current.addCache('test-cache', [trackedUrl], { storeName: 'box1' });
    });
    cacheStore['test-cache'].set(untrackedUrl, createMockResponse(untrackedUrl));
    faultedReadKeys.add('bd_boxes');

    await act(async () => {
      await result.current.healByStoreName('box1');
    });

    expect(cacheStore['test-cache'].has(trackedUrl)).toBe(true);
    expect(cacheStore['test-cache'].has(untrackedUrl)).toBe(true);
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
    const text = await response!.text();
    expect(text).toContain('data for');
  });

  it('getCacheByStoreName should retrieve an array of cached responses', async () => {
    const { result } = renderHook(() => useManualCache());
    const urls = ['https://example.com/a', 'https://example.com/b'];
    await act(async () => {
      await result.current.addCache('getCacheByStoreName', urls, { storeName: 'getCacheByStoreName' });
    });
    let response: Array<Response | undefined> = [];
    await act(async () => {
      response = await result.current.getCacheByStoreName('getCacheByStoreName');
    });

    expect(response.length).toBe(2);
    expect(response[0]).toBeInstanceOf(Response);
    expect(response[1]).toBeInstanceOf(Response);
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

    console.log(url, removed);

    expect(removed).toBe(true);

    // Should not be in cache anymore
    let response: Response | undefined = undefined;
    await act(async () => {
      response = await result.current.getCache('test-cache', url);
    });

    expect(response).toBeUndefined();
  });

  it('removeCache should preserve URLs referenced by another box when writes make reads stale', async () => {
    const { result } = renderHook(() => useManualCache());
    const url = 'https://example.com/shared';

    await act(async () => {
      await result.current.addCache('test-cache', [url], { storeName: 'box1' });
      await result.current.addCache('test-cache', [url], { storeName: 'box2' });
    });

    let removed = true;
    staleReadsAfterWrite = true;
    await act(async () => {
      removed = await result.current.removeCache('test-cache', url, { storeName: 'box1' });
    });

    expect(removed).toBe(false);
    expect(cacheStore['test-cache'].has(url)).toBe(true);
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
      removed.push(...(await result.current.removeByStoreName()));
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
      statuses = await result.current.validateByStoreName();
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
      statusList = await result.current.validateByStoreName('empty-cache');
    });

    expect(statusList).toEqual([]);

    let removed: boolean | undefined = undefined;
    await act(async () => {
      removed = await result.current.removeCache('empty-cache', 'https://example.com/a', { storeName: 'empty-cache' });
    });

    expect(removed).toBe(false);

    let removedList: Array<{ url: string; removed: boolean }> | undefined = undefined;
    await act(async () => {
      removedList = await result.current.removeByStoreName('empty-cache');
    });

    expect(removedList).toEqual([]);
  });

  it('getCacheNameByStoreName returns the correct cache name', async () => {
    const { result } = renderHook(() => useManualCache());
    const cacheName = 'test-cache';
    await act(async () => {
      await result.current.addCache(cacheName, ['https://example.com/a'], { storeName: 'test-store' });
    });
    let name: string | undefined = undefined;
    await act(async () => {
      name = result.current.getCacheNameByStoreName('test-store');
    });

    expect(name).toBe(cacheName);
  });

  it('getCacheByStoreName returns all cached responses for a box', async () => {
    const { result } = renderHook(() => useManualCache());
    const urls = ['https://example.com/a', 'https://example.com/b'];
    await act(async () => {
      await result.current.addCache('test-cache', urls, { storeName: 'box1' });
    });
    let responses: Array<Response | undefined> = [];
    await act(async () => {
      responses = await result.current.getCacheByStoreName('box1');
    });
    expect(responses).toHaveLength(2);
    expect(responses[0]).toBeInstanceOf(Response);
    expect(responses[1]).toBeInstanceOf(Response);
  });

  it('healByStoreName re-adds missing/invalid URLs to the cache', async () => {
    const { result } = renderHook(() => useManualCache());
    const urls = ['https://example.com/a', 'https://example.com/b'];
    await act(async () => {
      await result.current.addCache('test-cache', urls, { storeName: 'box1' });
    });
    // Simulate a missing cache entry
    const cache = await window.caches.open('test-cache');
    cache.delete('https://example.com/a');
    // Now heal
    await act(async () => {
      await result.current.healByStoreName('box1');
    });
    let responses: Array<Response | undefined> = [];
    await act(async () => {
      responses = await result.current.getCacheByStoreName('box1');
    });
    expect(responses[0]).toBeInstanceOf(Response);
    expect(responses[1]).toBeInstanceOf(Response);
  });

  it('healAll runs healByStoreName for all boxes', async () => {
    const { result } = renderHook(() => useManualCache());
    const urls1 = ['https://example.com/a'];
    const urls2 = ['https://example.com/b'];
    await act(async () => {
      await result.current.addCache('test-cache', urls1, { storeName: 'box1' });
      await result.current.addCache('test-cache', urls2, { storeName: 'box2' });
    });
    // Simulate a missing cache entry in both boxes
    const cache = await window.caches.open('test-cache');
    cache.delete('https://example.com/a');
    cache.delete('https://example.com/b');
    // Now heal all
    await act(async () => {
      await result.current.healAll();
    });
    let responses1: Array<Response | undefined> = [];
    let responses2: Array<Response | undefined> = [];
    await act(async () => {
      responses1 = await result.current.getCacheByStoreName('box1');
      responses2 = await result.current.getCacheByStoreName('box2');
    });
    expect(responses1[0]).toBeInstanceOf(Response);
    expect(responses2[0]).toBeInstanceOf(Response);
  });
});
