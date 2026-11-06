import { execFile } from 'node:child_process';
import {
  LINK_PORT_FIRST,
  LINK_PORT_LAST,
  LINK_RULE_NAME,
  firewallVerdict,
  parseFirewallReading,
  type FirewallVerdict,
} from './link-rules';

/**
 * Windows Firewall, as it applies to the phone link.
 *
 * A phone that cannot load the page is usually not a code problem. The listener
 * is on `0.0.0.0`, so the socket is there; Windows drops the inbound connection
 * because no rule was ever allowed for the app. The first launch shows a prompt,
 * and a prompt that was dismissed is a block that lasts until a rule is added.
 *
 * Reading the state needs no privilege. Adding the rule does, so it goes through
 * `Start-Process -Verb RunAs`, which shows the normal Windows consent dialog. A
 * refused dialog is answered as "still not open", never as success.
 */

function powershell(script: string, timeout = 15_000): Promise<string> {
  return new Promise(resolve => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout, windowsHide: true },
      (error, stdout) => resolve(error ? '' : String(stdout ?? '').trim()),
    );
  });
}

export interface FirewallReading {
  /** False on macOS and Linux: there is no Windows rule to read or add. */
  supported: boolean;
  verdict: FirewallVerdict;
}

/**
 * Reads the rule this app creates and whether the private profile filters at
 * all. Both reads are cheap and neither changes anything.
 */
export async function readFirewall(): Promise<FirewallReading> {
  if (process.platform !== 'win32') return { supported: false, verdict: 'unknown' };
  const rule = await powershell(
    `(Get-NetFirewallRule -DisplayName '${LINK_RULE_NAME}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Enabled | Out-String).Trim()`,
  );
  const profile = await powershell(
    `(Get-NetFirewallProfile -Name Private -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Enabled | Out-String).Trim()`,
  );
  return { supported: true, verdict: firewallVerdict(parseFirewallReading(rule, profile)) };
}

/**
 * Adds one inbound TCP rule for the link's port range on the private profile.
 * The consent dialog belongs to Windows; if it is dismissed this returns the
 * state it found afterwards, which is still not open.
 */
export async function allowThroughFirewall(): Promise<FirewallReading> {
  if (process.platform !== 'win32') return { supported: false, verdict: 'unknown' };
  // Scoped to the local subnet and applied on any profile: Windows classifies
  // plenty of home Wi-Fi as Public, and a private-only rule would leave the
  // phone blocked for exactly the people who need this button.
  const argument = `advfirewall firewall add rule name="${LINK_RULE_NAME}" dir=in action=allow protocol=TCP localport=${LINK_PORT_FIRST}-${LINK_PORT_LAST} remoteip=LocalSubnet profile=any`;
  await new Promise<void>(resolve => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Start-Process -FilePath netsh.exe -Verb RunAs -Wait -ArgumentList '${argument}'`,
      ],
      { timeout: 60_000, windowsHide: true },
      () => resolve(),
    );
  });
  return readFirewall();
}

/**
 * Fetches `/api/hello` on each advertised address from this machine.
 *
 * This proves the listener answers on that interface; it does not prove the
 * phone is on the same network, because Windows treats traffic from this machine
 * to its own address as local. It still separates "Kryvex is serving nothing"
 * from "Kryvex is serving and the network is the problem", which is the question
 * a user is actually asking when the page will not load.
 */
export async function probeAddresses(
  urls: string[],
): Promise<Array<{ url: string; reachable: boolean }>> {
  return Promise.all(
    urls.slice(0, 4).map(async url => {
      try {
        const response = await fetch(`${url.replace(/\/+$/, '')}/api/hello`, {
          signal: AbortSignal.timeout(1_500),
        });
        return { url, reachable: response.ok };
      } catch {
        return { url, reachable: false };
      }
    }),
  );
}
