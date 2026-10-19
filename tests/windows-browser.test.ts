import { describe, expect, it } from 'vitest';
import { windowsBrowserEntries } from '../electron/windows-browser';

describe('windowsBrowserEntries', () => {
  const root = 'HKCU\\Software\\KryvexTest';
  const exe = 'C:\\Program Files\\Kryvex\\Kryvex.exe';
  const entries = windowsBrowserEntries(exe, root);

  function find(key: string, name: string | null) {
    return entries.find(entry => entry.key === key && entry.name === name);
  }

  it('registers http and https through one URL ProgID', () => {
    expect(find(`${root}\\RegisteredApplications`, 'Kryvex')?.value).toBe(
      'Software\\KryvexTest\\Clients\\StartMenuInternet\\Kryvex\\Capabilities',
    );
    expect(
      windowsBrowserEntries(exe).find(
        entry =>
          entry.key === 'HKCU\\Software\\RegisteredApplications' && entry.name === 'Kryvex',
      )?.value,
    ).toBe('Software\\Clients\\StartMenuInternet\\Kryvex\\Capabilities');
    expect(
      find(`${root}\\Clients\\StartMenuInternet\\Kryvex\\Capabilities\\URLAssociations`, 'http')
        ?.value,
    ).toBe('KryvexURL');
    expect(
      find(`${root}\\Clients\\StartMenuInternet\\Kryvex\\Capabilities\\URLAssociations`, 'https')
        ?.value,
    ).toBe('KryvexURL');
    expect(find(`${root}\\Classes\\KryvexURL\\shell\\open\\command`, null)?.value).toBe(
      `"${exe}" "%1"`,
    );
  });

  it('registers the app name and icon for Default Apps', () => {
    expect(find(`${root}\\Clients\\StartMenuInternet\\Kryvex`, null)?.value).toBe('Kryvex');
    expect(
      find(`${root}\\Clients\\StartMenuInternet\\Kryvex\\Capabilities`, 'ApplicationName')?.value,
    ).toBe('Kryvex');
    expect(
      find(`${root}\\Clients\\StartMenuInternet\\Kryvex\\Capabilities`, 'ApplicationIcon')?.value,
    ).toBe(`"${exe}",0`);
    expect(find(`${root}\\Classes\\KryvexURL`, 'URL Protocol')?.value).toBe('');
  });
});
