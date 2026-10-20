/**
 * Service partition rules shared by the main process and tests.
 *
 * Service modules own persistent partitions (`persist:svc-…`). Browser tabs use
 * throwaway in-memory partitions on purpose, so they must never be treated as
 * service sessions by the notification or popup policy.
 */
export const SERVICE_PARTITION = /^persist:svc-[a-z0-9-]{1,64}$/i;

export function isServicePartition(value: unknown): value is string {
  return typeof value === 'string' && SERVICE_PARTITION.test(value);
}
