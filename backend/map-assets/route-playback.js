(() => {
  const radians = degrees => degrees * Math.PI / 180;

  function buildTrack(coordinates) {
    const segments = [];
    let length = 0;
    for (let index = 1; index < coordinates.length; index++) {
      const from = coordinates[index - 1];
      const to = coordinates[index];
      const latitude = radians(to[1] - from[1]);
      const longitude = radians(to[0] - from[0]);
      const a = radians(from[1]);
      const b = radians(to[1]);
      const haversine = Math.sin(latitude / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(longitude / 2) ** 2;
      const meters = 2 * 6_371_000 * Math.asin(Math.sqrt(Math.min(1, haversine)));
      if (meters === 0) continue;
      const bearing = Math.atan2(Math.sin(longitude) * Math.cos(b),
        Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(longitude)) * 180 / Math.PI;
      segments.push({ from, to, meters, end: length + meters, bearing });
      length += meters;
    }
    return { length, segments, first: coordinates[0] };
  }

  function sampleTrack(track, fraction) {
    if (!track.segments.length) return { position: track.first, bearing: 0 };
    const target = track.length * Math.max(0, Math.min(1, fraction));
    let low = 0;
    let high = track.segments.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (track.segments[middle].end < target) low = middle + 1;
      else high = middle;
    }
    const { from, to, meters, end, bearing } = track.segments[low];
    const progress = Math.max(0, Math.min(1, 1 - (end - target) / meters));
    return {
      position: [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress],
      bearing,
    };
  }

  function createRoutePlayback(map, notify) {
    let track;
    let playback;
    let marker;
    let frame;
    let cameraUpdateAt = 0;
    let following = false;

    function releaseCamera() {
      if (!following) return;
      following = false;
      notify({ type: 'route-camera-move', runId: playback.runId });
    }

    map.on('dragstart', releaseCamera);
    map.on('zoomstart', event => { if (event.originalEvent) releaseCamera(); });
    map.on('rotatestart', event => { if (event.originalEvent) releaseCamera(); });

    function clear() {
      cancelAnimationFrame(frame);
      marker?.remove();
      marker = undefined;
      track = undefined;
      playback = undefined;
      following = false;
    }

    function render(now, recenter = false) {
      const playing = playback.startedAt != null;
      const runningTime = playing ? Math.max(0, Date.now() - playback.startedAt) : 0;
      const fraction = Math.min(1, (playback.elapsedMs + runningTime) / playback.durationMs);
      const { position, bearing } = sampleTrack(track, fraction);
      marker.setLngLat(position).setRotation(bearing);

      if (following && (recenter || (playing && (now >= cameraUpdateAt || fraction === 1)))) {
        const height = map.getContainer().clientHeight;
        const lead = playing ? 180 / playback.durationMs : 0;
        map.easeTo({
          center: sampleTrack(track, fraction + lead).position,
          offset: [0, -Math.round(Math.min(84, height * 0.12))],
          zoom: recenter ? Math.max(15.5, map.getZoom()) : map.getZoom(),
          duration: recenter ? 320 : 240,
          easing: progress => progress,
        });
        cameraUpdateAt = now + (recenter ? 320 : 240);
      }
      if (playing && fraction < 1) frame = requestAnimationFrame(render);
    }

    function update(route, next) {
      if (!route || !next || next.routeSequence !== route.sequence) {
        if (playback) clear();
        return;
      }
      const newRun = !playback || playback.runId !== next.runId || playback.routeSequence !== next.routeSequence;
      if (!newRun && playback.startedAt === next.startedAt && playback.elapsedMs === next.elapsedMs &&
          playback.followCamera === next.followCamera) return;

      cancelAnimationFrame(frame);
      const wasFollowing = playback?.followCamera;
      if (newRun) {
        clear();
        track = buildTrack(route.coordinates);
        const element = document.createElement('div');
        element.className = 'route-playback-marker';
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', 'Положение в симуляции маршрута');
        marker = new maplibregl.Marker({
          element, rotationAlignment: 'map', pitchAlignment: 'viewport', subpixelPositioning: true,
        })
          .setLngLat(track.first).addTo(map);
      }
      const recenter = next.followCamera && (newRun || !wasFollowing);
      if (newRun || next.followCamera !== wasFollowing) following = next.followCamera;
      playback = next;
      render(performance.now(), recenter);
    }

    return { update, releaseCamera };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { buildTrack, sampleTrack };
  else window.createRoutePlayback = createRoutePlayback;
})();
