/** Rank by categories of places liked or saved on this device; preserve server order for ties. */
export function rankRecommendations<T extends { id: string; category: string }>(places: T[], savedIds: string[], likedIds: string[]): T[] {
  const scores = new Map<string, number>();
  const saved = new Set(savedIds), liked = new Set(likedIds);
  for (const place of places) {
    if (!place.category) continue;
    const weight = (saved.has(place.id) ? 2 : 0) + (liked.has(place.id) ? 1 : 0);
    if (weight) scores.set(place.category, (scores.get(place.category) ?? 0) + weight);
  }
  return places.map((place, index) => ({ place, index, score: scores.get(place.category) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.place);
}
