import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureKind, HomeSettings, PartySource, ScreenCapture } from '../types';
import { useI18n } from '../lib/i18n';
import { makeId } from '../lib/services';
import {
  MAX_RECORD_MS,
  addScreenCapture,
  byteLabel,
  captureFileName,
  durationLabel,
  groupSources,
  pickMimeType,
  removeScreenCapture,
  SHOT_READY_TIMEOUT_MS,
} from '../lib/screen-capture';
import { Icon } from './ui';

interface Preview {
  url: string;
  blob: Blob;
  kind: CaptureKind;
  width: number;
  height: number;
  name: string;
  target: string;
}

function baseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

/** Base64 in slices: `String.fromCharCode(...bytes)` overflows the stack. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The browser needs the URL alive while the download starts, not after.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Screen capture: a still or a recording of something inside Kryvex.
 *
 * The old card here was a text inbox for tasks and links, which is a second note
 * list — sticky notes already does that job — and it confused people looking for
 * a snipping tool. This is the tool: pick a service or the app's own window, take
 * one frame or record up to three minutes, then send it wherever the user wants
 * with a normal save dialog.
 *
 * A service is captured through the frame the Rooms broker already hands the
 * shell, so the picture is the service itself rather than a rectangle of the
 * desktop with Kryvex's chrome around it. The recording is a `MediaRecorder` over
 * that same stream, which keeps one path for both kinds.
 */
