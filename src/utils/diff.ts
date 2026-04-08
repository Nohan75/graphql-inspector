export type DiffLineType = 'equal' | 'added' | 'removed';

export interface DiffLine {
  type: DiffLineType;
  value: string;
}

/**
 * Compute a line-by-line diff between two strings using the LCS algorithm.
 * Returns an array of DiffLine objects with type 'equal', 'added', or 'removed'.
 *
 * 'added'   → line exists in B but not A  (shown as +, green)
 * 'removed' → line exists in A but not B  (shown as −, red)
 * 'equal'   → line exists in both
 *
 * Falls back to "all removed then all added" for very large inputs (>300 lines each)
 * to avoid O(m·n) memory issues.
 */
export function diffLines(textA: string, textB: string): DiffLine[] {
  if (!textA && !textB) return [];
  if (!textA) return textB.split('\n').map((v) => ({ type: 'added' as const, value: v }));
  if (!textB) return textA.split('\n').map((v) => ({ type: 'removed' as const, value: v }));

  const a = textA.split('\n');
  const b = textB.split('\n');
  const MAX = 300;

  // Guard against huge inputs (e.g. large JSON responses)
  if (a.length > MAX || b.length > MAX) {
    return [
      ...a.map((v) => ({ type: 'removed' as const, value: v })),
      ...b.map((v) => ({ type: 'added' as const, value: v })),
    ];
  }

  const m = a.length;
  const n = b.length;

  // Build LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Iterative backtrack to build result
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'equal', value: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: b[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', value: a[i - 1] });
      i--;
    }
  }

  return result;
}
