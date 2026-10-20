import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { hexToRgb, hsvToHex, normalizeHex, rgbToHex, rgbToHsv } from '../lib/color';

const FALLBACK = { r: 0, g: 0, b: 0 };

export function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const rgb = hexToRgb(value) ?? FALLBACK;
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  const plane = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(value.replace('#', ''));

  useEffect(() => {
    setDraft(value.replace('#', ''));
  }, [value]);

  function pick(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const saturation = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const brightness = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height));
    onChange(hsvToHex(hsv.h, saturation, brightness));
  }

  function setChannel(channel: 'r' | 'g' | 'b', raw: string) {
    const amount = Number(raw);
    if (!Number.isFinite(amount)) return;
    const next = { ...rgb, [channel]: Math.min(255, Math.max(0, Math.round(amount))) };
    onChange(rgbToHex(next.r, next.g, next.b));
  }

  function commitHex() {
    const normalized = normalizeHex(draft);
    if (normalized) onChange(normalized);
    else setDraft(value.replace('#', ''));
  }

  return (
    <div className="color-picker">
      <span className="color-picker-label">{label}</span>
      <div
        ref={plane}
        className="color-plane"
        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pick(event);
        }}
        onPointerMove={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
        }}
        aria-hidden="true"
      >
        <span
          className="color-plane-marker"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: value,
          }}
        />
      </div>
      <input
        className="color-hue"
        type="range"
        min={0}
        max={359}
        value={hsv.h}
        aria-label={`${label} hue`}
        onChange={event => onChange(hsvToHex(Number(event.target.value), hsv.s || 1, hsv.v || 1))}
      />
      <div className="color-values">
        <label className="color-hex">
          <span aria-hidden="true">HEX</span>
          <input
            value={draft}
            maxLength={6}
            spellCheck={false}
            aria-label={`${label} hex value`}
            onChange={event => {
              const next = event.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 6);
              setDraft(next);
              const normalized = normalizeHex(next);
              if (normalized) onChange(normalized);
            }}
            onBlur={commitHex}
            onKeyDown={event => {
              if (event.key === 'Enter') commitHex();
            }}
          />
        </label>
        {(['r', 'g', 'b'] as const).map(channel => (
          <label key={channel} className="color-channel">
            <span aria-hidden="true">{channel.toUpperCase()}</span>
            <input
              type="number"
              min={0}
              max={255}
              value={rgb[channel]}
              aria-label={`${label} ${channel.toUpperCase()}`}
              onChange={event => setChannel(channel, event.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
