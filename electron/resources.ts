import { app, webContents } from 'electron';
import os from 'node:os';
import {
  cpuPercent,
  cpuTimes,
  summarize,
  type CpuTimes,
  type RawGuest,
  type RawMetric,
  type ResourceSnapshot,
  type ServiceIdentity,
} from './resources-rules';

const MAX_SERVICES = 100;
const MAX_FIELD = 2048;

let previousCpu: CpuTimes = cpuTimes(os.cpus());

function sampleSystemCpu(): number {
  const next = cpuTimes(os.cpus());
  const percent = cpuPercent(previousCpu, next);
  previousCpu = next;
  return percent;
}

function validServices(raw: unknown): ServiceIdentity[] {
  if (!Array.isArray(raw)) return [];
  const services: ServiceIdentity[] = [];
  for (const item of raw.slice(0, MAX_SERVICES)) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    if (typeof source.id !== 'string' || typeof source.url !== 'string') continue;
    if (!source.id || source.id.length > 64 || source.url.length > MAX_FIELD) continue;
    try {
      const url = new URL(source.url);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      services.push({ id: source.id, url: source.url });
    } catch {
      /* not a URL, not a module */
    }
  }
  return services;
}

/**
 * Per-service resource usage for Kryvex itself.
 *
 * Electron already aggregates its own processes; the only extra work is
 * mapping each guest renderer PID back to the module that owns it. True
 * system-wide GPU utilisation has no Electron API, so the panel reports the
 * GPU process's CPU and memory and says so instead of inventing a number.
 */
class ResourceSampler {
  sample(rawServices: unknown): ResourceSnapshot {
    const services = validServices(rawServices);
    const metrics: RawMetric[] = app.getAppMetrics().map(metric => ({
      pid: metric.pid,
      type: String(metric.type ?? 'Process'),
      cpu: Number(metric.cpu?.percentCPUUsage ?? 0),
      // Electron reports the working set in kilobytes.
      memoryMB: Number(metric.memory?.workingSetSize ?? 0) / 1024,
    }));

    const guests: RawGuest[] = [];
    for (const contents of webContents.getAllWebContents()) {
      if (contents.isDestroyed() || contents.getType() !== 'webview') continue;
      try {
        guests.push({ pid: contents.getOSProcessId(), url: contents.getURL() });
      } catch {
        /* a guest that vanished mid-sample has nothing to attribute */
      }
    }

    const total = os.totalmem();
    const free = os.freemem();
    return summarize(metrics, guests, services, {
      cpu: sampleSystemCpu(),
      memoryUsedMB: Math.max(0, (total - free) / (1024 * 1024)),
      memoryTotalMB: total / (1024 * 1024),
    });
  }
}

export const resources = new ResourceSampler();
