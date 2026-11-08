import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
 * Reading the state needs no privilege. Changing it does, so the write goes
 * through `Start-Process -Verb RunAs`, which shows the normal Windows consent
 * dialog. A refused dialog is answered as "still not open", never as success.
 *
 * The write itself uses `New-NetFirewallRule` / `Set-NetFirewallRule` rather
 * than `netsh`, and not for style. `netsh` takes `remoteip` as one string and
 * silently keeps only the first entry of a comma list: asked for
 * `LocalSubnet,192.168.222.0/24` it created an enabled rule scoped to
 * `LocalSubnet`, exit code zero, no warning — the phone's network left blocked
 * with every sign of success. A GitHub runner caught that. The cmdlets take the
 * scope as an array, so there is no list to misparse, and their errors are
 * captured instead of discarded.
 */

function powershell(script: string, timeout = 20_000): Promise<string> {
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
  /** What the elevated command said — `OK`, or the message it threw. */
  detail?: string;
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
 * Runs one script elevated and hands back what it printed.
 *
 * `Start-Process -Verb RunAs` gives the child its own console, so its output
 * would otherwise be lost — which is how a half-applied rule stays invisible.
 * The script is written to a `.ps1` and launched with `-File`, so neither a
 * path with spaces nor the script's own quoting is re-parsed on the way in, and
 * its output is read back from a file afterwards.
 */
async function runElevated(body: string): Promise<string> {
  const token = crypto.randomBytes(6).toString('hex');
  const scriptPath = path.join(os.tmpdir(), `kryvex-link-fw-${token}.ps1`);
  const outputPath = path.join(os.tmpdir(), `kryvex-link-fw-${token}.txt`);
  const lines = [
    '& {',
    '  try {',
    `    ${body}`,
    "    'OK'",
    '  } catch {',
    "    'ERROR: ' + $_.Exception.Message",
    '  }',
    `} *>&1 | Out-File -FilePath '${outputPath}' -Encoding utf8`,
    '',
  ];
  fs.writeFileSync(scriptPath, lines.join('\n'), 'utf8');
  try {
    await new Promise<void>(resolve => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"'`,
        ],
        { timeout: 90_000, windowsHide: true },
        () => resolve(),
      );
    });
    try {
      return fs.readFileSync(outputPath, 'utf8').trim();
    } catch {
      // No file means the consent dialog was dismissed or the child never ran.
      return '';
    }
  } finally {
    fs.rmSync(scriptPath, { force: true });
    fs.rmSync(outputPath, { force: true });
  }
}

/**
 * Creates, widens or re-enables the inbound rule for the link's port range.
 *
 * `scopes` are networks beyond this machine's own subnet, already validated by
 * `mergeNetworkScopes`; nothing raw reaches the elevated script. `LocalSubnet`
 * is always kept, so widening the rule cannot narrow the case that already
 * worked. The addresses go in as an array — one element per scope — which is
 * what makes the scope land intact.
 */
export async function allowThroughFirewall(scopes: readonly string[] = []): Promise<FirewallReading> {
  if (process.platform !== 'win32') {
    return { supported: false, verdict: 'unknown', remote: null, detail: '' };
  }
  const reading = await readFirewall();
  const remote = ruleRemoteAddresses(scopes)
    .split(',')
    .map(value => `'${value}'`)
    .join(',');
  // Scoped to `LocalSubnet` (plus anything named) and applied on any profile:
  // Windows classifies plenty of home Wi-Fi as Public, and a private-only rule
  // would leave the phone blocked for exactly the people who need this button.
  const body =
    reading.verdict === 'no-rule'
      ? `New-NetFirewallRule -DisplayName '${LINK_RULE_NAME}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${LINK_PORT_FIRST}-${LINK_PORT_LAST} -RemoteAddress @(${remote}) -Profile Any -Enabled True -ErrorAction Stop`
      : `Set-NetFirewallRule -DisplayName '${LINK_RULE_NAME}' -RemoteAddress @(${remote}) -Enabled True -Profile Any -ErrorAction Stop`;
  const detail = await runElevated(body);
  return { ...(await readFirewall()), detail };
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
