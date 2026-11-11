(() => {
  const icons = {
    cafe: 'M4 8h13v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V8Zm13 1h2a2 2 0 0 1 0 4h-2M3 21h17M8 5V3m5 2V3',
    restaurant: 'M4 3v6a3 3 0 0 0 6 0V3M7 3v18m11 0V3c-3 2-4 5-4 9h4',
    park: 'M19 4C11 4 5 7 5 13a6 6 0 0 0 6 6c6 0 9-6 9-14V4h-1ZM3 21l12-12',
    museum: 'M3 8l9-5 9 5v2H3V8Zm2 2v8m5-8v8m4-8v8m5-8v8M3 18h18v3H3z',
    shop: 'M4 9h16l1 12H3L4 9Zm4 0V7a4 4 0 0 1 8 0v2',
    entertainment: 'M7 7h10a4 4 0 0 1 4 3l1 5a3 3 0 0 1-5 3l-2-2H9l-2 2a3 3 0 0 1-5-3l1-5a4 4 0 0 1 4-3Zm0 3v4m-2-2h4m6 0h.01m3 1h.01',
    place: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z M14 10a2 2 0 1 1-4 0 2 2 0 1 1 4 0Z',
    person: 'M16 8a4 4 0 1 1-8 0 4 4 0 1 1 8 0ZM4 21v-1a8 8 0 0 1 16 0v1',
    'route-start': 'm4 11 16-7-7 16-2-7-7-2Z',
    'route-destination': 'M5 21V4m0 1c5-4 8 3 14-1v10c-6 4-9-3-14 1',
    chosen: 'M12 3v4m0 10v4m-9-9h4m10 0h4M17 12a5 5 0 1 1-10 0 5 5 0 1 1 10 0Z',
  };
  const categoryNames = new Map([
    ['cafe', 'Кафе'], ['restaurant', 'Ресторан'], ['park', 'Парк'],
    ['museum', 'Музей'], ['shop', 'Магазин'], ['entertainment', 'Развлечения'],
  ]);
  const svgNamespace = 'http://www.w3.org/2000/svg';

  function icon(name) {
    const svg = document.createElementNS(svgNamespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svgNamespace, 'path');
    path.setAttribute('d', icons[name]);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    return svg;
  }

  function coverUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value, location.origin);
      if (url.username || url.password) return null;
      if (value.startsWith('/api/place-covers/')) return url.href;
      return /^https?:\/\//i.test(value) ? url.href : null;
    } catch {
      return null;
    }
  }

  function addImage(container, src, className, onLoad) {
    const image = document.createElement('img');
    image.className = className;
    image.alt = '';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), { once: true });
    if (onLoad) image.addEventListener('load', onLoad, { once: true });
    container.prepend(image);
    image.src = src;
  }

  function caption(container, text) {
    const element = document.createElement('div');
    element.className = 'map-pin-caption';
    element.textContent = text;
    container.append(element);
  }

  function action(container, label, message, notify) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-pin-action';
    button.textContent = label;
    button.addEventListener('click', event => {
      event.stopPropagation();
      notify(message);
    });
    container.append(button);
  }

  function placePopup(point, person, nearby, image, notify) {
    const card = document.createElement('div');
    card.className = 'map-pin-card';
    const body = document.createElement('div');
    body.className = 'map-pin-card-body';
    card.append(body);
    const name = document.createElement('strong');
    name.textContent = point.name;
    body.append(name);
    if (person) {
      caption(body, 'Примерная геопозиция друга');
    } else {
      const category = categoryNames.get(point.category);
      if (nearby) caption(body, 'Заведение из подписок рядом');
      if (category || point.address) caption(body, [category, point.address].filter(Boolean).join(' · '));
      if (point.postId) action(body, 'Открыть карточку', { type: 'open-place', id: point.id }, notify);
      if (point.isOwn && point.reviewStatus) {
        caption(body, { private: 'Видно вам и друзьям', pending: 'На проверке', approved: 'Опубликовано' }[point.reviewStatus]);
        if (point.reviewStatus === 'private') action(body, 'Отправить на проверку', { type: 'submit', id: point.id }, notify);
      }
    }
    const popup = new maplibregl.Popup({ offset: 27, maxWidth: '240px', focusAfterOpen: false }).setDOMContent(card);
    if (image && !nearby) popup.once('open', () => addImage(card, image, 'map-pin-thumbnail'));
    return popup;
  }

  window.createMapMarkers = (map, notify) => {
    const entries = new Map();

    function renderPin(key, point, kind, destination, active) {
      const person = kind === 'person';
      const interactive = person || kind === 'place';
      const nearby = kind === 'place' && point.nearbySubscription === true;
      const variant = kind === 'place' && categoryNames.has(point.category) ? point.category : kind;
      const label = nearby ? point.name + ' — заведение из подписок рядом' : point.name;
      const image = kind === 'place' ? coverUrl(point.image) : null;
      const signature = JSON.stringify([label, variant, point.postId, point.address, image, point.avatar, point.isOwn, point.reviewStatus, destination]);
      const previous = entries.get(key);
      const position = [point.longitude, point.latitude];
      active.add(key);
      if (previous?.signature === signature) {
        const old = previous.marker.getLngLat();
        if (old.lat !== point.latitude || old.lng !== point.longitude) previous.marker.setLngLat(position);
        return;
      }

      const open = previous?.popup?.isOpen();
      previous?.marker.remove();
      const element = document.createElement('div');
      element.className = 'pin pin-' + variant;
      if (nearby) element.classList.add('nearby-subscription');
      if (destination) element.classList.add('pin-current-destination');
      element.setAttribute('role', interactive ? 'button' : 'img');
      element.setAttribute('aria-label', label);
      const face = document.createElement('div');
      face.className = 'pin-face';
      face.append(icon(variant));
      element.append(face);
      const showImage = () => face.classList.add('photo-ready');
      if (person && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(point.avatar || '')) {
        addImage(face, point.avatar, 'pin-avatar', showImage);
      }
      const marker = new maplibregl.Marker({ element }).setLngLat(position);
      const popup = interactive ? placePopup(point, person, nearby, image, notify) : null;
      if (popup) {
        popup.on('open', () => element.classList.add('pin-open'));
        popup.on('close', () => element.classList.remove('pin-open'));
        if (nearby && image) popup.once('open', () => addImage(face, image, 'pin-photo', showImage));
        marker.setPopup(popup);
      }
      marker.addTo(map);
      if (open && popup) marker.togglePopup();
      entries.set(key, { marker, popup, signature });
    }

    return state => {
      const active = new Set();
      const draw = (key, point, kind, destination = false) => {
        if (Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)) {
          renderPin(key, point, kind, destination, active);
        }
      };
      const destination = state.destination;
      for (const point of state.places || []) draw('place:' + point.id, point, 'place', point.id === destination?.pointId);
      for (const point of state.people || []) draw('person:' + point.id, point, 'person');
      draw('chosen', state.selected && { ...state.selected, name: 'Выбранная точка' }, 'chosen');
      draw('route-start', state.routeStart && { ...state.routeStart, name: 'Начало маршрута' }, 'route-start');
      if (destination && !active.has('place:' + destination.pointId)) {
        draw('route-destination', { ...destination, name: destination.title }, 'route-destination');
      }
      for (const [key, entry] of entries) {
        if (active.has(key)) continue;
        entry.marker.remove();
        entries.delete(key);
      }
    };
  };
})();
