# Performance (methodology first: no numbers yet)

No measurements taken. The word "lightweight" must not appear in user-facing
copy until this file holds real numbers.

## Workload (repeatable)

- Profile A (baseline): fresh profile, 0 services, measure cold start (3
  runs), warm start (3 runs), idle CPU/mem at 1/5/15 min, package size,
  renderer/process counts.
- Profile B (loaded): N representative services logged out (no private
  sessions), record mem at load, after 30 min idle, wake-up time per service,
  workspace-switch latency, mem after closing all services.
- Profile C (browser): blank-tab open time, navigation time to 3 fixed URLs,
  download of a fixed file, private-window isolation check.

## Machine spec (fill at measurement)

OS build, CPU, RAM, GPU, disk type, Node/pnpm/Electron versions, power plan,
background apps killed, warm-up procedure, measurement tools (Task Manager /
perfmon / `process.memoryUsage`), and limitations (web apps' own memory
cannot be eliminated by the host).

## Comparison rule

Kryvex vs a plain Electron shell on the SAME machine, SAME services/sessions/
settings/workload. Report mean + range, never a single run.

## Suspects for profiling (from code reading, unconfirmed)

Redundant React updates, polling/timers, listener leaks, background service
webviews never suspended, duplicate resources, startup init order, bundle
weight and extra background processes.
