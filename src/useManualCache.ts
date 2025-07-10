'use client';

import { useCallback, useEffect, useMemo } from 'react';
import useLocalStorage from '@blocdigital/uselocalstorage';

const STORE_NAME = 'bd_cached';
const STORE_LIST = 'bd_boxes';

/**
 * Checks if the [Cache API](https://developer.mozilla.org/docs/Web/API/Cache) is supported in the current environment.
 *
 * @returns {boolean} True if manual cache is supported, otherwise false.
 */
const checkSupport = (): boolean => {
  const supported = typeof window !== 'undefined' && 'caches' in window;
  if (!supported) console.warn('Manual cache is not supported in this environment.');

  return supported;
};

/**
 * Removes all cached requests from a named cache except those in the `keep` list.
 * Uses the [CacheStorage](https://developer.mozilla.org/docs/Web/API/CacheStorage) API.
 *
 * @param {string[]} keep - List of URLs to keep in the cache.
 * @param {string} cacheName - Name of the cache to open.
 * @returns {Promise<void>} Resolves when old cache entries are cleared.
 */
const clearOld = async (keep: string[], cacheName: string): Promise<void> => {
  if (!checkSupport()) return;

  try {
    const cacheStorage = await window.caches.open(cacheName);
    const keepSet = new Set(keep);

    await cacheStorage.keys().then((keys) =>
      Promise.all(
        keys.reduce<Array<Promise<boolean>>>((list, key) => {
          return keepSet.has(key.url) ? list : [cacheStorage.delete(key), ...list];
        }, []),
      ),
    );
  } catch (err) {
    console.warn(`Error clearing cache ${cacheName}:`, err);
  }
};

/**
 * Converts a URL string to an absolute path using an anchor element.
 *
 * @param {string} url - The URL string to convert.
 * @returns {string} The absolute path URL.
 * @see https://developer.mozilla.org/docs/Web/API/HTMLAnchorElement
 */
const absolutePath = (url: string): string => {
  const link = document.createElement('a');
  link.href = url;

  return link.protocol + '//' + link.host + link.pathname + link.search + link.hash;
};

const getCache: ManualCacheFunctions['getCache'] = async (
  cacheName: string,
  url: string,
): Promise<Response | undefined> => {
  if (!checkSupport()) return;

  const cache = await window.caches.open(cacheName);

  return cache.match(absolutePath(url));
};

export const cache_status = Object.freeze({ NOT_CACHED: 0, INVALID: 1, VALID: 2 });
export type cache_status_enum = (typeof cache_status)[keyof typeof cache_status];

interface ManualCacheFunctions {
  /**
   * Fetches a [Response](https://developer.mozilla.org/docs/Web/API/Response) from a named cache for a given URL.
   *
   * @param {string} cacheName - The name of the cache to open.
   * @param {string} url - The URL to fetch from the cache.
   * @returns {Promise<Response | undefined>} The cached response, or undefined if not found.
   */
  getCache: (cacheName: string, url: string) => Promise<Response | undefined>;
  /**
   * Adds new URLs to a named cache and tracks them in localStorage.
   * Uses [Cache.addAll()](https://developer.mozilla.org/docs/Web/API/Cache/addAll) to fetch and store resources.
   *
   * @param {string} cacheName - The name of the cache to use.
   * @param {string[]} urls - Array of URL strings to cache.
   * @param {Object} [options] - Optional settings.
   * @param {string} [options.storeName="bd_cached"] - Name for localStorage tracking.
   * @returns {Promise<Array<Response | undefined>>} Array of network responses.
   */
  addCache: (
    cacheName: string,
    urls: string[],
    options?: { storeName: string },
  ) => Promise<Array<Response | undefined>>;
  /**
   * Removes a single URL from a named cache and updates localStorage tracking.
   *
   * @param {string} cacheName - The name of the cache to use.
   * @param {string} url - The URL to remove from the cache.
   * @param {Object} [options] - Optional settings.
   * @param {string} [options.storeName="bd_cached"] - Name for localStorage tracking.
   * @returns {Promise<boolean>} True if the cache was changed, false otherwise.
   */
  removeCache: (cacheName: string, url: string, options?: { storeName?: string }) => Promise<boolean>;
  /**
   * Removes all URLs in a localStorage box from the cache, only deleting URLs not referenced in other boxes.
   *
   * @param {string} cacheName - The name of the cache to use.
   * @param {string} [storeName="bd_cached"] - Name for localStorage tracking. Default: "bd_cached".
   * @returns {Promise<Array<{ url: string; removed: boolean }>>} Array of each URL in the box with removal status.
   */
  removeByStoreName: (cacheName: string, storeName?: string) => Promise<Array<{ url: string; removed: boolean }>>;
  /**
   * Validates a single cached URL by checking both localStorage and the [Cache API](https://developer.mozilla.org/docs/Web/API/Cache).
   *
   * @param {string} cacheName - The name of the cache to use.
   * @param {string} url - The URL to validate.
   * @param {Object} [options] - Optional settings.
   * @param {string} [options.storeName="bd_cached"] - Name for localStorage tracking.
   * @returns {Promise<cache_status_enum>} The cache status of the item.
   */
  validateCache: (cacheName: string, url: string, options?: { storeName: string }) => Promise<cache_status_enum>;
  /**
   * Validates all URLs in a localStorage box, returning their cache status.
   *
   * @param {string} cacheName - The name of the cache to use.
   * @param {string} [storeName="bd_cached"] - Name for localStorage tracking. Default: "bd_cached".
   * @returns {Promise<Array<{ url: string; status: cache_status_enum }>>} Array of each URL in the box with its cache status.
   */
  validateByStoreName: (
    cacheName: string,
    storeName?: string,
  ) => Promise<Array<{ url: string; status: cache_status_enum }>>;
}

