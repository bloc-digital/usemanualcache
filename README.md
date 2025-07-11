# @blocdigital/usemanualcache

> React hook for managing manual browser cache and localStorage for URLs. Enables you to add, validate, and remove cached resources in a granular, box-based way—ideal for offline-first and advanced caching strategies.

## Install

```bash
npm install --save @blocdigital/usemanualcache
```

## Usage

### Quick Start

```tsx
import useManualCache from '@blocdigital/usemanualcache';

export default function ExampleComponent() {
  const { getCache, addCache, removeCache, removeByStoreName, validateCache, validateByStoreName } = useManualCache();

  // Add URLs to cache and track in a box
  const handleAdd = async () => {
    await addCache('my-cache', ['https://example.com/data1.json', 'https://example.com/data2.json']);
  };

  // Validate a cached URL (returns status code)
  const handleValidate = async () => {
    const status = await validateCache('my-cache', 'https://example.com/data1.json');
    // status: 0 = NOT_CACHED, 1 = INVALID, 2 = VALID
  };

  // Remove a cached URL
  const handleRemove = async () => {
    await removeCache('my-cache', 'https://example.com/data1.json');
  };

  // Remove all URLs in a box (only removes from cache if not referenced elsewhere)
  const handleRemoveAll = async () => {
    await removeByStoreName('my-cache');
  };

  // Validate all URLs in a box
  const handleValidateAll = async () => {
    const results = await validateByStoreName('my-cache');
    // results: [{ url, status }]
  };

  // Get a cached response (if available)
  const handleGet = async () => {
    const response = await getCache('my-cache', 'https://example.com/data1.json');
    if (response) {
      const data = await response.text();
      // do something with data
    }
  };

  return (
    <div>
      <button onClick={handleAdd}>Add URLs to Cache</button>
      <button onClick={handleValidate}>Validate URL</button>
      <button onClick={handleRemove}>Remove URL</button>
      <button onClick={handleRemoveAll}>Remove All</button>
      <button onClick={handleValidateAll}>Validate All</button>
      <button onClick={handleGet}>Get Cached Data</button>
    </div>
  );
}
```

### Example Usage

```tsx
import { useState, useEffect } from 'react';
import useManualCache from '@blocdigital/usemanualcache';

// Enum for cache status
enum CACHE {
  NOT_CHECKED,
  CHECKING,
  NOT_CACHED,
  CACHED_WITH_ERROR,
  CACHED_SUCCESSFULLY,
}

export default function ReadLaterToggle({ pageId, pageUrl, assetUrls }) {
  const { addCache, healByStoreName, removeByStoreName, validateByStoreName } = useManualCache();
  const [status, setStatus] = useState(CACHE.NOT_CHECKED);

  // Save the main page and all its assets for offline reading
  const handleReadLater = async () => {
    setStatus(CACHE.CHECKING);
    try {
      await addCache('assets', [pageUrl, ...assetUrls], { storeName: `${pageId}_assets` });
      setStatus(CACHE.CACHED_SUCCESSFULLY);
      alert('Page and assets saved for offline reading!');
    } catch (e) {
      setStatus(CACHE.CACHED_WITH_ERROR);
      alert('Failed to save assets.');
    }
  };

  // Remove all cached assets for this page
  const handleRemove = async () => {
    setStatus(CACHE.CHECKING);
    try {
      await removeByStoreName(`${pageId}_assets`);
      setStatus(CACHE.NOT_CACHED);
      alert('Removed cached assets for this page.');
    } catch (e) {
      setStatus(CACHE.CACHED_WITH_ERROR);
      alert('Failed to remove cached assets.');
    }
  };

  // Validate all cached assets for this page
  const handleValidate = async () => {
    setStatus(CACHE.CHECKING);
    try {
      const results = await validateByStoreName(`${pageId}_assets`);
      const allValid = results.every((r) => r.status === 2);
      setStatus(allValid ? CACHE.CACHED_SUCCESSFULLY : CACHE.NOT_CACHED);
      alert(allValid ? 'All assets are cached!' : 'Some assets are missing or invalid.');
    } catch (e) {
      setStatus(CACHE.CACHED_WITH_ERROR);
      alert('Failed to validate cached assets.');
    }
  };

  // Check if cached on mount
  useEffect(() => {
    if (status !== CACHE.NOT_CHECKED) return;

    (async () => {
      setStatus(CACHE.CHECKING);
      try {
        const results = await validateByStoreName(`${pageId}_assets`);

        if (results === 0) {
          setStatus(CACHE.NOT_CACHED);

          return;
        }

        const allValid = results.every((r) => r.status === 2);

        if (allValid) {
          setStatus(CACHE.CACHED_SUCCESSFULLY);

          return;
        }

        // try and fix it
        if (navigator.onLine) {
          await healByStoreName(`${pageId}_assets`);

          setStatus(CACHE.CACHED_SUCCESSFULLY);

          return;
        }

        setStatus(CACHE.CACHED_WITH_ERROR);
      } catch {
        setStatus(CACHE.CACHED_WITH_ERROR);
      }
    })();
  }, [status]);

  return (
    <div>
      <button onClick={handleReadLater} disabled={status === CACHE.CHECKING}>
        {status === CACHE.CACHED_SUCCESSFULLY ? 'Update Offline Copy' : 'Read Later (Save Page & Assets)'}
      </button>
      <button onClick={handleValidate} disabled={status === CACHE.CHECKING}>
        Validate Cached Assets
      </button>
      <button onClick={handleRemove} disabled={status === CACHE.CHECKING || status === CACHE.NOT_CACHED}>
        Remove Cached Assets
      </button>
      <div>
        {status === CACHE.CHECKING && <span>Checking cache status...</span>}
        {status === CACHE.CACHED_SUCCESSFULLY && <span>✅ All assets cached for offline use.</span>}
        {status === CACHE.NOT_CACHED && <span>❌ Not cached.</span>}
        {status === CACHE.CACHED_WITH_ERROR && <span>⚠️ Error checking cache.</span>}
      </div>
    </div>
  );
}

// Usage example:
<ReadLaterToggle
  pageId="article-123"
  pageUrl="https://example.com/article-123"
  assetUrls={[
    'https://example.com/styles/article-123.css',
    'https://example.com/images/article-123-cover.jpg',
    'https://example.com/scripts/article-123.js',
  ]}
/>;
```

