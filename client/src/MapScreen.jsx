import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { fmt, getLocality, norm } from './api.js';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const RTL_PLUGIN = 'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js';
const PLACE_CLASSES = ['city', 'town', 'village', 'hamlet', 'suburb'];

try { maplibregl.setRTLTextPlugin(RTL_PLUGIN, false); } catch { /* already set */ }

export default function MapScreen({ localities, year, visible, onOpen, onSelect }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const locRef = useRef({ byCode: new Map(), byName: new Map() });
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(null); // { name, code?, details?, loading? }
  const [term, setTerm] = useState('');

  const index = useMemo(() => {
    const byCode = new Map(), byName = new Map();
    for (const l of localities || []) { byCode.set(l.code, l); byName.set(norm(l.name), l); }
    return { byCode, byName };
  }, [localities]);
  locRef.current = index;

  // Select a locality by YeshuvKod; details come from the API (Oracle).
  const selectCode = (code, lngLat, fly = true) => {
    const l = locRef.current.byCode.get(code);
    if (!l) return;
    const at = lngLat || (l.lon != null ? [l.lon, l.lat] : null);
    placeMarker(at, fly);
    setSelected({ name: l.name, code, loading: true });
    getLocality(code)
      .then((details) => setSelected((s) => (s && s.code === code ? { name: details.name, code, details } : s)))
      .catch(() => setSelected((s) => (s && s.code === code ? { name: l.name, code, failed: true } : s)));
  };

  const placeMarker = (at, fly) => {
    const map = mapRef.current;
    markerRef.current?.remove();
    if (!at || !map) return;
    markerRef.current = new maplibregl.Marker({ color: '#1a5fd6' }).setLngLat(at).addTo(map);
    if (fly) map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 13.5), pitch: 62, speed: 0.9, essential: true });
  };

  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current, style: STYLE,
      center: [35.0, 31.75], zoom: 8.3, pitch: 58, bearing: -12, maxPitch: 75,
      maxBounds: [[32.5, 28.8], [37.8, 34.0]],
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');

    let placeLayers = [];
    map.on('load', () => {
      for (const l of map.getStyle().layers) {
        if (l.type !== 'symbol') continue;
        if (l.layout?.['text-field']) map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:he'], ['get', 'name']]);
        if (l['source-layer'] === 'place') placeLayers.push(l.id);
      }
      map.addSource('localities', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'localities-dot', type: 'circle', source: 'localities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 4, 12, 8],
          'circle-color': '#1a5fd6', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
        },
      });
      setReady(true);
    });

    const dataAt = (pt) => map.getLayer('localities-dot')
      ? map.queryRenderedFeatures([[pt.x - 6, pt.y - 6], [pt.x + 6, pt.y + 6]], { layers: ['localities-dot'] })[0]
      : null;
    const labelAt = (pt) => placeLayers.length
      ? map.queryRenderedFeatures([[pt.x - 14, pt.y - 14], [pt.x + 14, pt.y + 14]], { layers: placeLayers })
          .find((f) => PLACE_CLASSES.includes(f.properties.class))
      : null;

    map.on('mousemove', (e) => { map.getCanvas().style.cursor = dataAt(e.point) || labelAt(e.point) ? 'pointer' : ''; });
    map.on('click', (e) => {
      const dot = dataAt(e.point);
      if (dot) return selectCode(dot.properties.code, dot.geometry.coordinates);
      const label = labelAt(e.point);
      if (!label) return;
      // A basemap label: resolve to a YeshuvKod when the locality exists in the data.
      const name = label.properties['name:he'] || label.properties.name;
      const hit = locRef.current.byName.get(norm(name));
      if (hit) return selectCode(hit.code, hit.lon != null ? null : label.geometry.coordinates);
      placeMarker(label.geometry.coordinates, true);
      setSelected({ name, code: null });
    });
    return () => map.remove();
  }, []);

  // Localities layer: one point per YeshuvKod that has coordinates.
  useEffect(() => {
    if (!ready || !localities) return;
    mapRef.current.getSource('localities').setData({
      type: 'FeatureCollection',
      features: localities.filter((l) => l.lat != null && l.lon != null).map((l) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [l.lon, l.lat] },
        properties: { code: l.code, name: l.name, records: l.records },
      })),
    });
  }, [ready, localities]);

  useEffect(() => { if (visible) mapRef.current?.resize(); }, [visible]);
  useEffect(() => { onSelect?.(selected?.code || null); }, [selected?.code]);

  const k = norm(term);
  const suggestions = k && localities ? localities.filter((l) => norm(l.name).includes(k)).slice(0, 12) : [];
  const pick = (l) => { setTerm(''); selectCode(l.code); };

  return (
    <>
      <div ref={el} className="map" />
      <div className="search">
        <input
          value={term} placeholder="🔍 חיפוש עיר או יישוב" autoComplete="off"
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && suggestions[0]) pick(suggestions[0]); }}
        />
        {suggestions.length > 0 && (
          <div className="sugg">
            {suggestions.map((l) => (
              <div key={l.code} onClick={() => pick(l)}>
                <span>{l.name}</span><small>{fmt(l.records)} רשומות</small>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="card">
          <div className="hd"><b>📍 {selected.name}</b><button className="x" onClick={() => setSelected(null)}>✕</button></div>
          {!selected.code && (
            <div className="note"><b>אין נתונים זמינים ליישוב זה בקובץ המקור.</b><br />היעדר נתונים אינו מעיד על היעדר פשיעה.</div>
          )}
          {selected.loading && <div className="note">טוען נתונים…</div>}
          {selected.failed && <div className="note">שגיאה בטעינת הנתונים מהשרת.</div>}
          {selected.details && (
            <>
              <div className="row">📊 רשומות עבירה: <b>{fmt(selected.details.records)}</b></div>
              <div className="row">🧾 מזהים ייחודיים: <b>{fmt(selected.details.uniqueIds)}</b></div>
              <div className="row">📅 שנת נתונים: <b>{selected.details.year ?? year}</b> · קוד יישוב {selected.code}</div>
              {selected.details.lat == null && <div className="note">ליישוב זה אין מיקום בשכבת המפה.</div>}
              <button className="btn" onClick={() => onOpen(selected.code)}>למסך הנתונים המלא ‹</button>
            </>
          )}
        </div>
      )}
      <div className="hint">לחצו על נקודה כחולה או על שם יישוב · גרירה ימנית / Ctrl+גרירה לסיבוב והטיה</div>
    </>
  );
}
