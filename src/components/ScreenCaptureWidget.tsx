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
  RECORD_FPS,
  removeScreenCapture,
  SHOT_READY_TIMEOUT_MS,
} from '../lib/screen-capture';
import { cropBox, even, regionLabel, type CaptureRegion } from '../lib/capture-region';
import { CaptureRegionPicker } from './CaptureRegionPicker';
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
 * The first decoded frame.
 *
 * A stream with nothing decoded yet would hand back a black rectangle, so every
 * path that reads pixels waits for one first. The wait is a poll on the video's
 * own state rather than `requestVideoFrameCallback`, because these elements are
 * deliberately detached — they exist to be drawn from, never displayed — and a
 * callback that waits for a paint can go unanswered until its timeout, which
 * would make every capture sit still for six seconds.
 */
function firstFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise<void>(resolve => {
    const started = Date.now();
    let seen = 0;
    const tick = () => {
      if (video.videoWidth > 0 && video.readyState >= 2) {
        // Two ticks apart: one decoded frame is enough to draw, and the second
        // sighting is what rules out a half-attached stream.
        seen += 1;
        if (seen >= 2) {
          resolve();
          return;
        }
      }
      if (Date.now() - started >= SHOT_READY_TIMEOUT_MS) {
        resolve();
        return;
      }
      window.setTimeout(tick, 30);
    };
    tick();
  });
}

/** One frame of a stream, at the stream's own resolution. */
async function grabFrame(live: MediaStream): Promise<{ canvas: HTMLCanvasElement; video: HTMLVideoElement } | null> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = live;
  await video.play();
  await firstFrame(video);
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  return { canvas, video };
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise<Blob | null>(resolve => canvas.toBlob(result => resolve(result), 'image/png'));
}

/** A box copied out of one canvas into a canvas of its own. */
function cropCanvas(
  source: HTMLCanvasElement,
  box: { sx: number; sy: number; sw: number; sh: number },
): HTMLCanvasElement | null {
  const output = document.createElement('canvas');
  output.width = box.sw;
  output.height = box.sh;
  const context = output.getContext('2d');
  if (!context) return null;
  context.drawImage(source, box.sx, box.sy, box.sw, box.sh, 0, 0, box.sw, box.sh);
  return output;
}

/**
 * The crop pipeline for a recording.
 *
 * The target's frames are drawn one by one into a canvas the size of the area,
 * and the recorder records that canvas. The file is cropped as it is made, so
 * nothing has to be re-encoded afterwards — and the target's own audio is
 * carried across, because the crop is pixels, not sound.
 */
