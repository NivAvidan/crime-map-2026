import { useEffect, useState } from 'react';
import { fmt, getCrime } from './api.js';

const QUARTERS = [null, 'Q1', 'Q2', 'Q3', 'Q4'];

export default function CityScreen({ code, meta, onBack }) {
  const [quarter, setQuarter] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [groupCode, setGroupCode] = useState(null);

  useEffect(() => {
    let live = true;
    setError(null);
    getCrime(code, quarter)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [code, quarter]);

  if (error) {
    return (
      <div className="screen city">
        <div className="top"><h2>📍 נתוני פשיעה</h2><button className="btn" onClick={onBack}>› חזרה למפה</button></div>
        <div className="box">{error.status === 404 ? 'אין נתונים זמינים ליישוב זה בקובץ המקור.' : 'שגיאה בטעינת הנתונים מהשרת.'}</div>
      </div>
    );
  }
  if (!data) return <div className="screen city"><div className="box">טוען נתונים…</div></div>;

  const qLabel = quarter || 'כל השנה';
  const maxQ = Math.max(...data.quarters.map((q) => q.records), 1);
  const group = data.groups.find((g) => g.code === groupCode) || data.groups[0];
  const maxG = data.groups[0]?.records || 1;
  const areas = data.statisticAreas;

  return (
    <div className="screen city">
      <div className="top">
        <h2>📍 נתוני פשיעה – {data.name}</h2>
        <button className="btn" onClick={onBack}>› חזרה למפה</button>
      </div>

      <div className="grid kpis">
        <div className="box"><h3>סך רשומות עבירה</h3><div className="big">{fmt(data.records)}</div><div className="sub">{qLabel}</div></div>
        <div className="box"><h3>מזהים ייחודיים (FictiveIDNumber)</h3><div className="big">{fmt(data.uniqueIds)}</div><div className="sub">בכפוף לאימות משמעות המזהה מול המקור</div></div>
        <div className="box"><h3>שנת נתונים</h3><div className="big">{data.year}</div><div className="sub">קוד יישוב: {data.code}</div></div>
        <div className="box">
          <h3>בחירת רבעון</h3>
          <div className="seg">
            {QUARTERS.map((q) => (
              <button key={q || 'all'} className={quarter === q ? 'on' : ''} onClick={() => setQuarter(q)}>{q || 'כל השנה'}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid main">
        <div className="box">
          <h3>התפלגות רשומות לפי רבעונים</h3>
          <div className="bars">
            {data.quarters.map((q) => (
              <div key={q.quarter} className={'b' + (quarter === q.quarter ? ' on' : '')} onClick={() => setQuarter(q.quarter)}>
                <span>{fmt(q.records)}</span>
                <i style={{ height: `${(q.records / maxQ) * 100}%` }} />
                <em>{q.quarter}</em>
              </div>
            ))}
          </div>
        </div>

        <div className="box">
          <h3>קבוצות עבירה <span className="sub">({qLabel} · לחצו לפירוט)</span></h3>
          <div className="scroll">
            <table>
              <thead><tr><th>קבוצת עבירה</th><th>רשומות</th><th>חלק יחסי</th></tr></thead>
              <tbody>
                {data.groups.map((g) => (
                  <tr key={g.code ?? '-'} className={'clk' + (g === group ? ' sel' : '')} onClick={() => setGroupCode(g.code)}>
                    <td>{g.name || 'ללא קבוצה'}</td>
                    <td className="num">{fmt(g.records)}</td>
                    <td className="num">
                      {((g.records / data.records) * 100).toFixed(1)}%
                      <span className="meter" style={{ width: Math.max((g.records / maxG) * 70, 2) }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="box">
          <h3>סוגי עבירה בתוך הקבוצה</h3>
          <div className="chip">קבוצה נבחרת: <b>{group?.name || '—'}</b></div>
          <div className="scroll">
            <table>
              <thead><tr><th>סוג עבירה</th><th>רשומות</th></tr></thead>
              <tbody>
                {(group?.types || []).map((t) => (
                  <tr key={t.code ?? t.name}><td>{t.name || 'ללא סוג'}</td><td className="num">{fmt(t.records)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="box">
          <h3>שיוך משטרתי <span className="sub">({qLabel} · מספר רשומות)</span></h3>
          <Kv label="מחוז" items={data.police.districts} />
          <Kv label="מרחב" items={data.police.merhavim} />
          <Kv label="תחנה" items={data.police.stations} />
        </div>
        <div className="box">
          <h3>אזורים סטטיסטיים <span className="sub">({qLabel} · {areas.length} אזורים · {fmt(data.recordsWithoutStatisticArea)} רשומות ללא אזור)</span></h3>
          <div className="scroll short">
            <table>
              <tbody>
                {areas.length === 0 && <tr><td>אין מידע על אזורים סטטיסטיים ליישוב זה</td></tr>}
                {areas.map((a) => (
                  <tr key={a.code ?? a.name}><td>{a.name || a.code}</td><td className="num">{fmt(a.records)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {meta && (
        <p className="sub foot">
          הספירה היא של רשומות עבירה ולא בהכרח של אירועים נפרדים. בקובץ {fmt(meta.records)} רשומות,
          מתוכן {fmt(meta.recordsWithoutLocality)} ללא שיוך יישובי (אינן מוצגות ברמת יישוב).
        </p>
      )}
    </div>
  );
}

function Kv({ label, items }) {
  return (
    <div className="kv">
      <b>{label}</b>
      <span>{items.length ? items.map((x) => `${x.name} (${fmt(x.records)})`).join(' · ') : '—'}</span>
    </div>
  );
}
