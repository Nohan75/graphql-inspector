import type { GQLRequest } from '../types';

/**
 * How the duration and the response size of a captured request are written.
 * Units and rounding are the ones of the DevTools Network panel, so that a
 * value reads the same in both.
 */

type Measures = Pick<GQLRequest, 'duration' | 'responseSize'>;

/** A duration in milliseconds: "38 ms", "1.84 s", "1.5 min" */
export function formatDuration(milliseconds: number): string {
  const rounded = Math.round(milliseconds);
  if (rounded < 1000) return `${rounded} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

/** A size in bytes, in units of 1000: "412 B", "2.3 kB", "165 kB", "1.4 MB" */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const kilobytes = bytes / 1000;
  if (kilobytes < 100) return `${kilobytes.toFixed(1)} kB`;
  if (kilobytes < 1000) return `${Math.round(kilobytes)} kB`;
  const megabytes = kilobytes / 1000;
  return megabytes < 100 ? `${megabytes.toFixed(1)} MB` : `${Math.round(megabytes)} MB`;
}

/**
 * What a row says of a request: its duration, then the size of its response.
 * Empty when neither was measured, as for a pending request.
 */
export function measuresLabel({ duration, responseSize }: Measures): string {
  return [
    ...(duration === undefined ? [] : [formatDuration(duration)]),
    ...(responseSize === undefined ? [] : [formatSize(responseSize)]),
  ].join(' · ');
}

/** The tooltip that goes with `measuresLabel`: each value named, and in full */
export function measuresTitle({ duration, responseSize }: Measures): string {
  const count = (value: number) => Math.round(value).toLocaleString('en-US');
  return [
    ...(duration === undefined ? [] : [`Duration: ${count(duration)} ms`]),
    ...(responseSize === undefined
      ? []
      : [`Response size: ${count(responseSize)} byte${responseSize === 1 ? '' : 's'}, uncompressed`]),
  ].join('\n');
}
