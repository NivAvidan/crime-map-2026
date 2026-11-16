import { useEffect, useState } from 'react';
import { getLocalities, getMeta } from './api.js';
import MapScreen from './MapScreen.jsx';
import CityScreen from './CityScreen.jsx';
import ChatWidget from './ChatWidget.jsx';

export default function App() {
  const [meta, setMeta] = useState(null);
  const [localities, setLocalities] = useState(null);
  const [error, setError] = useState(null);
  const [cityCode, setCityCode] = useState(null);
  const [mapCode, setMapCode] = useState(null);
  // The chat talks about the locality on screen: the open locality page, else the one selected on the map.
  const areaCode = cityCode || mapCode;
  const area = areaCode && localities?.find((l) => l.code === areaCode);

  useEffect(() => {
    Promise.all([getMeta(), getLocalities()])
      .then(([m, l]) => { setMeta(m); setLocalities(l); })
      .catch((e) => setError(e));
  }, []);

  return (
    <>
      <header>
        <h1>
          <svg className="shield" viewBox="0 0 24 26" fill="none" stroke="#fff" strokeWidth="1.6">
            <path d="M12 1.5l9 3v8c0 6-4 10-9 12-5-2-9-6-9-12v-8z" /><path d="M8 13l3 3 5-6" />
          </svg>
          מפת הפשיעה בישראל
        </h1>
        <div className="yr">📅 שנת נתונים: <b>{meta ? meta.yearTo : '…'}</b> · מקור: משטרת ישראל</div>
      </header>

      {error && <div className="fatal">לא ניתן לטעון נתונים מהשרת ({error.message}). ודאו ששרת ה-API ומסד הנתונים פועלים.</div>}

      {/* The map stays mounted so camera position survives a visit to the locality screen. */}
      <div className="screen" style={{ visibility: cityCode ? 'hidden' : 'visible' }}>
        <MapScreen localities={localities} year={meta?.yearTo} visible={!cityCode} onOpen={setCityCode} onSelect={setMapCode} />
      </div>
      {cityCode && <CityScreen code={cityCode} meta={meta} onBack={() => setCityCode(null)} />}
      <ChatWidget area={area ? { code: area.code, name: area.name } : null} localities={localities} />
    </>
  );
}
