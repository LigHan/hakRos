// Only public place fields are sent to the model; account and review data stay out.
function createCatalog({ url, loadPosts, fetchImpl = fetch } = {}) {
  async function load() {
    if (!url && !loadPosts) return null;
    try {
      let data;
      if (loadPosts) data = await loadPosts();
      else {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(4000) });
        if (!response.ok) return null;
        data = await response.json();
      }
      if (!Array.isArray(data)) return null;
      return data.slice(0, 1000).flatMap(item => {
        if (!item || typeof item.place !== 'string' || !item.place.trim() || !['string', 'number'].includes(typeof item.id) || !/^[\w-]{1,128}$/.test(String(item.id))) return [];
        const field = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
        const image = field(item.image, 2000);
        const rating = typeof item.rating === 'number' && Number.isFinite(item.rating) && item.rating >= 0 && item.rating <= 5 ? item.rating : null;
        return [{ id: String(item.id).slice(0, 100), name: field(item.place, 120), category: field(item.category, 60), address: field(item.address, 160), description: field(item.bio, 300), image: /^(https?:\/\/|\/api\/)/i.test(image) ? image : null, rating }];
      });
    } catch {
      return null;
    }
  }

  async function find(message, history) {
    const places = await load();
    if (!places) return null;
    const words = `${history.map(item => item.content).join(' ')} ${message}`.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{4,}/gu) || [];
    return places.map(place => ({ place, score: words.reduce((score, word) => score + Number(`${place.name} ${place.category} ${place.address} ${place.description}`.toLocaleLowerCase('ru').includes(word)), 0) }))
      .sort((a, b) => b.score - a.score).slice(0, 12).map(item => item.place);
  }

  async function select(intent, placeId, excludePlaceIds = []) {
    const places = await load();
    if (!places) return null;
    if (placeId) return places.filter(place => place.id === placeId).slice(0, 1).map(place => card(place, false));
    const candidates = places.filter(place => !excludePlaceIds.includes(place.id) && !intent.excludedCategories.includes(place.category) && (!intent.category || place.category === intent.category));
    const words = intent.interests.map(word => word.toLocaleLowerCase('ru').slice(0, 5)).filter(word => word.length >= 4);
    return candidates.map((place, index) => ({ place, index, score: words.reduce((score, word) => score + Number(`${place.name} ${place.description}`.toLocaleLowerCase('ru').includes(word)), 0) }))
      .sort((a, b) => b.score - a.score || (b.place.rating ?? -1) - (a.place.rating ?? -1) || a.index - b.index).slice(0, 3).map(({ place }) => card(place, Boolean(intent.category)));
  }

  function card(place, matchedCategory) {
    return { placeId: place.id, name: place.name, address: place.address, image: place.image, category: place.category, description: place.description,
      reason: matchedCategory ? 'Категория соответствует твоему запросу.' : place.rating !== null ? `Рейтинг в каталоге: ${place.rating}.` : 'Место есть в каталоге приложения.',
      price: null, durationMinutes: null, workingHours: null, actions: ['open_place', 'route', 'create_plan'] };
  }

  return { find, select };
}

module.exports = { createCatalog };
