import { useCallback, useMemo, useState } from 'react';
import type { FileKitCode, PickedFile, WrittenFile } from '../types';
import { Icon } from '../components/ui';
import { base64ToBytes, bytesToBase64 } from '../lib/binary';
import { useT } from '../lib/i18n';
import {
  IMAGE_MIME,
  IMAGE_OUTPUTS,
  MAX_EDGE_CHOICES,
  MAX_TEXT_BYTES,
  applyRenamePattern,
  csvToJson,
  encodeBmp,
  fitSize,
  formatBytes,
  imageOutputName,
  jsonToCsv,
  parsePageOrder,
  parsePageRanges,
  pageSizeFor,
  renamePlan,
  type ForgeGroup,
  type ImageFormat,
  type MaxEdge,
} from '../lib/forge-rules';

/**
 * File Forge: the local conversion workbench.
 *
 * Every transformation happens in this renderer, where Chromium's own codecs
 * live, and the main process only picks files and writes the results through a
 * native dialog. Originals are never modified: a conversion produces a new
 * file, and the one operation that does touch an original — a batch rename —
 * shows exactly what it will do before it does it.
 *
 * PDF merging, splitting and reordering use pdf-lib, loaded on demand so the
 * app does not carry it until a PDF is actually worked on.
 */

const FILE_KIT_KEYS: Record<FileKitCode, string> = {
  'too-big': 'One file is larger than the 48 MB this tool opens at once: {name}',
  'too-many-bytes': 'That selection is more than 96 MB in total. Pick fewer files at once.',
  'read-failed': 'That file could not be read: {name}',
  'no-readable-file': 'No readable file was chosen.',
  'no-extension': 'An export had no usable extension: {name}',
  'empty-or-large': 'That export was empty or too large to write: {name}',
  'format-mismatch': 'That export did not contain the format it claimed: {name}',
  'nothing-to-export': 'Nothing was ready to export.',
  'write-failed': 'The file could not be written.',
  'not-picked': 'That file was not chosen in this session.',
  'bad-name': 'That is not a usable file name: {name}',
  'duplicate-name': 'Two files would both become {name}.',
  'target-exists': '{name} already exists.',
};

type T = ReturnType<typeof useT>;
type Tone = 'info' | 'success' | 'warning' | 'danger';

function fileKitMessage(t: T, code: FileKitCode | undefined, detail?: string): string {
  if (!code) return t('The work could not be finished.');
  return t(FILE_KIT_KEYS[code], { name: detail ?? '' });
}

/* ------------------------------------------------------------- encoding --- */

function textBytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function decodeImage(file: PickedFile): Promise<ImageBitmap> {
  const bytes = base64ToBytes(file.data);
  const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
  // `from-image` respects an EXIF orientation, so a phone photo is not written
  // out sideways the moment it is converted.
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

async function encodeCanvas(
  bitmap: ImageBitmap,
  format: ImageFormat,
  maxEdge: MaxEdge,
  quality: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const size = fitSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no-canvas');
  // A JPEG has no alpha channel, so a transparent PNG must not be drawn onto
  // black: the canvas starts white instead of transparent.
  if (format === 'jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  if (format === 'bmp') {
    const pixels = context.getImageData(0, 0, size.width, size.height);
    return { bytes: encodeBmp(pixels.data, size.width, size.height), ...size };
  }
  const blob = await canvas.convertToBlob({ type: IMAGE_MIME[format], quality });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ...size };
}

/* ------------------------------------------------------------------ view --- */

