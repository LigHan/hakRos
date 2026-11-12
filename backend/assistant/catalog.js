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
        const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
        const entryType = ['free', 'paid'].includes(item.entry_type) && field(item.price_source, 300) ? item.entry_type : 'unknown';
        return [{ id: String(item.id).slice(0, 100), name: field(item.place, 120), category: field(item.category, 60), address: field(item.address, 160), description: field(item.bio, 300), image: /^(https?:\/\/|\/api\/)/i.test(image) ? image : null, rating,
          entryType, entryPrice: entryType === 'free' ? 0 : entryType === 'paid' ? number(item.entry_price) : null,
          spendMin: field(item.price_source, 300) ? number(item.spend_min) : null, spendMax: field(item.price_source, 300) ? number(item.spend_max) : null,
          priceSource: field(item.price_source, 300), priceUpdatedAt: field(item.price_updated_at, 40) }];
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
    return candidates.map((place, index) => ({ place, index, score: words.reduce((score, word) => score + Number(`${place.name} ${place.description}`.toLocaleLowerCase('ru').includes(word)), 0), budget: budgetMatch(place, intent) }))
      .filter(item => item.budget !== 'over' && (!words.length || intent.category || item.score > 0))
      .sort((a, b) => Number(b.budget === 'fits') - Number(a.budget === 'fits') || b.score - a.score || (b.place.rating ?? -1) - (a.place.rating ?? -1) || a.index - b.index).slice(0, 3).map(({ place, budget }) => card(place, Boolean(intent.category), budget));
  }

  function budgetMatch(place, intent) {
    if (intent.budget === null || intent.currency !== 'RUB') return 'unknown';
    if (place.entryPrice !== null && place.entryPrice > intent.budget) return 'over';
    if (place.entryPrice !== null && place.spendMin !== null && place.entryPrice + place.spendMin > intent.budget) return 'over';
    if (place.entryPrice !== null && place.spendMax !== null) return place.entryPrice + place.spendMax <= intent.budget ? 'fits' : 'unknown';
    return 'unknown';
  }

  function card(place, matchedCategory, budget = 'unknown') {
    return { placeId: place.id, name: place.name, address: place.address, image: place.image, category: place.category, description: place.description,
      reason: matchedCategory ? 'Категория соответствует твоему запросу.' : place.rating !== null ? `Рейтинг в каталоге: ${place.rating}.` : 'Место есть в каталоге приложения.',
      price: place.entryPrice, pricing: { entryType: place.entryType, entryPrice: place.entryPrice, spendMin: place.spendMin, spendMax: place.spendMax, source: place.priceSource, updatedAt: place.priceUpdatedAt }, budgetMatch: budget, durationMinutes: null, workingHours: null, actions: ['open_place', 'route', 'create_plan'] };
  }

  async function resolveMention(text, shownIds = [], selectedId = null) {
    const places = await load();
    if (!places) return null;
    const normalize = value => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const words = normalize(text).split(' ');
    const score = place => {
      const names = normalize(place.name).split(' ').filter(word => word.length >= 4);
      return names.reduce((n, word) => n + Number(words.some(candidate => candidate.length >= 4 && (candidate === word || (word.length >= 6 && candidate.slice(0, 5) === word.slice(0, 5))))), 0);
    };
    const ranked = places.map(place => ({ place, score: score(place) })).filter(item => item.score > 0).sort((a,b) => b.score - a.score);
    if (ranked.length) return ranked.filter(item => item.score === ranked[0].score).map(item => card(item.place, false));
    if (selectedId) return places.filter(place => place.id === selectedId).map(place => card(place, false));
    if (/(?:^|\s)(?:это|этом|туда|него|нее)(?:$|[\s?!.,])/iu.test(text) && shownIds.length === 1) return places.filter(place => place.id === shownIds[0]).map(place => card(place, false));
    return [];
  }

  async function byIds(ids) {
    const places = await load();
    return places === null ? null : ids.flatMap(id => places.filter(place => place.id === id).map(place => card(place, false)));
  }

  return { find, select, resolveMention, byIds };
}

module.exports = { createCatalog };
