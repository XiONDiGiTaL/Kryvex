/**
 * Windows attributes a toast to the Start Menu shortcut whose AppUserModelID
 * matches the notifier.
 *
 * The installed app and a source checkout need different identities. Electron's
 * unpackaged shortcut is named `Electron.lnk` and targets the bare executable,
 * so letting a dev run share the installed AUMID makes Windows choose that
 * shortcut for both. A click then opens Electron's welcome page instead of
 * Kryvex. Keeping the two IDs separate leaves the installed shortcut as the
 * only owner of the packaged identity.
 */
export const NOTIFICATION_APP_ID = 'net.xiondigital.kryvex';
export const DEVELOPMENT_APP_ID = `${NOTIFICATION_APP_ID}.dev`;

export function notificationAppId(packaged: boolean): string {
  return packaged ? NOTIFICATION_APP_ID : DEVELOPMENT_APP_ID;
}