async function cropPipeline(
  live: MediaStream,
  area: CaptureRegion,
): Promise<{ stream: MediaStream; stop: () => void; exact: boolean } | null> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = live;
  await video.play();
  await firstFrame(video);
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const box = cropBox(area, { width, height });
  const canvas = document.createElement('canvas');
  canvas.width = even(box.sw);
  canvas.height = even(box.sh);
  const context = canvas.getContext('2d');
  if (!context) return null;
  let running = true;
  let timer = 0;
  const draw = () => {
    if (!running) return;
    context.drawImage(video, box.sx, box.sy, box.sw, box.sh, 0, 0, canvas.width, canvas.height);
    timer = window.requestAnimationFrame(draw);
  };
  timer = window.requestAnimationFrame(draw);
  const out = canvas.captureStream(RECORD_FPS);
  for (const track of live.getAudioTracks()) {
    try {
      out.addTrack(track);
    } catch {
      /* a track that cannot be added leaves a silent recording, not a failure */
    }
  }
  return {
    stream: out,
    exact: box.exact,
    stop: () => {
      running = false;
      window.cancelAnimationFrame(timer);
      try {
        video.pause();
      } catch {
        /* already stopped */
      }
      video.srcObject = null;
    },
  };
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
  pulse = 0,
  onUpdate,
}: {
  home: HomeSettings;
  /**
   * Incremented by the header's capture button. The card is the flow — choose a
   * target, take the still or start the recording — so the answer is to bring
   * itself into view and put the picker under the keyboard, which is what a
   * snipping tool does when it is invoked from a toolbar.
   */
  pulse?: number;
  onUpdate: (patch: Partial<HomeSettings>) => void;
}) {
  const { t, locale } = useI18n();
  const bridge = typeof window === 'undefined' ? undefined : window.kryvex;
  const [sources, setSources] = useState<PartySource[] | null>(null);
  const [target, setTarget] = useState('');
  const [phase, setPhase] = useState<'idle' | 'arming' | 'recording'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const picker = useRef<HTMLSelectElement | null>(null);
  const [prompted, setPrompted] = useState(false);
  /** Whole target is the default; an area is the opt-in. */
  const [scope, setScope] = useState<'target' | 'region'>('target');
  const [region, setRegion] = useState<CaptureRegion | null>(null);
  /** The remembered area did not fit the last frame, so it was dropped. */
  const [areaGone, setAreaGone] = useState(false);
  /** Which action the picker is asking for, if it is open. */
  const [pick, setPick] = useState<'idle' | 'shot' | 'clip'>('idle');
  const [frozen, setFrozen] = useState<{
    url: string;
    canvas: HTMLCanvasElement;
    target: string;
  } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  /** The stream the picker opened; a recording that follows keeps it. */
  const armed = useRef<MediaStream | null>(null);
  /** Stops the cropped recorder's draw loop and its hidden video element. */
  const cropStop = useRef<(() => void) | null>(null);

  /**
   * The targets, with one retry.
   *
   * The first ask can land before the app's window is painted — which is
   * exactly when the header's capture button arrives — and desktopCapturer then
   * answers with nothing. One short retry turns an empty picker into a list
   * without making the button wait.
   */
  const pulling = useRef(false);
  const loadSources = useCallback(
    async (attempt = 0) => {
      if (!bridge || pulling.current) return;
      pulling.current = true;
      let value: PartySource[] = [];
      try {
        const list = (await bridge.partySources()) as PartySource[];
        value = Array.isArray(list) ? list : [];
      } catch {
        value = [];
      }
      pulling.current = false;
      setSources(value);
      if (value.length === 0 && attempt === 0) {
        window.setTimeout(() => void loadSources(1), 400);
      }
    },
    [bridge],
  );

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  // A pulse means the user asked for the tool from elsewhere in the app. The
  // first render (pulse 0) is the card just being on the board, not a request.
  useEffect(() => {
    if (!pulse) return;
    void loadSources();
    root.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    picker.current?.focus();
    setPrompted(true);
    const timer = window.setTimeout(() => setPrompted(false), 1_600);
    return () => window.clearTimeout(timer);
  }, [pulse, loadSources]);

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

  // The frozen frame's URL goes with the frame: one picker, one picture.
  useEffect(() => {
    const url = frozen?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [frozen]);

  // An area belongs to the target it was drawn on, so another target starts
  // clean rather than cropping the new one to the old one's box.
  useEffect(() => {
    setRegion(null);
    setAreaGone(false);
  }, [target]);

  useEffect(
    () => () => {
      try {
        recorder.current?.stop();
      } catch {
        /* nothing was recording */
      }
      cropStop.current?.();
      cropStop.current = null;
      stopStream();
      for (const track of armed.current?.getTracks() ?? []) {
        try {
          track.stop();
        } catch {
          /* already gone */
        }
      }
      armed.current = null;
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

  /**
   * A finished capture opens in its own window, the way a snipping tool shows
   * what it just took. The card keeps the thumbnail so the board still says what
   * happened, but saving, copying and the saved path live with the picture.
   */
  const openInWindow = useCallback(
    async (shot: Preview) => {
      if (!bridge?.capturePreview) return;
      try {
        await bridge.capturePreview({
          data: await blobToBase64(shot.blob),
          name: shot.name,
          kind: shot.kind,
          width: shot.width,
          height: shot.height,
          target: shot.target,
          language: locale,
        });
      } catch {
        setError(t('The preview window could not be opened.'));
      }
    },
    [bridge, locale, t],
  );

  /**
   * One still, cropped to the area when there is one.
   *
   * A frozen frame is preferred over a fresh grab: the picker's own overlay is
   * painted over the target, so a fresh frame of a Kryvex window would carry the
   * selection box into the picture.
   */
  async function takeShot(
    area: CaptureRegion | null,
    provided?: MediaStream | null,
    frame?: HTMLCanvasElement,
  ) {
    setError(null);
    setNotice(null);
    setPreview(current => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setPhase('arming');
    const label = labelFor(target);
    let live: MediaStream | null = provided ?? null;
    try {
      let source = frame ?? null;
      if (!source) {
        live = live ?? (await openStream(target, false));
        const grabbed = await grabFrame(live);
        if (!grabbed) throw new Error('The stream produced no frame');
        source = grabbed.canvas;
      }
      const width = source.width;
      const height = source.height;
      const box = cropBox(area, { width, height });
      const output = cropCanvas(source, box);
      if (!output) throw new Error('No canvas context');
      const blob = await toBlob(output);
      if (!blob) throw new Error('The frame could not be encoded');
      const shot: Preview = {
        url: URL.createObjectURL(blob),
        blob,
        kind: 'shot',
        width: box.sw,
        height: box.sh,
        name: captureFileName('shot', label),
        target: label,
      };
      setPreview(shot);
      void openInWindow(shot);
      // A remembered area the frame cannot hold is reported and dropped, rather
      // than quietly capturing something the card does not claim to have.
      if (!box.exact) {
        setRegion(null);
        setAreaGone(true);
      }
    } catch {
      setError(t('That target could not be captured. Choose another and try again.'));
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

  async function startRecording(area: CaptureRegion | null, provided?: MediaStream | null) {
    setError(null);
    setNotice(null);
    setPreview(current => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    const label = labelFor(target);
    setPhase('arming');
    try {
      const live = provided ?? (await openStream(target, true));
      stream.current = live;
      // The area is a real crop of the recording, not a note about it: the
      // frames go through a canvas of the area's size and the recorder records
      // that, so the file is cropped as it is written.
      let recorded: MediaStream = live;
      if (area) {
        const pipeline = await cropPipeline(live, area);
        if (!pipeline) throw new Error('The area could not be cropped');
        if (pipeline.exact) {
          recorded = pipeline.stream;
          cropStop.current = pipeline.stop;
        } else {
          // The frame cannot hold the area any more: record the whole target
          // and drop the area, rather than a strip of it nobody asked for.
          pipeline.stop();
          setRegion(null);
          setAreaGone(true);
        }
      }
      const mime = pickMimeType(type => MediaRecorder.isTypeSupported(type));
      const recorderInstance = new MediaRecorder(
        recorded,
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
        cropStop.current?.();
        cropStop.current = null;
        stopStream();
        setPhase('idle');
        setElapsed(0);
        if (blob.size === 0) {
          setError(t('The recording was empty. Try a longer clip.'));
          return;
        }
        const clip: Preview = {
          url: URL.createObjectURL(blob),
          blob,
          kind: 'clip',
          width: area?.width ?? 0,
          height: area?.height ?? 0,
          name: captureFileName('clip', label),
          target: label,
        };
        setPreview(clip);
        void openInWindow(clip);
      };
      // The OS "stop sharing" bar ends the track, not the recorder: stop both so
      // the clip is kept instead of hanging. With a crop, the canvas would go on
      // recording a frozen frame, which is why this watches the source stream.
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
      cropStop.current?.();
      cropStop.current = null;
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

  /**
   * Opens the picker: the target is armed and one frame of it is frozen.
   *
   * The stream stays armed while the picker is up, because the answer may be a
   * recording — which then continues on the stream that is already live.
   */
  async function openPicker(kind: 'shot' | 'clip') {
    setError(null);
    setNotice(null);
    setAreaGone(false);
    setPhase('arming');
    const label = labelFor(target);
    let live: MediaStream | null = null;
    try {
      live = await openStream(target, kind === 'clip');
      const grabbed = await grabFrame(live);
      if (!grabbed) throw new Error('The stream produced no frame');
      const blob = await toBlob(grabbed.canvas);
      if (!blob) throw new Error('The frame could not be encoded');
      armed.current = live;
      live = null;
      setFrozen({ url: URL.createObjectURL(blob), canvas: grabbed.canvas, target: label });
      setPick(kind);
    } catch {
      setError(t('That target could not be captured. Choose another and try again.'));
    } finally {
      // Only the stream the picker kept is left open; a failure stops its own.
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

  function cancelPick() {
    setPick('idle');
    setFrozen(null);
    const live = armed.current;
    armed.current = null;
    for (const track of live?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  /** Confirming keeps the stream: a still stops it, a recording goes on using it. */
  function confirmPick(chosen: CaptureRegion) {
    const kind = pick;
    const live = armed.current;
    const frame = frozen;
    armed.current = null;
    setRegion(chosen);
    setAreaGone(false);
    setPick('idle');
    setFrozen(null);
    if (kind === 'shot') {
      void takeShot(chosen, live, frame?.canvas);
      return;
    }
    if (kind === 'clip') {
      void startRecording(chosen, live);
      return;
    }
    for (const track of live?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  /** The one entry point the card's two buttons use. */
  async function capture(kind: 'shot' | 'clip') {
    if (phase !== 'idle' || pick !== 'idle') return;
    const area = scope === 'region' ? region : null;
    // No area drawn yet: ask for one, and the picker's answer runs the capture.
    if (scope === 'region' && !area) {
      await openPicker(kind);
      return;
    }
    if (kind === 'shot') await takeShot(area);
    else await startRecording(area);
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
    <div ref={root} className={`home-capture-tool ${prompted ? 'is-prompted' : ''}`}>
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
            ref={picker}
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

      <div className="home-capture-scope" role="group" aria-label={t('How much to capture')}>
        <button
          type="button"
          className={scope === 'target' ? 'is-on' : ''}
          aria-pressed={scope === 'target'}
          onClick={() => setScope('target')}
          disabled={phase !== 'idle'}
        >
          {t('Whole target')}
        </button>
        <button
          type="button"
          className={scope === 'region' ? 'is-on' : ''}
          aria-pressed={scope === 'region'}
          onClick={() => setScope('region')}
          disabled={phase !== 'idle'}
        >
          {t('An area')}
        </button>
      </div>

      {scope === 'region' ? (
        <div className="home-capture-area">
          <span className="home-capture-note">
            {region
              ? t('Area {size} — every capture takes this part.', { size: regionLabel(region) })
              : t('The next capture asks you to drag the area.')}
          </span>
          {region ? (
            <button type="button" className="btn ghost small" onClick={() => setRegion(null)}>
              {t('Choose another area')}
            </button>
          ) : null}
        </div>
      ) : null}
      {scope === 'region' && areaGone ? (
        <span className="home-capture-note">
          {t('That area no longer fits the target, so the whole target was captured.')}
        </span>
      ) : null}

      <div className="home-capture-actions">
        <button
          type="button"
          className="btn primary small"
          onClick={() => void capture('shot')}
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
            onClick={() => void capture('clip')}
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
            {bridge ? (
              <button
                type="button"
                className="btn primary small"
                onClick={() => void openInWindow(preview)}
              >
                <Icon name="camera" size={13} /> {t('Open preview window')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn primary small"
                  onClick={() => void save()}
                  disabled={saving}
                >
                  <Icon name="download" size={13} /> {saving ? t('Saving…') : t('Download')}
                </button>
                {preview.kind === 'shot' ? (
                  <button type="button" className="btn secondary small" onClick={() => void copy()}>
                    {t('Copy')}
                  </button>
                ) : null}
              </>
            )}
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

      {pick !== 'idle' && frozen ? (
        <CaptureRegionPicker
          imageUrl={frozen.url}
          source={{ width: frozen.canvas.width, height: frozen.canvas.height }}
          target={frozen.target}
          kind={pick}
          onConfirm={confirmPick}
          onCancel={cancelPick}
        />
      ) : null}
    </div>
  );
}
