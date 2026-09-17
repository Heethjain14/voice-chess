export function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0)
  );

  for (let i = 0; i < rows; i++) distances[i][0] = i;
  for (let j = 0; j < cols; j++) distances[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost
      );
    }
  }

  return distances[rows - 1][cols - 1];
}

export function closestMatch(
  token: string,
  vocabulary: string[],
  maxDistance = 2
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;

  for (const word of vocabulary) {
    const distance = levenshteinDistance(token, word);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = word;
    }
  }

  if (best !== null && bestDistance <= maxDistance) {
    return best;
  }

  return null;
}
