# Service lifecycle

Every service that owns a running process — the 8-bit emulator, Disk pulse,
Rooms and the webview modules — answers the same question the same way: what
happens to it when the user looks somewhere else?

Before this change each screen answered differently. The emulator's iframe died
with its route, so switching services closed the game. A Disk pulse scan finished
into a component that had already unmounted, and its results were dropped. Rooms
left the room on unmount, which is exactly the wrong thing for a room. Web
modules already had a two-value `persistence` flag, but only they used it.

`src/lib/lifecycle.ts` is now the single vocabulary, and
`src/components/ServiceLifecycle.tsx` applies it in the shell.

## States

| State | What the shell does |
| --- | --- |
| `active` | The view is on screen. |
| `background` | Kept mounted at zero opacity. Timers, audio and connections keep their normal rate. |
| `paused` | Kept mounted, and asked to suspend its work (`kryvex-pause` to the emulator). Memory, scroll position and session stay. |
| `stopped` | Unmounted. Reopening starts from scratch. |

Pinned is not a lifecycle state. A pinned service is only one that is easy to
reach; it never starts on its own and never forces itself to stay running.

A parked view is rendered with `position: fixed; opacity: 0`, not `display:
none`. A `display: none` frame is reported to Chromium as a hidden page, which
throttles its timers and animation frames; the webview stage has used the same
rule since 0.7.0 for the same reason.

## Policies

Five answers, offered globally and overridable per service:

| Policy | Result |
| --- | --- |
| Keep running | `background` |
| Keep running, muted | `background` with the service silenced where it has audio |
| Pause on leave | `paused` |
| Pause when idle | `background` until the idle interval, then `paused` |
| Stop when leaving | `stopped` |

Idle intervals are 5, 10, 15, 60 and 240 minutes, or any value from 1 to 480 in
the field beside them. The timer is armed once at the boundary instead of
polling, so a waiting service costs nothing.

Settings → **Service lifecycle** holds the default, the interval and the
per-service exceptions. The default is **Keep running**, which matches the
behaviour 0.9.0 shipped for web modules.

## Capabilities

A policy never silently loses information. Each service declares what it can
actually do, and the resolver reports the closest safe option with a note:

| Service | Keep | Pause | Mute | Why |
| --- | --- | --- | --- | --- |
| 8-bit emulator | yes | yes | yes | The core can suspend and silence without losing the game. |
| Disk pulse | yes | no | no | A scan runs in the main process; suspending would only discard results. |
| Rooms | yes | no | yes | Pausing a peer connection would drop the membership it exists to keep. |
| Web modules | yes | yes | yes | A webview can be muted and its media paused while the session stays. |

So "Pause on leave" for Disk pulse reports *This service cannot suspend, so it
stays in the background*, and Rooms stays connected instead of pretending to
pause.

## The emulator

The emulator's frame is sandboxed without `allow-same-origin`: that is what
keeps the third-party core away from the Kryvex bridge. The same sandbox means
EmulatorJS's own storage is a shim that discards everything, which is why its
Save State button used to download a file and its Load State button could never
find it again.

The shell now owns the bytes:

- `EJS_onSaveState` and `EJS_onLoadState` are registered, so registering them
  makes EmulatorJS skip its own download/browse handler. The core's own Save and
  Load State buttons act on Kryvex's store.
- `src/lib/emulator-saves.ts` keeps states in IndexedDB (`kryvex-emulator`,
  stores `states`, `batteries`, `prefs`). Twelve states are kept per cartridge;
  the oldest is pruned beyond that.
- **Quick save** overwrites the quick slot, **Quick load** restores it, and
  **Save state** writes a named one. A state carries the frame the core captured
  beside it when it could.
- **In-game saves** (`.srm` files written by the game itself) are kept
  separately, keyed by cartridge. A state is the core's memory; an in-game save
  is the game's own file, and the two are not interchangeable.
- **Choose save folder** calls `showDirectoryPicker` once and mirrors every new
  state (`<game> <stamp> <kind>.state` plus a `.webp` thumbnail) into the chosen
  folder. The handle is stored in IndexedDB; a revoked permission is reported
  and the state still lands in the app's own store. **Export** downloads a single
  state file, and **Import state** reads one back. Downloads are never the
  default path.
- `gameKey` is `system:nameHash:byteLength`, so a patched hack and the clean dump
  never load each other's states, and a state survives a reload and a restart.
- Switching services no longer closes the game: under the default policy the
  frame is parked, and under "Pause on leave" it is suspended through
  `kryvex-pause` instead.

A cartridge is memory only. Kryvex does not persist the ROM itself, because that
would put up to 64 MB of game data in the profile without being asked; loading
the file again restores the cartridge, and its saves are waiting.

## Verification

`tests/service-lifecycle.test.ts` covers the resolver, the capability fallbacks,
the settings sanitizer, state naming and the twelve-state cap.
`tests/emulator.test.ts` asserts the frame protocol and that the core's save
buttons are bridged to the shell.

Checked in the browser build (`#/emulator` → `#/services` → back):

| Check | Result |
| --- | --- |
| Emulator pane after leaving | Present, `lifecycle-pane is-parked`, `position: fixed`, `opacity: 0`, iframe element unchanged |
| Default policy "Stop when leaving" | Pane unmounted on leave |
| Per-service override | `auto-pause` on the emulator overrode a `stop` default and kept it parked |
| Settings → Service lifecycle | Five policies, per-service rows, "Now: …" effect line, override persisted to state |
| Frame protocol | `kryvex-save-state` before a cartridge answered `kryvex-save-failed` ("The game is still starting.") and surfaced a toast; pause/mute before a core were no-ops; an unknown message was ignored |
| Console | No errors; the redundant `allowFullScreen` warning was removed |

**Not run:** a save/load round trip with a real ROM and core. It needs a
cartridge the tester owns, and the sandboxed frame only produces states once
the core has started.