type BoxDescription = {
  cacheName: string;
  urls: string[];
};

export default function useManualCache(vault: string[] = [], storeList: string = STORE_LIST) {
  const storage = useLocalStorage('local');

  /**
   * Ensures a cache store only contains valid entries by removing outdated URLs.
   *
   * @param {string} cacheName - Name of cache vault to tidy.
   * @returns {Promise<void>} Resolves when tidy is complete.
   */
  const tidyCache = useCallback(
    async (cacheName: string): Promise<void> => {
      if (!checkSupport()) return;

      const cached = storage.get<string[]>(storeList) || [];

      // get all urls from relevant boxes to see what we need to keep
      const combinedList = cached.reduce<string[]>((list, storeName) => {
        const box = storage.get<BoxDescription>(storeName);

        return box?.cacheName === cacheName ? [...list, ...box.urls] : list;
      }, []);

      return clearOld(combinedList, cacheName);
    },
    [storage, storeList],
  );

  const addCache = useCallback<ManualCacheFunctions['addCache']>(
    async (
      cacheName: string,
      urls: string[],
      options?: { storeName: string },
    ): Promise<Array<Response | undefined>> => {
      if (!checkSupport()) return [];

      const { storeName = STORE_NAME } = options || {};

      // Keep track of all boxes
      const boxes = storage.get<string[]>(storeList) || [];
      if (!boxes.includes(storeName)) storage.set<string[]>(storeList, [...boxes, storeName]);

      // update the cache list in local storage
      const box = storage.get<BoxDescription>(storeName);

      if (box && box.cacheName !== cacheName)
        throw new Error(`Cache name mismatch: expected ${box?.cacheName}, got ${cacheName}`);

      const newURLs = urls.map((url) => absolutePath(url));
      const _cached = Array.from(new Set([...(box?.urls || []), ...newURLs]));

      storage.set<BoxDescription>(storeName, { cacheName, urls: _cached });

      // open the cache
      const myCache = await window.caches.open(cacheName);
      const keys = await myCache.keys();

      try {
        // fetch and cache all URLs in parallel
        await myCache.addAll(newURLs.filter((key) => keys.findIndex(({ url }) => url === key) === -1));
      } catch (err) {
        console.warn(`Error adding to cache ${cacheName}: ${err}`);
      }

      await tidyCache(cacheName);

      // get the data from the freshly fetched cache and pass it back
      const cache = await window.caches.open(cacheName);

      return Promise.all(newURLs.map((url) => cache.match(url)));
    },
    [storage, storeList, tidyCache],
  );

  const removeCache = useCallback<ManualCacheFunctions['removeCache']>(
    async (cacheName: string, url: string, options?: { storeName?: string }): Promise<boolean> => {
      if (!checkSupport()) return false;

      const { storeName = STORE_NAME } = options || {};

      // Keep track of all boxes
      const boxes = storage.get<string[]>(storeList) || [];
      if (!boxes.includes(storeName)) storage.set<string[]>(storeList, [...boxes, storeName]);

      // update the cache list in local storage
      const cached = storage.get<BoxDescription>(storeName);

      if (cached?.cacheName !== cacheName)
        throw new Error(
          `Cache name mismatch: expected ${cached?.cacheName}, got ${cacheName}, ${JSON.stringify(cached, null, 2)}`,
        );

      const newURL = absolutePath(url);
      const newList = cached.urls.filter((cachedUrl) => cachedUrl !== newURL);
      storage.set<BoxDescription>(storeName, { cacheName, urls: newList });

      // check through all boxes to see if the URL is still needed
      const stillNeeded = boxes.some((box) => (storage.get<BoxDescription>(box)?.urls || []).includes(newURL));

      return stillNeeded ? false : window.caches.open(cacheName).then((store) => store.delete(newURL));
    },
    [storage, storeList],
  );

  const validateCache = useCallback<ManualCacheFunctions['validateCache']>(
    async (cacheName: string, url: string, options?: { storeName: string }) => {
      if (!checkSupport()) return cache_status.INVALID;

      const { storeName = STORE_NAME } = options || {};

      const cached = storage.get<BoxDescription>(storeName);
      const checkURL = absolutePath(url);

      if (cached && cached.cacheName !== cacheName)
        throw new Error(`Cache name mismatch: expected ${cached?.cacheName}, got ${cacheName}`);

      if (!cached?.urls.includes(checkURL)) return cache_status.NOT_CACHED;

      try {
        const cacheResponse = await getCache(cacheName, url);

        return cacheResponse ? cache_status.VALID : cache_status.INVALID;
      } catch (err) {
        console.warn(`Error validating cache ${cacheName} for ${url}:`, err);

        return cache_status.INVALID;
      }
    },
    [storage],
  );

  const validateByStoreName = useCallback<ManualCacheFunctions['validateByStoreName']>(
    async (
      cacheName: string,
      storeName: string = STORE_NAME,
    ): Promise<Array<{ url: string; status: cache_status_enum }>> => {
      if (!checkSupport()) return [];

      const cached = storage.get<BoxDescription>(storeName);

      if (cached?.cacheName !== cacheName)
        throw new Error(`Cache name mismatch: expected ${cached?.cacheName}, got ${cacheName}`);

      return await Promise.all(
        cached.urls.map(async (url) => ({ url, status: await validateCache(cacheName, url, { storeName }) })),
      );
    },
    [storage, validateCache],
  );

  const removeByStoreName = useCallback<ManualCacheFunctions['removeByStoreName']>(
    async (cacheName: string, storeName: string = STORE_NAME) => {
      if (!checkSupport()) return [];

      const cached = storage.get<BoxDescription>(storeName);

      if (cached?.cacheName !== cacheName)
        throw new Error(`Cache name mismatch: expected ${cached?.cacheName}, got ${cacheName}`);

      const response = await Promise.all(
        cached.urls.map(async (url) => ({ url, removed: await removeCache(cacheName, url, { storeName }) })),
      );

      // Keep track of all boxes
      const boxes = storage.get<string[]>(storeList) || [];
      storage.set<string[]>(
        storeList,
        boxes.filter((n) => n !== storeName),
      );
      storage.remove(storeName);

      return response;
    },
    [removeCache, storage, storeList],
  );

  // when app starts ensure cache is initialised
  useEffect(() => {
    if (!window.caches) return;

    const cached = storage.get<string[]>(storeList);

    if (!cached) {
      storage.init<string[]>(storeList, []);

      return;
    }

    for (const v of Array.isArray(vault) ? vault : [vault]) tidyCache(v);
  }, [storage, storeList, tidyCache, vault]);

  return useMemo<ManualCacheFunctions>(
    () => ({ getCache, addCache, removeCache, removeByStoreName, validateCache, validateByStoreName }),
    [addCache, removeCache, removeByStoreName, validateCache, validateByStoreName],
  );
}