This example demonstrates how you can use `useManualCache` to implement a "Read Later" or offline mode feature for a page and its assets. The component tracks cache status, provides user feedback, and allows saving, validating, or removing cached resources for a specific page.

### API

#### useManualCache(vault?: string[], storeList?: string)

Each "box" in localStorage stores both the list of URLs and the name of the cache (CacheStorage) it relates to. All operations on a box will throw an error if you try to use a different cache name than the one it was created with. This ensures a strict 1:1 mapping between a box and its cache, preventing accidental cross-cache operations.

Returns an object with the following methods:

- `addCache(cacheName, urls, options?)` – Add URLs to the specified cache and track them in a localStorage box. Throws if the box was created for a different cache.
- `getCache(cacheName, url)` – Get a cached [Response](https://developer.mozilla.org/docs/Web/API/Response) for a URL (or undefined if not found).
- `getCacheByStoreName(storeName?)` – Get all cached [Response](https://developer.mozilla.org/docs/Web/API/Response)s for all URLs in a box.
- `getCacheNameByStoreName(storeName?)` – Get the name of the cache associated with a given localStorage box.
- `removeCache(cacheName, url, options?)` – Remove a URL from the specified cache and its box. Throws if the box was created for a different cache.
- `removeByStoreName(storeName?)` – Remove all URLs in a box from the cache (only removes from cache if not referenced in other boxes).
- `validateCache(cacheName, url, options?)` – Check if a URL is present and valid in the specified cache and box. Throws if the box was created for a different cache.
- `validateByStoreName(storeName?)` – Validate all URLs in a box for the specified cache. Throws if the box was created for a different cache.
- `healByStoreName(storeName?)` – Ensure all URLs in a box are present and valid in the cache (re-adds missing/invalid URLs).
- `healAll()` – Ensure all boxes are in sync with their caches (re-adds missing/invalid URLs for all boxes).

#### Status Codes

- `0` = NOT_CACHED (not tracked in the box)
- `1` = INVALID (tracked but not in cache)
- `2` = VALID (tracked and in cache)

### How It Works: LocalStorage "Boxes" and Cache Mapping

Each box in localStorage is an object with two properties:

- `cacheName`: The name of the CacheStorage this box is associated with.
- `urls`: The list of URLs tracked for that cache.

The API also provides `getCacheByStoreName`, `getCacheNameByStoreName`, `healByStoreName`, and `healAll` for advanced cache management:

- `getCacheByStoreName(storeName?)`: Returns all cached responses for the URLs in a box.
- `getCacheNameByStoreName(storeName?)`: Returns the name of the cache associated with a given localStorage box.
- `healByStoreName(storeName?)`: Checks all URLs in a box and re-adds any that are missing or invalid in the cache.
- `healAll()`: Runs `healByStoreName` for every box, ensuring all boxes and caches are in sync.

This strict mapping ensures that all operations on a box are always performed against the correct cache. If you try to use a box with a different cache name, an error will be thrown. This prevents accidental cross-cache operations and keeps your cache and box data in sync.

This approach provides two main benefits:

1. **Cache Consistency:** By tracking both the cache name and URLs in localStorage, the hook can check if the browser cache and your intended list of cached URLs are still in sync. This helps ensure that your app's cache state matches what you expect, and allows for validation and tidy-up operations.

2. **Safe Cache Purging:** When you remove (purge) a cache box, the hook only removes URLs from the browser cache if they are not still referenced in any other box. This prevents accidentally deleting cached resources that are still needed elsewhere in your app.

This design is especially useful for apps that need to manage multiple sets of cached resources, want to avoid cache bloat and stale data, or need to keep different resource groups isolated. The strict mapping between boxes and caches prevents accidental cross-cache operations. The healing functions help keep your cache and box data in sync, even if something goes wrong (e.g., cache eviction, manual tampering, or network errors).

### Notes & Limitations

- This hook uses the browser [Cache API](https://developer.mozilla.org/docs/Web/API/Cache) and [localStorage](https://developer.mozilla.org/docs/Web/API/Window/localStorage). It will not work in environments where these are not available (e.g., server-side rendering).
- Useful for offline-first apps, caching API responses, or managing resources manually in the browser cache.
- **Not a Service Worker:** This hook is designed to add URLs to the browser cache, but it is not a service worker and will not automatically serve cached content for network requests. For automatic serving of cached resources, use this hook in combination with a service worker solution such as [Workbox](https://developer.chrome.com/docs/workbox/) or [Serwist](https://serwist.pages.dev/). These tools can intercept network requests and serve cached content as needed, while `useManualCache` helps you manage what is stored in the cache.
- Works best in modern browsers that support the Cache API and localStorage.
