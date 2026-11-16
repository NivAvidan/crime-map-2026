import { useEffect, useRef, useState } from 'react';

const TYPES = ['שיחה', 'נתונים', 'דוח'];
const ACTIONS = [
  { id: 'agent', icon: '💬', title: 'דבר עם הסוכן', sub: 'שאלות ודוחות על נתוני הפשיעה' },
  { id: 'case', icon: '📝', title: 'תיעוד מקרה ידני', sub: 'שליחת עיר ותיאור מקרה לתיעוד' },
  { id: 'news', icon: '📰', title: 'חדשות פשיעה', sub: 'חדשות פשיעה עדכניות לפי עיר' },
];

/** Minimal markdown: headings and **bold**. Everything else is plain text. */
function Rich({ text }) {
  return text.split('\n').map((line, i) => {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const parts = (heading ? heading[1] : line).split(/\*\*(.+?)\*\*/g)
      .map((p, j) => (j % 2 ? <strong key={j}>{p}</strong> : p));
    return <div key={i} className={heading ? 'h' : undefined}>{parts.length && line ? parts : ' '}</div>;
  });
}

/** Turns whatever a Make automation answered into chat text. */
function replyText(reply, accepted) {
  if (typeof reply === 'string') {
    return !reply.trim() || reply.trim() === 'Accepted' ? accepted : reply;
  }
  if (Array.isArray(reply)) return reply.map((x) => replyText(x, '')).filter(Boolean).join('\n\n');
  if (reply && typeof reply === 'object') {
    return Object.entries(reply).map(([k, v]) => `**${k}:** ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
  }
  return String(reply ?? accepted);
}

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function ChatWidget({ area, localities }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // null = actions menu | 'agent' | 'case' | 'news'
  const [logs, setLogs] = useState({ agent: [], case: [], news: [] }); // per action: { role, text }[]
  const [text, setText] = useState('');
  const [type, setType] = useState('שיחה');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  const messages = mode ? logs[mode] : [];
  const push = (m, ...items) => setLogs((l) => ({ ...l, [m]: [...l[m], ...items] }));
  const setLast = (m, fn) => setLogs((l) => {
    const list = l[m], last = list[list.length - 1];
    return { ...l, [m]: [...list.slice(0, -1), { ...last, text: fn(last.text) }] };
  });

  useEffect(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, [logs, open, mode]);
  // Entering an action pre-fills the city with the locality currently on screen.
  useEffect(() => { if (mode === 'case' || mode === 'news') setCity(area?.name || ''); }, [mode, area?.name]);

  const sendAgent = async (msg = text, reqType = type) => {
    msg = msg.trim();
    if (!msg || busy) return;
    const history = logs.agent.map(({ role, text: t }) => ({ role, text: t }));
    push('agent', { role: 'user', text: msg }, { role: 'agent', text: '' });
    setText('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, type: reqType, code: area?.code || null, history }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setLast('agent', (t) => t + chunk);
      }
    } catch {
      setLast('agent', () => 'לא ניתן להגיע לסוכן כרגע. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  const sendCase = async () => {
    const c = city.trim(), d = description.trim();
    if (!c || !d || busy) return;
    push('case', { role: 'user', text: `**עיר:** ${c}\n**תיעוד:** ${d}` }, { role: 'agent', text: '' });
    setDescription('');
    setBusy(true);
    try {
      const { reply } = await postJson('/api/make/case', { city: c, description: d });
      setLast('case', () => replyText(reply, `✅ המקרה נשלח לתיעוד (${c}).`));
    } catch {
      setLast('case', () => '❌ שליחת התיעוד נכשלה. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  const sendNews = async () => {
    const c = city.trim();
    if (!c || busy) return;
    push('news', { role: 'user', text: `חדשות פשיעה – ${c}` }, { role: 'agent', text: '' });
    setBusy(true);
    try {
      const { reply } = await postJson('/api/make/news', { city: c });
      setLast('news', () => replyText(reply, `✅ הבקשה לחדשות פשיעה עבור ${c} התקבלה באוטומציה. האוטומציה לא החזירה תוכן לצ'אט.`));
    } catch {
      setLast('news', () => '❌ לא ניתן לקבל חדשות כרגע. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label="פתיחת צ'אט">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" /><path d="M8.5 11h7M8.5 14.5h4.5" />
        </svg>
      </button>
    );
  }

  const action = ACTIONS.find((a) => a.id === mode);
  const cityField = (
    <>
      <input className="chat-field" list="chat-cities" value={city} placeholder="עיר / יישוב" onChange={(e) => setCity(e.target.value)} />
      <datalist id="chat-cities">{(localities || []).map((l) => <option key={l.code} value={l.name} />)}</datalist>
    </>
  );

  return (
    <div className="chat">
      <div className="chat-hd">
        {mode && <button onClick={() => setMode(null)} aria-label="חזרה לתפריט הפעולות" title="תפריט פעולות">☰</button>}
        <div className="chat-title">
          <b>{action ? action.title : 'מרכז הפעולות'}</b>
          <small>{area ? `הקשר: ${area.name}` : 'לא נבחר יישוב'}</small>
        </div>
        <button onClick={() => setOpen(false)} aria-label="סגירה">✕</button>
      </div>

      {!mode && (
        <div className="chat-menu">
          <p>במה אפשר לעזור?</p>
          {ACTIONS.map((a) => (
            <button key={a.id} onClick={() => setMode(a.id)}>
              <span className="ic">{a.icon}</span>
              <span><b>{a.title}</b><small>{a.sub}</small></span>
              <span className="arrow">‹</span>
            </button>
          ))}
        </div>
      )}

      {mode && (
        <div className="chat-list" ref={listRef}>
          {messages.length === 0 && mode === 'agent' && (
            <div className="chat-empty">
              <p>שאלו על נתוני הפשיעה{area ? ` של ${area.name}` : ''}. התשובות מבוססות על נתוני המערכת בלבד.</p>
              {area
                ? <button onClick={() => sendAgent(`הפק דוח אזורי עבור ${area.name}`, 'דוח')}>📄 דוח אזורי – {area.name}</button>
                : <span>בחרו יישוב במפה כדי לשאול עליו.</span>}
            </div>
          )}
          {messages.length === 0 && mode === 'case' && (
            <div className="chat-empty"><p>מלאו עיר ותיאור המקרה. התיעוד יישלח לאוטומציית התיעוד.</p></div>
          )}
          {messages.length === 0 && mode === 'news' && (
            <div className="chat-empty"><p>בחרו עיר כדי לקבל חדשות פשיעה עדכניות.</p></div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={'msg ' + m.role}>
              {m.role === 'agent' && !m.text ? <span className="dots"><i /><i /><i /></span> : <Rich text={m.text} />}
            </div>
          ))}
        </div>
      )}

      {mode === 'agent' && (
        <>
          <div className="chat-types">
            {TYPES.map((t) => <button key={t} className={t === type ? 'on' : ''} onClick={() => setType(t)}>{t}</button>)}
          </div>
          <form className="chat-in" onSubmit={(e) => { e.preventDefault(); sendAgent(); }}>
            <textarea
              autoFocus rows={1} value={text} placeholder="כתבו הודעה…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAgent(); } }}
            />
            <SendButton disabled={busy || !text.trim()} />
          </form>
        </>
      )}

      {mode === 'case' && (
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); sendCase(); }}>
          {cityField}
          <textarea className="chat-field" rows={3} value={description} placeholder="תיאור המקרה…" onChange={(e) => setDescription(e.target.value)} />
          <button type="submit" className="chat-submit" disabled={busy || !city.trim() || !description.trim()}>שליחת תיעוד</button>
        </form>
      )}

      {mode === 'news' && (
        <form className="chat-form row" onSubmit={(e) => { e.preventDefault(); sendNews(); }}>
          {cityField}
          <button type="submit" className="chat-submit" disabled={busy || !city.trim()}>קבלת חדשות</button>
        </form>
      )}
    </div>
  );
}

function SendButton({ disabled }) {
  return (
    <button type="submit" disabled={disabled} aria-label="שליחה">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l11 2-11 2z" /></svg>
    </button>
  );
}
