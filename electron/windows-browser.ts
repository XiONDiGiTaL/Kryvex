import { execFileSync } from 'node:child_process';
import { platform } from 'node:process';

export interface RegistryEntry {
  key: string;
  /** null writes the key's default (unnamed) value. */
  name: string | null;
  value: string;
}

/**
 * Windows 10/11 will not list an app in Default Apps just because it owns a
 * protocol command. It also needs a RegisteredApplications entry and a
 * StartMenuInternet client with URL capabilities. These are per-user keys.
 */
export function windowsBrowserEntries(
  exePath: string,
  root = 'HKCU\\Software',
): RegistryEntry[] {
  const base = root.replace(/\\+$/, '');
  const client = `${base}\\Clients\\StartMenuInternet\\Kryvex`;
  const handler = `${base}\\Classes\\KryvexURL`;
  const icon = `"${exePath}",0`;
  const command = `"${exePath}" "%1"`;
  const clientCommand = `"${exePath}"`;
  const relativeRoot = base.replace(/^HKCU\\/i, '');

  return [
    { key: handler, name: null, value: 'Kryvex URL' },
    { key: handler, name: 'URL Protocol', value: '' },
    { key: handler, name: 'AppUserModelId', value: 'Kryvex' },
    { key: `${handler}\\Application`, name: 'ApplicationName', value: 'Kryvex' },
    {
      key: `${handler}\\Application`,
      name: 'ApplicationDescription',
      value: 'Kryvex web workspace',
    },
    { key: `${handler}\\Application`, name: 'ApplicationCompany', value: 'XiØN' },
    { key: `${handler}\\Application`, name: 'AppUserModelId', value: 'Kryvex' },
    { key: `${handler}\\DefaultIcon`, name: null, value: icon },
    { key: `${handler}\\shell\\open\\command`, name: null, value: command },

    { key: client, name: null, value: 'Kryvex' },
    { key: `${client}\\Capabilities`, name: 'ApplicationName', value: 'Kryvex' },
    {
      key: `${client}\\Capabilities`,
      name: 'ApplicationDescription',
      value: 'Kryvex web workspace',
    },
    { key: `${client}\\Capabilities`, name: 'ApplicationIcon', value: icon },
    { key: `${client}\\Capabilities\\URLAssociations`, name: 'http', value: 'KryvexURL' },
    { key: `${client}\\Capabilities\\URLAssociations`, name: 'https', value: 'KryvexURL' },
    {
      key: `${client}\\Capabilities\\Startmenu`,
      name: 'StartMenuInternet',
      value: 'Kryvex',
    },
    { key: `${client}\\DefaultIcon`, name: null, value: icon },
    { key: `${client}\\shell\\open\\command`, name: null, value: clientCommand },

    {
      key: `${base}\\RegisteredApplications`,
      name: 'Kryvex',
      value: `${relativeRoot}\\Clients\\StartMenuInternet\\Kryvex\\Capabilities`,
    },
  ];
}

export function registerWindowsBrowser(
  exePath: string,
  root = 'HKCU\\Software',
): boolean {
  if (platform !== 'win32') return false;
  try {
    for (const entry of windowsBrowserEntries(exePath, root)) {
      const args = ['add', entry.key];
      if (entry.name === null) args.push('/ve');
      else args.push('/v', entry.name);
      args.push('/t', 'REG_SZ', '/d', entry.value, '/f');
      // execFile bypasses the shell, so spaces, quotes and %1 stay literal.
      execFileSync('reg.exe', args, { stdio: 'ignore', windowsHide: true });
    }
    return true;
  } catch {
    return false;
  }
}
