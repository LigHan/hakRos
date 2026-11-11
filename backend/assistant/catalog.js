// Only public place fields are sent to the model; account and review data stay out.
function createCatalog({ url, fetchImpl = fetch } = {}) {
  async function find(message, history) {
    if (!url) return null;
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data)) return null;
      const words = `${history.map(item => item.content).join(' ')} ${message}`
        .toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{4,}/gu) || [];
      return data.slice(0, 1000).flatMap(item => {
        if (!item || typeof item.place !== 'string' || !item.place.trim() || !['string', 'number'].includes(typeof item.id)) return [];
        const field = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
        const place = { id: String(item.id).slice(0, 100), name: field(item.place, 120), category: field(item.category, 60), address: field(item.address, 160), description: field(item.bio, 300) };
        const text = `${place.name} ${place.category} ${place.address} ${place.description}`.toLocaleLowerCase('ru');
        return [{ place, score: words.reduce((score, word) => score + Number(text.includes(word)), 0) }];
      }).sort((a, b) => b.score - a.score).slice(0, 12).map(item => item.place);
    } catch {
      return null;
    }
  }
  return { find };
}

module.exports = { createCatalog };
