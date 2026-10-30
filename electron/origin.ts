import { net } from 'electron';
import { lookup as resolve } from 'node:dns/promises';
import {
  ORIGIN_RETRY_MS,
  ORIGIN_TTL_MS,
  isLocalHost,
  isPrivateAddress,
  lookupUrl,
  parseLookup,
  pickAddress,
  siteHost,
  type ServerOriginReply,
} from './origin-rules';

const TIMEOUT_MS = 7000;

/**
 * The serving network behind the page in front.
 *
 * This is the one place a site's host leaves the machine: DNS asks the system
 * resolver, then a keyless registry (ipwho.is) is asked about the address it
 * gave back. The workspace, the tab's history and the user never travel with
 * that request, and the answer is cached per host so a reload costs nothing.
 * Loopback and private hosts are answered locally and never looked up.
 */
class ServerOriginService {
  private cache = new Map<string, { at: number; ttl: number; value: ServerOriginReply }>();
  private inflight = new Map<string, Promise<ServerOriginReply>>();

  async lookup(raw: unknown, refresh?: unknown): Promise<ServerOriginReply> {
    const host = siteHost(raw);
    if (!host) return { ok: false, error: 'invalid' };
    if (isLocalHost(host)) return { ok: false, error: 'local', host };

    // The card's refresh button means "ask again", not "show me the cache".
    if (refresh === true) this.cache.delete(host);
    const cached = this.read(host);
    if (cached) return cached;

    const running = this.inflight.get(host);
    if (running) return running;

    const task = this.resolve(host).finally(() => this.inflight.delete(host));
    this.inflight.set(host, task);
    return task;
  }

  private async resolve(host: string): Promise<ServerOriginReply> {
    let addresses: { address: string; family: number }[];
    try {
      addresses = await resolve(host, { all: true, verbatim: true });
    } catch {
      return this.write(host, { ok: false, error: 'unresolved', host }, ORIGIN_RETRY_MS);
    }

    const picked = pickAddress(addresses);
    if (!picked) return this.write(host, { ok: false, error: 'unresolved', host }, ORIGIN_RETRY_MS);
    // A public name that points at this machine or the LAN is still local.
    if (isPrivateAddress(picked.address)) {
      return this.write(host, { ok: false, error: 'local', host }, ORIGIN_TTL_MS);
    }

    let payload: unknown;
    try {
      const response = await net.fetch(lookupUrl(picked.address), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        return this.write(host, { ok: false, error: 'unavailable', host }, ORIGIN_RETRY_MS);
      }
      payload = await response.json();
    } catch {
      return this.write(host, { ok: false, error: 'offline' }, ORIGIN_RETRY_MS);
    }

    const origin = parseLookup(payload, host);
    if (!origin) return this.write(host, { ok: false, error: 'unavailable', host }, ORIGIN_RETRY_MS);
    return this.write(host, { ok: true, host, origin }, ORIGIN_TTL_MS);
  }

  private read(host: string): ServerOriginReply | null {
    const hit = this.cache.get(host);
    if (!hit) return null;
    if (Date.now() - hit.at > hit.ttl) {
      this.cache.delete(host);
      return null;
    }
    return hit.value;
  }

  private write(host: string, value: ServerOriginReply, ttl: number): ServerOriginReply {
    this.cache.set(host, { at: Date.now(), ttl, value });
    return value;
  }
}

export const serverOrigin = new ServerOriginService();
