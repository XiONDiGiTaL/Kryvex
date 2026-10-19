# Feature Parity (upstream → Kryvex)

Default: retain. Removal requires a documented reason. Status: audit only —
none implemented yet.

| Upstream feature | Disposition | Reason / note |
|---|---|---|
| Multi-service webviews + partitions | Retain + harden | Isolate sessions; ED-005 |
| Recipe catalog + custom services + validation | Retain + improve | Compat where feasible; add schema validation |
| Per-service settings + notifications prefs | Retain | |
| Workspaces + org, reorder, pin/hide | Retain + improve | DnD, Ctrl+K keeps working |
| QuickSwitch (Ctrl+K), recent, search cmds | Retain | |
| Tray, dock/taskbar indicators, D-Bus | Retain (per-OS) | Windows first; document gaps |
| Auto-update via electron-updater | Change | Signed-only; unsigned dev builds labeled, no fake signing |
| NSIS/portable/zip + Linux/macOS matrix | Retain matrix | Windows first; others as CI allows |
| Settings JSON + SQLite + migrations | Retain + extend | Add theme/lifecycle migrations |
| Todos, serviceProxy, webControls, appearance | Retain or improve | Evaluate each during M4/M5 |
| i18n (formatjs/Crowdin) | Retain | Keep pipeline; no string loss |
| Jest tests, eslint, biome, tsc | Retain + extend | Add lifecycle/theme/browser/e2e tests |

New in Kryvex (no upstream equivalent): Sohbet built-in service; first-class
browser workspace; theme studio (6 themes); hibernation states + profiles;
resource dashboard; focus mode; backup/restore (no secrets); notification
center; redacted diagnostics; plugin API evaluation.
