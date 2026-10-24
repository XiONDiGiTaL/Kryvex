import { app, type MediaAccessPermissionRequest, type Session } from 'electron';
import { permissions } from './permissions';
import { clientHintPlatform, withChromeClientHints, withPrivacyHeaders } from './privacy';
import { isGoogleSite } from './sign-in-hosts';
import { applicationUserAgent, withApplicationUserAgent } from './user-agent';

/**
 * Chromium hardening for Kryvex sessions.
 *
 * Only behaviours with a documented Chromium/Electron equivalent are applied
 * here; fingerprint resistance and full cookie partition policy have no
 * Electron API and are intentionally not faked.
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

function isGoogleUrl(url: string): boolean {
  try {
    return isGoogleSite(new URL(url).hostname);
  } catch {
    return false;
  }
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
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
    permissions.check(permission, requestingOrigin, details.mediaType, contents),
  );

  // Device permissions are a second gate for WebHID, WebUSB and Web Serial.
  ses.setDevicePermissionHandler(() => false);
  // Bluetooth pairing requires native confirmation; without a handler
  // Electron cancels it on Windows/Linux. Be explicit rather than implicit.
  if (process.platform === 'win32' || process.platform === 'linux') {
    ses.setBluetoothPairingHandler((_details, callback) => callback({ confirmed: false }));
  }

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const privateHeaders = withPrivacyHeaders(details.requestHeaders, details.url);
    // Google's account pages check the browser against the identity it
    // claims, and a Chrome agent from an engine that is not Chrome is refused
    // outright. Google therefore gets the application's real agent and no
    // client hints — on its account hosts *and* on its products, so a sign-in
    // that starts on Gmail and returns from the account host never changes
    // browser halfway through. Everything else keeps the Chrome agent with
    // matching hints, because a Chrome user agent with no hints is a
    // combination real Chrome never produces.
    callback({
      requestHeaders: isGoogleUrl(details.url)
        ? withApplicationUserAgent(privateHeaders, applicationUserAgent())
        : withChromeClientHints(
            privateHeaders,
            process.versions.chrome,
            clientHintPlatform(process.platform),
          ),
    });
  });
}
