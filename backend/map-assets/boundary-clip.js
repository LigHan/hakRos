/* Divide provider lines at the local mask; never discard their distant portions. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BoundaryClip = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const eq = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  function ringContains(ring, p) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function build(mask) {
    const polygons = mask.type === 'Polygon' ? [mask.coordinates] : mask.coordinates;
    const edges = [];
    for (const polygon of polygons) for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        edges.push({ a, b, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]) });
      }
    }
    const contains = p => polygons.some(poly => ringContains(poly[0], p) && !poly.slice(1).some(ring => ringContains(ring, p)));
    const bounds = edges.reduce((b, e) => [Math.min(b[0], e.minX), Math.min(b[1], e.minY), Math.max(b[2], e.maxX), Math.max(b[3], e.maxY)], [Infinity, Infinity, -Infinity, -Infinity]);
    function split(geometry) {
      const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
      let nearby = false;
      for (const line of lines) for (const p of line) {
        if (p[0] >= bounds[0] && p[0] <= bounds[2] && p[1] >= bounds[1] && p[1] <= bounds[3]) nearby = true;
      }
      // Some long segments cross the mask even if neither endpoint is nearby.
      if (!nearby) for (const line of lines) for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        if (Math.max(a[0], b[0]) >= bounds[0] && Math.min(a[0], b[0]) <= bounds[2] && Math.max(a[1], b[1]) >= bounds[1] && Math.min(a[1], b[1]) <= bounds[3]) nearby = true;
      }
      if (!nearby) return { affected: false, outside: [], inside: [] };
      const outside = [], inside = []; let affected = false;
      for (const line of lines) {
        let current = null, previousInside = null;
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1], b = line[i], v = sub(b, a), cuts = [0, 1];
          const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]), minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
          for (const edge of edges) {
            if (edge.maxX < minX || edge.minX > maxX || edge.maxY < minY || edge.minY > maxY) continue;
            const w = sub(edge.b, edge.a), denominator = cross(v, w);
            if (Math.abs(denominator) < 1e-14) continue;
            const offset = sub(edge.a, a), t = cross(offset, w) / denominator, u = cross(offset, v) / denominator;
            if (t > 1e-10 && t < 1 - 1e-10 && u >= 0 && u <= 1) { cuts.push(t); affected = true; }
          }
          cuts.sort((x, y) => x - y);
          const at = t => [a[0] + v[0] * t, a[1] + v[1] * t];
          for (let j = 1; j < cuts.length; j++) {
            if (cuts[j] - cuts[j - 1] < 1e-10) continue;
            const start = at(cuts[j - 1]), end = at(cuts[j]);
            const isInside = contains(at((cuts[j - 1] + cuts[j]) / 2));
            if (isInside) affected = true;
            if (!current || isInside !== previousInside || !eq(current[current.length - 1], start)) {
              current = [start]; (isInside ? inside : outside).push(current);
            }
            previousInside = isInside;
            current.push(end);
          }
        }
      }
      return { affected, outside: outside.filter(line => line.length > 1), inside: inside.filter(line => line.length > 1) };
    }
    function clip(geometry) { const result = split(geometry); return { affected: result.affected, coordinates: result.outside }; }
    return { clip, split };
  }
  return { build };
});
