import { app, type MediaAccessPermissionRequest, type Session } from 'electron';
import { permissions } from './permissions';
import { withPrivacyHeaders } from './privacy';

/**
 * Chromium hardening inspired by LibreWolf's privacy goals.
 *
 * LibreWolf is a Firefox derivative, not Chromium, so its prefs and patches
 * are not portable. Only behaviours with a documented Chromium/Electron
 * equivalent are applied here; fingerprint-resistance and full cookie
 * partition policy have no Electron API and are intentionally not faked.
 */
const hardenedSessions = new WeakSet<Session>();

export function configurePrivacySwitches(): void {
  // Hyperlink auditing (<a ping>) is a tracking channel with no user benefit.
  app.commandLine.appendSwitch('no-pings');
  // Stop speculative DNS lookups before a user commits to a navigation.
  app.commandLine.appendSwitch('dns-prefetch-disable');
  // Restrict WebRTC to the default public interface; do not disable WebRTC,
  // because that would break legitimate calls and data channels.
  app.commandLine.appendSwitch(
    'force-webrtc-ip-handling-policy',
    'default_public_interface_only',
  );
  // Chromium's domain-reliability uploader is telemetry, not a site feature.
  app.commandLine.appendSwitch('disable-domain-reliability');
}

/**
 * Applies the same explicit policy to every session, including partitions
 * created later by service modules and browser tabs. Calling it twice on the
 * same session is harmless but unnecessary.
 */
export function hardenSession(ses: Session): void {
  if (hardenedSessions.has(ses)) return;
  hardenedSessions.add(ses);

  // Electron grants permissions by default when no handler is installed.
  // Sanitized clipboard writes and fullscreen are automatic. Camera and
  // microphone requests go to the visible shell prompt; geolocation,
  // notifications, sensors, USB/HID/serial, display capture and the rest stay
  // denied. The check handler only reports grants the user already made.
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    permissions.request(
      contents,
      permission,
      callback,
      details as MediaAccessPermissionRequest,
      contents.getURL(),
    );
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) =>
    permissions.check(permission, requestingOrigin, details.mediaType),
  );

  // Device permissions are a second gate for WebHID, WebUSB and Web Serial.
  ses.setDevicePermissionHandler(() => false);
  // Bluetooth pairing requires native confirmation; without a handler
  // Electron cancels it on Windows/Linux. Be explicit rather than implicit.
  if (process.platform === 'win32' || process.platform === 'linux') {
    ses.setBluetoothPairingHandler((_details, callback) => callback({ confirmed: false }));
  }

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: withPrivacyHeaders(details.requestHeaders, details.url) });
  });
}