export function FileForge({
  isElectron,
  onBack,
  onToast,
  embedded = false,
}: {
  isElectron: boolean;
  onBack: () => void;
  onToast: (message: string, tone?: Tone) => void;
  /** Rendered inside a Workspace window: the window owns the title bar. */
  embedded?: boolean;
}) {
  const t = useT();
  // The workbench transforms bytes in this renderer, so it runs anywhere; what
  // the web build cannot do is reach the machine's files, and it says so.
  const bridge = isElectron && typeof window !== 'undefined' ? window.kryvex : undefined;
  const [group, setGroup] = useState<ForgeGroup>('images');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState('');
  const [results, setResults] = useState<WrittenFile[]>([]);
  const [text, setText] = useState('');

  const [format, setFormat] = useState<ImageFormat>('png');
  const [maxEdgeId, setMaxEdgeId] = useState('original');
  const [quality, setQuality] = useState(0.9);
  const [pdfMode, setPdfMode] = useState<'images' | 'merge' | 'split' | 'reorder'>('images');
  const [splitMode, setSplitMode] = useState<'each' | 'ranges'>('each');
  const [ranges, setRanges] = useState('');
  const [order, setOrder] = useState('');
  const [rotate, setRotate] = useState(false);
  const [direction, setDirection] = useState<'json-to-csv' | 'csv-to-json'>('json-to-csv');
  const [pattern, setPattern] = useState('{name}');
  const [startAt, setStartAt] = useState(1);

  const maxEdge = MAX_EDGE_CHOICES.find(choice => choice.id === maxEdgeId)?.edge ?? null;
  const images = useMemo(() => files.filter(file => file.kind === 'image'), [files]);
  const pdfs = useMemo(() => files.filter(file => file.kind === 'pdf'), [files]);
  const dataFiles = useMemo(() => files.filter(file => file.kind === 'data'), [files]);

  const usable = useMemo(() => {
    if (group === 'images') return images;
    if (group === 'pdf') return pdfMode === 'images' ? images : pdfs;
    if (group === 'data') {
      return dataFiles.filter(file =>
        direction === 'json-to-csv' ? /\.json$/i.test(file.name) : /\.(csv|tsv)$/i.test(file.name),
      );
    }
    return files;
  }, [group, images, pdfMode, pdfs, dataFiles, direction, files]);

  const steps = useMemo(
    () => (group === 'rename' ? renamePlan(files, pattern, startAt) : []),
    [group, files, pattern, startAt],
  );
  const blocked = steps.filter(step => step.error).length;

  const addFiles = useCallback(async () => {
    if (!bridge?.filesPick) {
      onToast(t('File Forge needs the desktop app: the web build cannot open files on this machine.'), 'warning');
      return;
    }
    setBusy(t('Waiting for a choice…'));
    try {
      const kind = group === 'images' ? 'image' : group === 'pdf' ? (pdfMode === 'images' ? 'image' : 'pdf') : 'data';
      const answer = await bridge.filesPick({ kind, multiple: true });
      if (!answer.ok) {
        if (!answer.cancelled) onToast(fileKitMessage(t, answer.code, answer.detail), 'danger');
        return;
      }
      setFiles(current => {
        const known = new Set(current.map(file => file.path));
        return [...current, ...answer.files.filter(file => !known.has(file.path))];
      });
      setResults([]);
    } finally {
      setBusy('');
    }
  }, [bridge, group, pdfMode, onToast, t]);

  const exportItems = useCallback(
    async (items: { name: string; bytes: Uint8Array }[]) => {
      if (items.length === 0) {
        onToast(t('Nothing in that list converts with the options above.'), 'warning');
        return;
      }
      if (!bridge?.filesSave) {
        onToast(t('Saving needs the desktop app.'), 'warning');
        return;
      }
      setBusy(t('Saving…'));
      try {
        const answer = await bridge.filesSave({
          items: items.map(item => ({ name: item.name, data: bytesToBase64(item.bytes) })),
        });
        setResults(answer.saved);
        if (!answer.ok && !answer.cancelled) {
          onToast(fileKitMessage(t, answer.code, answer.detail), 'danger');
        } else if (answer.ok) {
          onToast(t('Exported {count} file(s).', { count: answer.saved.length }), 'success');
        }
      } finally {
        setBusy('');
      }
    },
    [bridge, onToast, t],
  );

  const runImages = useCallback(async () => {
    if (images.length === 0) {
      onToast(t('Add at least one image first.'), 'warning');
      return;
    }
    setBusy(t('Converting images…'));
    try {
      const items: { name: string; bytes: Uint8Array }[] = [];
      for (const file of images) {
        try {
          const bitmap = await decodeImage(file);
          const encoded = await encodeCanvas(bitmap, format, maxEdge, quality);
          bitmap.close();
          items.push({ name: imageOutputName(file.name, format), bytes: encoded.bytes });
        } catch {
          onToast(t('{name} could not be converted.', { name: file.name }), 'danger');
        }
      }
      await exportItems(items);
    } finally {
      setBusy('');
    }
  }, [images, format, maxEdge, quality, exportItems, onToast, t]);

  const runPdf = useCallback(async () => {
    setBusy(t('Working on the PDF…'));
    try {
      const { PDFDocument, degrees } = await import('pdf-lib');
      const items: { name: string; bytes: Uint8Array }[] = [];
      const stemOf = (name: string) => name.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'document';

      if (pdfMode === 'merge') {
        if (pdfs.length < 2) {
          onToast(t('Merging needs two or more PDFs.'), 'warning');
          return;
        }
        const out = await PDFDocument.create();
        for (const file of pdfs) {
          const source = await PDFDocument.load(base64ToBytes(file.data));
          const pages = await out.copyPages(source, source.getPageIndices());
          for (const page of pages) {
            if (rotate) page.setRotation(degrees((page.getRotation().angle + 90) % 360));
            out.addPage(page);
          }
        }
        items.push({ name: `${stemOf(pdfs[0]!.name)}-merged.pdf`, bytes: await out.save() });
      } else if (pdfMode === 'images') {
        if (images.length === 0) {
          onToast(t('Add at least one image first.'), 'warning');
          return;
        }
        const build = async (subset: PickedFile[], name: string) => {
          const out = await PDFDocument.create();
          for (const file of subset) {
            const bitmap = await decodeImage(file);
            // A photo stays a JPEG inside the PDF instead of being inflated
            // into an uncompressed PNG page; anything with alpha stays PNG.
            const asJpeg = /\.jpe?g$/i.test(file.name);
            const encoded = await encodeCanvas(bitmap, asJpeg ? 'jpeg' : 'png', maxEdge, 0.92);
            bitmap.close();
            const embedded = asJpeg
              ? await out.embedJpg(encoded.bytes)
              : await out.embedPng(encoded.bytes);
            const points = pageSizeFor(encoded.width, encoded.height, 96);
            const page = out.addPage([points.width, points.height]);
            page.drawImage(embedded, {
              x: 0,
              y: 0,
              width: points.width,
              height: points.height,
            });
          }
          items.push({ name, bytes: await out.save() });
        };
        if (splitMode === 'each') {
          for (const file of images) await build([file], `${stemOf(file.name)}.pdf`);
        } else {
          await build(images, `${stemOf(images[0]!.name)}-images.pdf`);
        }
      } else if (pdfMode === 'split') {
        if (pdfs.length !== 1) {
          onToast(t('Splitting works on one PDF at a time.'), 'warning');
          return;
        }
        const file = pdfs[0]!;
        const source = await PDFDocument.load(base64ToBytes(file.data));
        const total = source.getPageCount();
        if (splitMode === 'each') {
          for (let page = 0; page < total; page += 1) {
            const out = await PDFDocument.create();
            const [copied] = await out.copyPages(source, [page]);
            if (copied) out.addPage(copied);
            items.push({
              name: `${stemOf(file.name)}-page-${page + 1}.pdf`,
              bytes: await out.save(),
            });
          }
        } else {
          const parsed = parsePageRanges(ranges, total);
          if (!parsed) {
            onToast(t('That page range could not be read. Try a form like 1-3,5.'), 'warning');
            return;
          }
          for (const [index, range] of parsed.entries()) {
            const out = await PDFDocument.create();
            const copied = await out.copyPages(source, range);
            for (const page of copied) out.addPage(page);
            items.push({
              name: `${stemOf(file.name)}-range-${index + 1}.pdf`,
              bytes: await out.save(),
            });
          }
        }
      } else {
        if (pdfs.length !== 1) {
          onToast(t('Reordering works on one PDF at a time.'), 'warning');
          return;
        }
        const file = pdfs[0]!;
        const source = await PDFDocument.load(base64ToBytes(file.data));
        const total = source.getPageCount();
        const parsed = parsePageOrder(order, total);
        if (!parsed) {
          onToast(
            t('That order needs every page exactly once, from 1 to {count}.', { count: total }),
            'warning',
          );
          return;
        }
        const out = await PDFDocument.create();
        const copied = await out.copyPages(source, parsed);
        for (const page of copied) {
          if (rotate) page.setRotation(degrees((page.getRotation().angle + 90) % 360));
          out.addPage(page);
        }
        items.push({ name: `${stemOf(file.name)}-reordered.pdf`, bytes: await out.save() });
      }
      await exportItems(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      onToast(
        /encrypt/i.test(message)
          ? t('That PDF is encrypted, so it has to be unlocked before Kryvex can read it.')
          : t('That PDF could not be read.'),
        'danger',
      );
    } finally {
      setBusy('');
    }
  }, [pdfMode, pdfs, images, rotate, splitMode, ranges, order, maxEdge, exportItems, onToast, t]);

  const runData = useCallback(async () => {
    if (usable.length === 0) {
      onToast(t('Add a JSON or CSV file first.'), 'warning');
      return;
    }
    setBusy(t('Converting data…'));
    try {
      const items: { name: string; bytes: Uint8Array }[] = [];
      let preview = '';
      for (const file of usable) {
        const source = new TextDecoder().decode(base64ToBytes(file.data));
        if (source.length > MAX_TEXT_BYTES) {
          onToast(t('{name} is too large to read as text.', { name: file.name }), 'danger');
          continue;
        }
        const stem = file.name.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'data';
        if (direction === 'json-to-csv') {
          const answer = jsonToCsv(source);
          if (!answer.ok || typeof answer.value !== 'string') {
            onToast(t('{name} is not a list of records that can become a table.', { name: file.name }), 'danger');
            continue;
          }
          preview = answer.value.slice(0, 4000);
          items.push({ name: `${stem}.csv`, bytes: textBytesOf(answer.value) });
        } else {
          const answer = csvToJson(source);
          if (!answer.ok || typeof answer.value !== 'string') {
            onToast(t('{name} could not be read as a table.', { name: file.name }), 'danger');
            continue;
          }
          preview = answer.value.slice(0, 4000);
          items.push({ name: `${stem}.json`, bytes: textBytesOf(answer.value) });
        }
      }
      setText(preview);
      await exportItems(items);
    } finally {
      setBusy('');
    }
  }, [usable, direction, exportItems, onToast, t]);

  const runRename = useCallback(async () => {
    if (!bridge?.filesRename) {
      onToast(t('Renaming needs the desktop app.'), 'warning');
      return;
    }
    if (blocked > 0) {
      onToast(t('Fix the highlighted names before applying the batch.'), 'warning');
      return;
    }
    setBusy(t('Renaming…'));
    try {
      const answer = await bridge.filesRename({
        items: files.map((file, index) => ({
          path: file.path,
          name: applyRenamePattern(pattern, file.name, index + startAt - 1, files.length),
        })),
      });
      if (!answer.ok) {
        onToast(fileKitMessage(t, answer.code, answer.detail), 'danger');
        return;
      }
      const moved = new Map(answer.renamed.map(entry => [entry.from, entry.to]));
      setFiles(current =>
        current.map(file =>
          moved.has(file.path)
            ? { ...file, path: moved.get(file.path)!, name: moved.get(file.path)!.split(/[\\/]/).pop() ?? file.name }
            : file,
        ),
      );
      onToast(t('Renamed {count} file(s).', { count: answer.renamed.length }), 'success');
    } finally {
      setBusy('');
    }
  }, [bridge, blocked, files, pattern, startAt, onToast, t]);

  const run = useCallback(() => {
    if (group === 'images') return void runImages();
    if (group === 'pdf') return void runPdf();
    if (group === 'data') return void runData();
    return void runRename();
  }, [group, runImages, runPdf, runData, runRename]);

  const groups: { id: ForgeGroup; label: string }[] = [
    { id: 'images', label: 'Images' },
    { id: 'pdf', label: 'PDF' },
    { id: 'data', label: 'Data' },
    { id: 'rename', label: 'Rename' },
  ];

  return (
    <section className={`view forge-view ${embedded ? 'is-embedded' : ''}`}>
      {embedded ? null : (
        <header className="view-head">
          <div>
            <p className="eyebrow mono">{t('x536 / FILES')}</p>
            {/* A product name: the same in every language, so it is not a key. */}
            <h1>File Forge</h1>
            <p className="lede">
              {t(
                'Resize and convert images, merge, split or reorder PDFs, turn JSON into CSV and rename in batches. Everything runs on this machine and originals are left alone.',
              )}
            </p>
          </div>
          <div className="view-head-actions">
            <button className="btn ghost" onClick={onBack}>
              <Icon name="back" size={15} />
              {t('Back to services')}
            </button>
          </div>
        </header>
      )}

      <div className="forge-bar">
        <div className="forge-tabs" role="tablist" aria-label="File Forge">
          {groups.map(item => (
            <button
              key={item.id}
              role="tab"
              aria-selected={group === item.id}
              className={`btn ghost small ${group === item.id ? 'is-active' : ''}`}
              onClick={() => {
                setGroup(item.id);
                setResults([]);
              }}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <div className="forge-actions">
          <button className="btn secondary small" onClick={() => void addFiles()} disabled={Boolean(busy)}>
            <Icon name="plus" size={14} />
            {t('Add files')}
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              setFiles([]);
              setResults([]);
              setText('');
            }}
            disabled={files.length === 0}
          >
            <Icon name="trash" size={14} />
            {t('Clear the list')}
          </button>
        </div>
      </div>

      <div className="forge-body">
        <aside className="forge-options" aria-label={t('Options')}>
          {group === 'images' ? (
            <>
              <p className="mono forge-label">{t('Output format')}</p>
              <div className="forge-chips">
                {IMAGE_OUTPUTS.map(option => (
                  <button
                    key={option}
                    className={`btn ghost small ${format === option ? 'is-active' : ''}`}
                    aria-pressed={format === option}
                    onClick={() => setFormat(option)}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="mono forge-label">{t('Longest edge')}</p>
              <div className="forge-chips">
                {MAX_EDGE_CHOICES.map(choice => (
                  <button
                    key={choice.id}
                    className={`btn ghost small ${maxEdgeId === choice.id ? 'is-active' : ''}`}
                    aria-pressed={maxEdgeId === choice.id}
                    onClick={() => setMaxEdgeId(choice.id)}
                  >
                    {choice.edge === null ? t('Original') : `${choice.edge} px`}
                  </button>
                ))}
              </div>
              <label className="forge-slider">
                <span className="mono forge-label">{t('Quality {percent}%', { percent: Math.round(quality * 100) })}</span>
                <input
                  type="range"
                  min={60}
                  max={100}
                  value={Math.round(quality * 100)}
                  onChange={event => setQuality(Number(event.target.value) / 100)}
                  disabled={format === 'bmp'}
                />
              </label>
              <p className="forge-hint">
                {t('BMP keeps no quality setting: it is written without compression.')}
              </p>
            </>
          ) : null}

          {group === 'pdf' ? (
            <>
              <p className="mono forge-label">{t('What to do')}</p>
              <div className="forge-chips">
                {(
                  [
                    ['images', 'Images into a PDF'],
                    ['merge', 'Merge'],
                    ['split', 'Split'],
                    ['reorder', 'Reorder'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className={`btn ghost small ${pdfMode === id ? 'is-active' : ''}`}
                    aria-pressed={pdfMode === id}
                    onClick={() => setPdfMode(id)}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
              {pdfMode === 'images' || pdfMode === 'split' ? (
                <div className="forge-chips forge-chips-gap">
                  <button
                    className={`btn ghost small ${splitMode === 'each' ? 'is-active' : ''}`}
                    aria-pressed={splitMode === 'each'}
                    onClick={() => setSplitMode('each')}
                  >
                    {pdfMode === 'images' ? t('A PDF per image') : t('A PDF per page')}
                  </button>
                  <button
                    className={`btn ghost small ${splitMode === 'ranges' ? 'is-active' : ''}`}
                    aria-pressed={splitMode === 'ranges'}
                    onClick={() => setSplitMode('ranges')}
                  >
                    {pdfMode === 'images' ? t('One PDF with all of them') : t('Choose ranges')}
                  </button>
                </div>
              ) : null}
              {pdfMode === 'split' && splitMode === 'ranges' ? (
                <label className="forge-field">
                  <span className="mono forge-label">{t('Page ranges')}</span>
                  <input
                    value={ranges}
                    placeholder="1-3, 5"
                    onChange={event => setRanges(event.target.value)}
                  />
                </label>
              ) : null}
              {pdfMode === 'reorder' ? (
                <label className="forge-field">
                  <span className="mono forge-label">{t('Page order')}</span>
                  <input
                    value={order}
                    placeholder="3, 1, 2"
                    onChange={event => setOrder(event.target.value)}
                  />
                </label>
              ) : null}
              {pdfMode === 'merge' || pdfMode === 'reorder' ? (
                <label className="forge-toggle">
                  <input type="checkbox" checked={rotate} onChange={event => setRotate(event.target.checked)} />
                  <span>{t('Turn every page 90°')}</span>
                </label>
              ) : null}
              <p className="forge-hint">
                {t('A PDF cannot be turned back into images here: that needs a page renderer Kryvex does not ship.')}
              </p>
            </>
          ) : null}

          {group === 'data' ? (
            <>
              <p className="mono forge-label">{t('Direction')}</p>
              <div className="forge-chips">
                <button
                  className={`btn ghost small ${direction === 'json-to-csv' ? 'is-active' : ''}`}
                  aria-pressed={direction === 'json-to-csv'}
                  onClick={() => setDirection('json-to-csv')}
                >
                  {t('JSON to CSV')}
                </button>
                <button
                  className={`btn ghost small ${direction === 'csv-to-json' ? 'is-active' : ''}`}
                  aria-pressed={direction === 'csv-to-json'}
                  onClick={() => setDirection('csv-to-json')}
                >
                  {t('CSV to JSON')}
                </button>
              </div>
              <p className="forge-hint">
                {t(
                  'A list of records becomes a table with one column per field. Numbers and true/false are read back as such; everything else stays text.',
                )}
              </p>
            </>
          ) : null}

          {group === 'rename' ? (
            <>
              <label className="forge-field">
                <span className="mono forge-label">{t('New name')}</span>
                <input value={pattern} onChange={event => setPattern(event.target.value)} />
              </label>
              <p className="forge-hint">
                {t('Use {name}, {n}, {ext}, {date} and {count}.')}
              </p>
              <label className="forge-field">
                <span className="mono forge-label">{t('Start counting at')}</span>
                <input
                  type="number"
                  min={1}
                  value={startAt}
                  onChange={event => setStartAt(Math.max(1, Number(event.target.value) || 1))}
                />
              </label>
              <p className="forge-hint">
                {t('Renaming touches the originals. Nothing is overwritten, and the list below is exactly what will happen.')}
              </p>
            </>
          ) : null}
        </aside>

        <div className="forge-files">
          <p className="mono forge-label">
            {usable.length === 0
              ? t('NOTHING READY')
              : t('{count} FILES READY', { count: usable.length })}
          </p>
          {files.length === 0 ? (
            <p className="forge-hint">{t('Add files to begin.')}</p>
          ) : (
            <ul className="forge-list">
              {files.map(file => {
                const used = usable.includes(file);
                return (
                  <li key={file.path} className={used ? '' : 'is-idle'}>
                    <span className="forge-file-name" title={file.path}>
                      {file.name}
                    </span>
                    <span className="mono">{formatBytes(file.size)}</span>
                    <button
                      className="icon-btn"
                      aria-label={t('Forget {name}', { name: file.name })}
                      title={t('Forget {name}', { name: file.name })}
                      onClick={() => setFiles(current => current.filter(item => item.path !== file.path))}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {group === 'rename' && steps.length > 0 ? (
            <ul className="forge-list forge-preview">
              {steps.map((step, index) => (
                <li key={`${step.from}-${index}`} className={step.error ? 'is-blocked' : ''}>
                  <span className="forge-file-name" title={step.from}>
                    {step.from}
                  </span>
                  <Icon name="forward" size={12} />
                  <span className="forge-file-name" title={step.to}>
                    {step.to}
                  </span>
                  {step.error === 'duplicate' ? <span>{t('would collide')}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {text ? (
            <div className="forge-preview-text">
              <p className="mono forge-label">{t('FIRST LINES')}</p>
              <pre className="mono">{text}</pre>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="forge-foot">
        <button className="btn primary" onClick={run} disabled={Boolean(busy) || usable.length === 0}>
          <Icon name="spark" size={14} />
          {group === 'rename' ? t('Apply the batch') : t('Convert and export a copy')}
        </button>
        {busy ? <span className="forge-busy mono">{busy}</span> : null}
        {results.length > 0 ? (
          <ul className="forge-results">
            {results.map(item => (
              <li key={item.path}>
                <span className="forge-file-name">{item.name}</span>
                <span className="mono">{formatBytes(item.size)}</span>
                <button
                  className="btn ghost tiny"
                  onClick={() => void bridge?.filesReveal(item.path)}
                  disabled={!bridge?.filesReveal}
                >
                  {t('Show in folder')}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {text ? (
          <button
            className="btn ghost small"
            onClick={() => void bridge?.filesCopyText(text)}
            disabled={!bridge?.filesCopyText}
          >
            <Icon name="copy" size={13} />
            {t('Copy the preview')}
          </button>
        ) : null}
      </footer>
    </section>
  );
}
