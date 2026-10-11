import { describe, expect, it } from 'vitest';
import { formatDuration, formatSize, measuresLabel, measuresTitle } from './measures';

describe('a duration', () => {
  it.each([
    [0, '0 ms'],
    [38, '38 ms'],
    [87.4, '87 ms'],
    [999, '999 ms'],
    [1_000, '1.00 s'],
    [1_840, '1.84 s'],
    [12_345, '12.35 s'],
    [60_000, '1.0 min'],
    [90_000, '1.5 min'],
  ])('of %d milliseconds is written %s', (milliseconds, written) => {
    expect(formatDuration(milliseconds)).toBe(written);
  });

  it('is written in seconds once it rounds to 1000 milliseconds', () => {
    expect(formatDuration(999.6)).toBe('1.00 s');
  });
});

describe('a response size', () => {
  it.each([
    [0, '0 B'],
    [412, '412 B'],
    [999, '999 B'],
    [1_000, '1.0 kB'],
    [2_314, '2.3 kB'],
    [99_940, '99.9 kB'],
    [100_000, '100 kB'],
    [164_500, '165 kB'],
    [1_000_000, '1.0 MB'],
    [1_400_000, '1.4 MB'],
    [2_000_001, '2.0 MB'],
    [150_000_000, '150 MB'],
  ])('of %d bytes is written %s', (bytes, written) => {
    expect(formatSize(bytes)).toBe(written);
  });
});

describe('what a row says of a request', () => {
  it('is its duration, then the size of its response', () => {
    expect(measuresLabel({ duration: 1_840, responseSize: 2_314 })).toBe('1.84 s · 2.3 kB');
  });

  it('is the one that was measured when the other was not', () => {
    expect(measuresLabel({ duration: 120 })).toBe('120 ms');
    expect(measuresLabel({ responseSize: 412 })).toBe('412 B');
  });

  it('is empty when neither was measured, as for a pending request', () => {
    expect(measuresLabel({})).toBe('');
  });

  it('counts a duration and a size of 0 as measured', () => {
    expect(measuresLabel({ duration: 0, responseSize: 0 })).toBe('0 ms · 0 B');
  });
});

describe('the tooltip of what a row says of a request', () => {
  it('names each value and gives it in full', () => {
    expect(measuresTitle({ duration: 1_840.4, responseSize: 2_314 })).toBe(
      'Duration: 1,840 ms\nResponse size: 2,314 bytes, uncompressed'
    );
  });

  it('has a line for the one that was measured only', () => {
    expect(measuresTitle({ duration: 120 })).toBe('Duration: 120 ms');
    expect(measuresTitle({ responseSize: 1 })).toBe('Response size: 1 byte, uncompressed');
  });

  it('is empty when neither was measured', () => {
    expect(measuresTitle({})).toBe('');
  });
});
