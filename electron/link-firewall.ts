import { execFile } from 'node:child_process';
import {
  LINK_PORT_FIRST,
  LINK_PORT_LAST,
  LINK_RULE_NAME,
  firewallVerdict,
  parseFirewallReading,
  parseRemoteAddresses,
  ruleRemoteAddresses,
  type FirewallVerdict,
  type LinkRuleScope,
} from './link-rules';

/**
 * Windows Firewall, as it applies to the phone link.
 *
 * A phone that cannot load the page is usually not a code problem. The listener
 * is on `0.0.0.0`, so the socket is there; Windows drops the inbound connection
 * because no rule was ever allowed for the app. The first launch shows a prompt,
 * and a prompt that was dismissed is a block that lasts until a rule is added.
 *
 * The second way it fails is subtler: a laptop on Ethernet and a phone on Wi-Fi
 * can sit on one router and still be on two subnets. The router routes between
 * them, but a rule scoped to `LocalSubnet` does not include the phone's network,
 * so the packet dies at the firewall. That is why the rule's remote scope is
 * read and can be widened to a network the user names.
 *
 * Reading the state needs no privilege. Changing it does, so it goes through
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
  /**
   * The remote scope the rule carries, or null where there is nothing to read.
   * `{ localSubnet: false, subnets: [] }` with no rule is truthful: no rule
   * covers anything yet.
   */
  remote: LinkRuleScope | null;
}

/**
 * Reads the rule this app creates, whether the private profile filters at all,
 * and which remote addresses the rule covers. None of the three changes
 * anything.
 */
export async function readFirewall(): Promise<FirewallReading> {
  if (process.platform !== 'win32') return { supported: false, verdict: 'unknown', remote: null };
  const rule = await powershell(
    `(Get-NetFirewallRule -DisplayName '${LINK_RULE_NAME}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Enabled | Out-String).Trim()`,
  );
  const profile = await powershell(
    `(Get-NetFirewallProfile -Name Private -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Enabled | Out-String).Trim()`,
  );
  const remote = await powershell(
    `(Get-NetFirewallRule -DisplayName '${LINK_RULE_NAME}' -ErrorAction SilentlyContinue | Select-Object -First 1 | Get-NetFirewallAddressFilter | Select-Object -ExpandProperty RemoteAddress | Out-String).Trim()`,
  );
  return {
    supported: true,
    verdict: firewallVerdict(parseFirewallReading(rule, profile)),
    remote: parseRemoteAddresses(remote),
  };
}

/**
 * Creates, widens or re-enables the inbound rule for the link's port range.
 *
 * `scopes` are networks beyond this machine's own subnet, already validated by
 * `mergeNetworkScopes`; nothing raw reaches the command line. `LocalSubnet` is
 * always kept, so widening the rule cannot narrow the case that already worked.
 *
 * When the rule exists this uses `set`, not `add`: `add` on a name that is
 * already there leaves a switched-off rule switched off, and a second rule with
 * the same name, which is why the re-enable path needed its own verb.
 */
export async function allowThroughFirewall(scopes: readonly string[] = []): Promise<FirewallReading> {
  if (process.platform !== 'win32') return { supported: false, verdict: 'unknown', remote: null };
  const reading = await readFirewall();
  const remote = ruleRemoteAddresses(scopes);
  // Scoped to the local subnet and applied on any profile: Windows classifies
  // plenty of home Wi-Fi as Public, and a private-only rule would leave the
  // phone blocked for exactly the people who need this button.
  const argument =
    reading.verdict === 'no-rule'
      ? `advfirewall firewall add rule name="${LINK_RULE_NAME}" dir=in action=allow protocol=TCP localport=${LINK_PORT_FIRST}-${LINK_PORT_LAST} remoteip=${remote} profile=any`
      : `advfirewall firewall set rule name="${LINK_RULE_NAME}" new remoteip=${remote} enable=yes`;
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
