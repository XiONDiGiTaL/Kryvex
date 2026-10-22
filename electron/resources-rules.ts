export interface RawMetric {
  pid: number;
  type: string;
  cpu: number;
  memoryMB: number;
}

export interface RawGuest {
  pid: number;
  url: string;
}

export interface ServiceIdentity {
  id: string;
  url: string;
}

export interface ResourceProcess {
  pid: number;
  type: string;
  label: string;
  serviceId?: string;
  cpu: number;
  memoryMB: number;
}

export interface ResourceServiceUsage {
  id: string;
  cpu: number;
  memoryMB: number;
  processes: number;
}

export interface ResourceSnapshot {
  capturedAt: number;
  /** Whole-machine CPU, kept for diagnostics but not shown in the panel. */
  cpu: number;
  /** Whole-machine memory in use, kept for diagnostics. */
  memoryUsedMB: number;
  memoryTotalMB: number;
  /** Sum of Kryvex's own process CPU, as Chromium reports it (one core = 100%). */
  appCpu: number;
  /** Kryvex's CPU as a share of the whole machine, comparable to Task Manager. */
  appCpuShare: number;
  /** Logical processors, so a per-core percentage can be read honestly. */
  cpuCores: number;
  appMemoryMB: number;
  /** Kryvex's memory as a percentage of installed RAM. */
  memoryShare: number;
  gpuCpu: number;
  gpuMemoryMB: number;
  processCount: number;
  processes: ResourceProcess[];
  services: ResourceServiceUsage[];
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * A service owns its own host and its subdomains. Sign-in and consent pages
 * usually live one label up (`accounts.google.com`), so an exact match alone
 * would leave the busiest frame of a module unattributed.
 */
export function hostMatches(serviceUrl: string, guestUrl: string): boolean {
  const service = hostOf(serviceUrl);
  const guest = hostOf(guestUrl);
  if (!service || !guest) return false;
  return guest === service || guest.endsWith(`.${service}`) || service.endsWith(`.${guest}`);
}

export function serviceForGuest(
  guestUrl: string,
  services: ServiceIdentity[],
): string | undefined {
  return services.find(service => hostMatches(service.url, guestUrl))?.id;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Turns Electron process metrics into the rows the resource panel shows.
 * CPU values are percentages as Chromium reports them (one core = 100%).
 */
export function summarize(
  metrics: RawMetric[],
  guests: RawGuest[],
  services: ServiceIdentity[],
  system: {
    cpu: number;
    memoryUsedMB: number;
    memoryTotalMB: number;
    cpuCores?: number;
  },
): ResourceSnapshot {
  const guestService = new Map<number, string>();
  for (const guest of guests) {
    const id = serviceForGuest(guest.url, services);
    if (id && !guestService.has(guest.pid)) guestService.set(guest.pid, id);
  }

  const processes: ResourceProcess[] = metrics.map(metric => {
    const serviceId = guestService.get(metric.pid);
    return {
      pid: metric.pid,
      type: metric.type,
      label: metric.type === 'GPU' ? 'GPU process' : metric.type,
      ...(serviceId ? { serviceId } : {}),
      cpu: Math.max(0, round(metric.cpu)),
      memoryMB: Math.max(0, round(metric.memoryMB)),
    };
  });

  const byService = new Map<string, ResourceServiceUsage>();
  for (const process of processes) {
    if (!process.serviceId) continue;
    const entry = byService.get(process.serviceId) ?? {
      id: process.serviceId,
      cpu: 0,
      memoryMB: 0,
      processes: 0,
    };
    entry.cpu += process.cpu;
    entry.memoryMB += process.memoryMB;
    entry.processes += 1;
    byService.set(process.serviceId, entry);
  }

  const appMemoryMB = processes.reduce((total, process) => total + process.memoryMB, 0);
  const appCpu = processes.reduce((total, process) => total + process.cpu, 0);
  const gpu = processes.filter(process => process.type === 'GPU');
  const cores = Math.max(1, Math.round(system.cpuCores ?? 1));
  const memoryTotal = Math.max(0, system.memoryTotalMB);

  return {
    capturedAt: Date.now(),
    cpu: Math.max(0, Math.min(100 * 64, round(system.cpu))),
    memoryUsedMB: Math.max(0, round(system.memoryUsedMB)),
    memoryTotalMB: round(memoryTotal),
    appCpu: round(appCpu),
    appCpuShare: Math.max(0, Math.min(100, round(appCpu / cores))),
    cpuCores: cores,
    appMemoryMB: round(appMemoryMB),
    memoryShare: memoryTotal > 0 ? Math.max(0, Math.min(100, round((appMemoryMB / memoryTotal) * 100))) : 0,
    gpuCpu: round(gpu.reduce((total, process) => total + process.cpu, 0)),
    gpuMemoryMB: round(gpu.reduce((total, process) => total + process.memoryMB, 0)),
    processCount: processes.length,
    processes: processes.sort((a, b) => b.cpu - a.cpu || b.memoryMB - a.memoryMB),
    services: [...byService.values()]
      .map(entry => ({
        ...entry,
        cpu: round(entry.cpu),
        memoryMB: round(entry.memoryMB),
      }))
      .sort((a, b) => b.cpu - a.cpu || b.memoryMB - a.memoryMB),
  };
}

export interface CpuTimes {
  idle: number;
  total: number;
}

export function cpuTimes(cpus: Array<{ times: { user: number; nice: number; sys: number; idle: number; irq: number } }>): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

/** Percentage busy between two samples; 0 when the counters did not move. */
export function cpuPercent(previous: CpuTimes, next: CpuTimes): number {
  const idle = next.idle - previous.idle;
  const total = next.total - previous.total;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, ((total - idle) / total) * 100));
}
