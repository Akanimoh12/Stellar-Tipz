import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: any) => void;

interface MockCache {
  put: ReturnType<typeof vi.fn>;
  addAll: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
}

interface MockCaches {
  open: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const STATIC_ASSETS = ['/', '/index.html', '/offline.html'];

function createMockCache(): MockCache {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    addAll: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockCaches(): MockCaches {
  const cache = createMockCache();
  return {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
}

function createWaitUntilEvent(extra: Record<string, any> = {}) {
  const promises: Promise<any>[] = [];
  return {
    event: {
      waitUntil: vi.fn((p: Promise<any>) => {
        promises.push(p);
      }),
      ...extra,
    },
    promises,
  };
}

describe('service worker (sw.ts)', () => {
  let listeners: Record<string, Listener>;
  let mockCaches: MockCaches;
  let mockCache: MockCache;
  let selfMock: any;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    listeners = {};
    mockCache = createMockCache();
    mockCaches = createMockCaches();
    mockCaches.open.mockResolvedValue(mockCache);

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    selfMock = {
      addEventListener: vi.fn((type: string, listener: Listener) => {
        listeners[type] = listener;
      }),
      skipWaiting: vi.fn().mockResolvedValue(undefined),
      clients: {
        claim: vi.fn().mockResolvedValue(undefined),
        matchAll: vi.fn().mockResolvedValue([]),
        openWindow: vi.fn().mockResolvedValue(undefined),
      },
      registration: {
        showNotification: vi.fn().mockResolvedValue(undefined),
      },
      location: {
        origin: 'https://example.com',
      },
    };

    vi.stubGlobal('self', selfMock);
    vi.stubGlobal('caches', mockCaches);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function loadServiceWorker() {
    await import('./sw');
    return listeners;
  }

  describe('install', () => {
    it('precaches static assets into the versioned cache and calls skipWaiting', async () => {
      await loadServiceWorker();
      expect(listeners.install).toBeTypeOf('function');

      const { event, promises } = createWaitUntilEvent();
      listeners.install(event);

      expect(event.waitUntil).toHaveBeenCalledTimes(1);
      await Promise.all(promises);

      expect(mockCaches.open).toHaveBeenCalledWith(STATIC_CACHE);
      expect(mockCache.addAll).toHaveBeenCalledWith(STATIC_ASSETS);
      expect(selfMock.skipWaiting).toHaveBeenCalledTimes(1);
    });
  });

  describe('activate', () => {
    it('deletes caches not starting with CACHE_VERSION and calls clients.claim', async () => {
      mockCaches.keys.mockResolvedValue([
        STATIC_CACHE,
        `static-${CACHE_VERSION}`,
        'old-cache',
        'another-old-cache',
      ]);

      await loadServiceWorker();
      expect(listeners.activate).toBeTypeOf('function');

      const { event, promises } = createWaitUntilEvent();
      listeners.activate(event);

      expect(event.waitUntil).toHaveBeenCalledTimes(1);
      await Promise.all(promises);

      expect(mockCaches.keys).toHaveBeenCalled();
      expect(mockCaches.delete).toHaveBeenCalledWith('old-cache');
      expect(mockCaches.delete).toHaveBeenCalledWith('another-old-cache');
      expect(mockCaches.delete).not.toHaveBeenCalledWith(STATIC_CACHE);
      expect(selfMock.clients.claim).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetch', () => {
    function createFetchEvent(request: any) {
      const respondWith = vi.fn();
      return {
        event: {
          request,
          respondWith,
          waitUntil: vi.fn(),
        },
        respondWith,
      };
    }

    it('ignores cross-origin requests', async () => {
      await loadServiceWorker();
      expect(listeners.fetch).toBeTypeOf('function');

      const request = {
        url: 'https://other-origin.com/script.js',
        method: 'GET',
        mode: 'cors',
        destination: 'script',
      };
      const { event, respondWith } = createFetchEvent(request);
      listeners.fetch(event);

      expect(respondWith).not.toHaveBeenCalled();
    });

    it('uses network-first for navigate requests and returns network response on success', async () => {
      await loadServiceWorker();

      const networkResponse = { ok: true, status: 200, type: 'basic' };
      fetchMock.mockResolvedValue(networkResponse);

      const request = {
        url: 'https://example.com/page',
        method: 'GET',
        mode: 'navigate',
        destination: 'document',
      };
      const { event, respondWith } = createFetchEvent(request);
      listeners.fetch(event);

      expect(respondWith).toHaveBeenCalledTimes(1);
      const response = await respondWith.mock.calls[0][0];
      expect(response).toBe(networkResponse);
      expect(fetchMock).toHaveBeenCalledWith(request);
    });

    it('falls back to cache hit for navigate requests on network failure', async () => {
      await loadServiceWorker();

      fetchMock.mockRejectedValue(new Error('network down'));
      const cachedResponse = { ok: true, status: 200, fromCache: true };
      mockCaches.match.mockResolvedValue(cachedResponse);

      const request = {
        url: 'https://example.com/page',
        method: 'GET',
        mode: 'navigate',
        destination: 'document',
      };
      const { event, respondWith } = createFetchEvent(request);
      listeners.fetch(event);

      const response = await respondWith.mock.calls[0][0];
      expect(response).toBe(cachedResponse);
    });

    it('falls back to offline.html for navigate requests on network failure without cache hit', async () => {
      await loadServiceWorker();

      fetchMock.mockRejectedValue(new Error('network down'));
      mockCaches.match.mockImplementation((url: string) => {
        if (url === '/offline.html') {
          return Promise.resolve({ ok: true, status: 200, offline: true });
        }
        return Promise.resolve(undefined);
      });

      const request = {
        url: 'https://example.com/page',
        method: 'GET',
        mode: 'navigate',
        destination: 'document',
      };
      const { event, respondWith } = createFetchEvent(request);
      listeners.fetch(event);

      const response = await respondWith.mock.calls[0][0];
      expect(response).toEqual({ ok: true, status: 200, offline: true });
      expect(mockCaches.match).toHaveBeenCalledWith('/offline.html');
    });

    it('falls back to a 503 text response for navigate requests when nothing else is available', async () => {
      await loadServiceWorker();

      fetchMock.mockRejectedValue(new Error('network down'));
      mockCaches.match.mockResolvedValue(undefined);

      const request = {
        url: 'https://example.com/page',
        method: 'GET',
        mode: 'navigate',
        destination: 'document',
      };
      const { event, respondWith } = createFetchEvent(request);
      listeners.fetch(event);

      const response = await respondWith.mock.calls[0][0];
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text.length).toBeGreaterThan(0);
    });

    it.each(['script', 'style', 'image', 'font'])(
      'uses cache-first for %s destination and short-circuits fetch on cache hit',
      async (destination) => {
        await loadServiceWorker();

        const cachedResponse = { ok: true, status: 200, fromCache: true };
        mockCaches.match.mockResolvedValue(cachedResponse);

        const request = {
          url: `https://example.com/asset.${destination}`,
          method: 'GET',
          mode: 'no-cors',
          destination,
        };
        const { event, respondWith } = createFetchEvent(request);
        listeners.fetch(event);

        const response = await respondWith.mock.calls[0][0];
        expect(response).toBe(cachedResponse);
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it.each(['script', 'style', 'image', 'font'])(
      'uses cache-first for %s destination and fetches + puts on cache miss when ok',
      async (destination) => {
        await loadServiceWorker();

        mockCaches.match.mockResolvedValue(undefined);
        const networkResponse = { ok: true, status: 200, clone: vi.fn() };
        const cloned = { ok: true, status: 200, cloned: true };
        networkResponse.clone.mockReturnValue(cloned);
        fetchMock.mockResolvedValue(networkResponse);

        const request = {
          url: `https://example.com/asset.${destination}`,
          method: 'GET',
          mode: 'no-cors',
          destination,
        };
        const { event, respondWith } = createFetchEvent(request);
        listeners.fetch(event);

        const response = await respondWith.mock.calls[0][0];
        expect(response).toBe(networkResponse);
        expect(fetchMock).toHaveBeenCalledWith(request);
        expect(mockCaches.open).toHaveBeenCalledWith(STATIC_CACHE);
        expect(mockCache.put).toHaveBeenCalledWith(request, cloned);
      },
    );
  });

  describe('push', () => {
    it('shows a notification with default title/body/url when no payload is provided', async () => {
      await loadServiceWorker();
      expect(listeners.push).toBeTypeOf('function');

      const { event, promises } = createWaitUntilEvent({
        data: undefined,
      });
      listeners.push(event);

      expect(event.waitUntil).toHaveBeenCalledTimes(1);
      await Promise.all(promises);

      expect(selfMock.registration.showNotification).toHaveBeenCalledTimes(1);
      const [title, options] = selfMock.registration.showNotification.mock.calls[0];
      expect(typeof title).toBe('string');
      expect(title.length).toBeGreaterThan(0);
      expect(options).toBeTypeOf('object');
      expect(typeof options.body).toBe('string');
      expect(options.data).toBeDefined();
      expect(typeof options.data.url).toBe('string');
    });

    it('shows a notification using payload-provided title/body/url', async () => {
      await loadServiceWorker();

      const payload = {
        title: 'Custom Title',
        body: 'Custom Body',
        url: '/custom-path',
      };
      const { event, promises } = createWaitUntilEvent({
        data: {
          json: () => payload,
        },
      });
      listeners.push(event);

      await Promise.all(promises);

      expect(selfMock.registration.showNotification).toHaveBeenCalledTimes(1);
      const [title, options] = selfMock.registration.showNotification.mock.calls[0];
      expect(title).toBe('Custom Title');
      expect(options.body).toBe('Custom Body');
      expect(options.data.url).toBe('/custom-path');
    });
  });

  describe('notificationclick', () => {
    it('focuses and navigates an existing client', async () => {
      await loadServiceWorker();
      expect(listeners.notificationclick).toBeTypeOf('function');

      const existingClient = {
        url: 'https://example.com/old',
        focus: vi.fn().mockResolvedValue(undefined),
        navigate: vi.fn().mockResolvedValue(undefined),
      };
      selfMock.clients.matchAll.mockResolvedValue([existingClient]);

      const { event, promises } = createWaitUntilEvent({
        notification: {
          close: vi.fn(),
          data: { url: '/target' },
        },
      });
      listeners.notificationclick(event);

      expect(event.waitUntil).toHaveBeenCalledTimes(1);
      await Promise.all(promises);

      expect(selfMock.clients.matchAll).toHaveBeenCalled();
      expect(existingClient.focus).toHaveBeenCalledTimes(1);
      expect(existingClient.navigate).toHaveBeenCalledWith('https://example.com/target');
      expect(selfMock.clients.openWindow).not.toHaveBeenCalled();
    });

    it('opens a new window when no existing client is available', async () => {
      await loadServiceWorker();

      selfMock.clients.matchAll.mockResolvedValue([]);

      const { event, promises } = createWaitUntilEvent({
        notification: {
          close: vi.fn(),
          data: { url: '/target' },
        },
      });
      listeners.notificationclick(event);

      await Promise.all(promises);

      expect(selfMock.clients.openWindow).toHaveBeenCalledTimes(1);
      expect(selfMock.clients.openWindow).toHaveBeenCalledWith('https://example.com/target');
    });
  });
});