export function ScreenCaptureWidget({
  home,
  onUpdate,
}: {
  home: HomeSettings;
  onUpdate: (patch: Partial<HomeSettings>) => void;
}) {
  const { t } = useI18n();
  const bridge = typeof window === 'undefined' ? undefined : window.kryvex;
  const [sources, setSources] = useState<PartySource[] | null>(null);
  const [target, setTarget] = useState('');
  const [phase, setPhase] = useState<'idle' | 'arming' | 'recording'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  const loadSources = useCallback(async () => {
    if (!bridge) return;
    try {
      const list = (await bridge.partySources()) as PartySource[];
      setSources(Array.isArray(list) ? list : []);
    } catch {
      setSources([]);
    }
  }, [bridge]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const stopStream = useCallback(() => {
    const live = stream.current;
    stream.current = null;
    for (const track of live?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        /* the track is already gone */
      }
    }
  }, []);

  // One preview at a time: the object URL would otherwise leak for the session.
  useEffect(() => {
    const url = preview?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview]);

  useEffect(
    () => () => {
      try {
        recorder.current?.stop();
      } catch {
        /* nothing was recording */
      }
      stopStream();
    },
    [stopStream],
  );

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => {
      const spent = Date.now() - startedAt.current;
      setElapsed(spent);
      if (spent >= MAX_RECORD_MS) {
        try {
          recorder.current?.stop();
        } catch {
          /* already stopped */
        }
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  const labelFor = useCallback(
    (id: string): string => {
      if (!bridge) return t('screen');
      const found = sources?.find(source => source.id === id);
      if (!found) return t('capture');
      return found.kind === 'app' ? found.name : found.name || t('window');
    },
    [bridge, sources, t],
  );

  async function openStream(id: string, withAudio: boolean): Promise<MediaStream> {
    if (bridge) {
      const armed = await bridge.partySelectSource(id, withAudio);
      if (!armed) throw new Error('Source not armed');
    }
    const media = navigator.mediaDevices;
    if (!media?.getDisplayMedia) throw new Error('No display capture');
    // Electron's handler ignores these and answers with the armed source; a
    // browser uses them as a hint under its own picker.
    const requested: DisplayMediaStreamOptions = {
      video: { frameRate: 30 } as MediaTrackConstraints,
      audio: withAudio,
    };
    return media.getDisplayMedia(requested);
  }

  function clear() {
    setPreview(null);
    setError(null);
    setNotice(null);
  }

  async function takeShot() {
    if (phase !== 'idle') return;
    setError(null);
    setNotice(null);
    setPreview(current => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setPhase('arming');
    const label = labelFor(target);
    let live: MediaStream | null = null;
    try {
      live = await openStream(target, false);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = live;
      await video.play();
      // The first painted frame is what a screenshot wants; a stream that never
      // paints would otherwise hand back a black rectangle.
      await new Promise<void>(resolve => {
        const anyVideo = video as HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
        };
        if (typeof anyVideo.requestVideoFrameCallback === 'function') {
          anyVideo.requestVideoFrameCallback(() => resolve());
        }
        window.setTimeout(resolve, SHOT_READY_TIMEOUT_MS);
      });
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) throw new Error('The stream produced no frame');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No canvas context');
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(result => resolve(result), 'image/png'),
      );
      if (!blob) throw new Error('The frame could not be encoded');
      setPreview({
        url: URL.createObjectURL(blob),
        blob,
        kind: 'shot',
        width,
        height,
        name: captureFileName('shot', label),
        target: label,
      });
    } catch (failure) {
      setError(t('That target could not be captured. Choose another and try again.'));
      void failure;
    } finally {
      for (const track of live?.getTracks() ?? []) {
        try {
          track.stop();
        } catch {
          /* already stopped */
        }
      }
      setPhase('idle');
    }
  }

  async function startRecording() {
    if (phase !== 'idle') return;
    setError(null);
    setNotice(null);
    setPreview(current => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    const label = labelFor(target);
    setPhase('arming');
    try {
      const live = await openStream(target, true);
      stream.current = live;
      const mime = pickMimeType(type => MediaRecorder.isTypeSupported(type));
      const recorderInstance = new MediaRecorder(
        live,
        mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined,
      );
      chunks.current = [];
      recorderInstance.ondataavailable = event => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      recorderInstance.onstop = () => {
        const type = recorderInstance.mimeType || mime || 'video/webm';
        const blob = new Blob(chunks.current, { type });
        chunks.current = [];
        recorder.current = null;
        stopStream();
        setPhase('idle');
        setElapsed(0);
        if (blob.size === 0) {
          setError(t('The recording was empty. Try a longer clip.'));
          return;
        }
        setPreview({
          url: URL.createObjectURL(blob),
          blob,
          kind: 'clip',
          width: 0,
          height: 0,
          name: captureFileName('clip', label),
          target: label,
        });
      };
      // The OS "stop sharing" bar ends the track, not the recorder: stop both so
      // the clip is kept instead of hanging.
      const [video] = live.getVideoTracks();
      if (video) {
        video.addEventListener('ended', () => {
          try {
            recorderInstance.stop();
          } catch {
            /* already stopped */
          }
        });
      }
      recorderInstance.start(1000);
      recorder.current = recorderInstance;
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase('recording');
    } catch {
      stopStream();
      setPhase('idle');
      setError(t('That target could not be recorded. Choose another and try again.'));
    }
  }

  function stopRecording() {
    try {
      recorder.current?.stop();
    } catch {
      setPhase('idle');
    }
  }

  async function save() {
    if (!preview || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (bridge) {
        const data = await blobToBase64(preview.blob);
        const result = await bridge.captureSave({
          data,
          name: preview.name,
          kind: preview.kind,
        });
        if (result.cancelled) return;
        if (!result.ok || !result.path) {
          setError(result.message ?? t('The capture could not be saved.'));
          return;
        }
        const entry: ScreenCapture = {
          id: makeId('cap'),
          kind: preview.kind,
          name: baseName(result.path),
          path: result.path,
          bytes: preview.blob.size,
          width: preview.width,
          height: preview.height,
          target: preview.target,
          createdAt: Date.now(),
        };
        onUpdate({ screenCaptures: addScreenCapture(home.screenCaptures, entry) });
        setNotice(t('Saved to {path}', { path: result.path }));
        setPreview(null);
      } else {
        download(preview.blob, preview.name);
        const entry: ScreenCapture = {
          id: makeId('cap'),
          kind: preview.kind,
          name: preview.name,
          path: '',
          bytes: preview.blob.size,
          width: preview.width,
          height: preview.height,
          target: preview.target,
          createdAt: Date.now(),
        };
        onUpdate({ screenCaptures: addScreenCapture(home.screenCaptures, entry) });
        setNotice(t('Downloaded {name}.', { name: preview.name }));
        setPreview(null);
      }
    } catch {
      setError(t('The capture could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!preview || !bridge || preview.kind !== 'shot') return;
    try {
      const done = await bridge.captureCopy(await blobToBase64(preview.blob));
      setNotice(done ? t('Copied to the clipboard.') : t('The clipboard refused the image.'));
    } catch {
      setError(t('The clipboard refused the image.'));
    }
  }

  const grouped = groupSources(sources ?? []);
  const recent = home.screenCaptures.slice(0, 4);
  const services = grouped.services.slice(0, 20);
  const windows = grouped.windows.slice(0, 8);
  const screens = grouped.screens.slice(0, 4);
  const targetValue = bridge ? target : 'browser';
  const canShoot = Boolean(targetValue) && phase === 'idle';
  const canRecord = Boolean(targetValue) && phase === 'idle';

  return (
    <div className="home-capture-tool">
      <div className="home-card-head">
        <span className="mono">{t('SCREEN CAPTURE')}</span>
        <span className="mono">
          {phase === 'recording' ? t('REC {time}', { time: durationLabel(elapsed) }) : t('UP TO 3:00')}
        </span>
      </div>

      <p className="home-capture-note">
        {t(
          'Capture a service or this window, then choose where to save it. Recordings stop themselves after three minutes.',
        )}
      </p>

      <div className="home-capture-pick">
        {bridge ? (
          <select
            value={target}
            onChange={event => setTarget(event.target.value)}
            aria-label={t('What to capture')}
            disabled={phase !== 'idle'}
          >
            <option value="">{t('Choose a target…')}</option>
            {services.length > 0 ? (
              <optgroup label={t('Services')}>
                {services.map(source => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {windows.length > 0 ? (
              <optgroup label={t('Windows')}>
                {windows.map(source => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {screens.length > 0 ? (
              <optgroup label={t('Screens')}>
                {screens.map(source => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        ) : (
          <p className="home-capture-note">
            {t('The browser asks which screen or window to share, then downloads the file.')}
          </p>
        )}
        {bridge ? (
          <button
            type="button"
            className="icon-btn"
            onClick={() => void loadSources()}
            aria-label={t('Refresh the targets')}
            title={t('Refresh the targets')}
            disabled={phase !== 'idle'}
          >
            <Icon name="reload" size={13} />
          </button>
        ) : null}
      </div>

      <div className="home-capture-actions">
        <button
          type="button"
          className="btn primary small"
          onClick={() => void takeShot()}
          disabled={!canShoot}
        >
          <Icon name="camera" size={13} /> {t('Capture still')}
        </button>
        {phase === 'recording' ? (
          <button type="button" className="btn danger small" onClick={stopRecording}>
            <Icon name="stop" size={13} /> {t('Stop recording')}
          </button>
        ) : (
          <button
            type="button"
            className="btn secondary small"
            onClick={() => void startRecording()}
            disabled={!canRecord}
          >
            <Icon name="record" size={13} /> {t('Record')}
          </button>
        )}
      </div>

      {error ? <span className="home-capture-note is-error">{error}</span> : null}
      {notice ? <span className="home-capture-note">{notice}</span> : null}

      {preview ? (
        <div className="home-capture-preview">
          {preview.kind === 'shot' ? (
            <img src={preview.url} alt={t('Capture preview')} />
          ) : (
            <video src={preview.url} controls aria-label={t('Recording preview')} />
          )}
          <div className="home-capture-preview-meta">
            <span className="mono">
              {preview.kind === 'shot'
                ? `${preview.width}×${preview.height} · ${byteLabel(preview.blob.size)}`
                : `${durationLabel(elapsed)} · ${byteLabel(preview.blob.size)}`}
            </span>
            <span className="mono home-capture-target">{preview.target}</span>
          </div>
          <div className="home-capture-actions">
            <button type="button" className="btn primary small" onClick={() => void save()} disabled={saving}>
              <Icon name="download" size={13} /> {saving ? t('Saving…') : bridge ? t('Save as…') : t('Download')}
            </button>
            {bridge && preview.kind === 'shot' ? (
              <button type="button" className="btn secondary small" onClick={() => void copy()}>
                {t('Copy')}
              </button>
            ) : null}
            <button type="button" className="btn ghost small" onClick={clear}>
              {t('Discard')}
            </button>
          </div>
        </div>
      ) : null}

      {recent.length > 0 ? (
        <>
          <span className="mono home-capture-note">{t('RECENT')}</span>
          <ul className="home-capture-recent">
            {recent.map(entry => (
              <li key={entry.id}>
                <span className="mono home-capture-kind">{entry.kind === 'clip' ? 'REC' : 'IMG'}</span>
                <div>
                  <strong>{entry.name}</strong>
                  <span className="mono">
                    {entry.target} · {byteLabel(entry.bytes)}
                  </span>
                </div>
                {entry.path && bridge ? (
                  <button
                    className="icon-btn"
                    aria-label={t('Show {name} in its folder', { name: entry.name })}
                    title={t('Show in folder')}
                    onClick={() => void bridge.captureReveal(entry.path)}
                  >
                    <Icon name="folder" size={13} />
                  </button>
                ) : null}
                <button
                  className="home-clock-remove"
                  aria-label={t('Forget {name}', { name: entry.name })}
                  title={t('Forget this capture')}
                  onClick={() =>
                    onUpdate({
                      screenCaptures: removeScreenCapture(home.screenCaptures, entry.id),
                    })
                  }
                >
                  <Icon name="close" size={11} />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
