// POST /api/chat — forwards a chat message to the OpenAI agent (Agents API, beta)
// together with the selected locality's data, and streams the reply text back.
// The API key stays on the server; the browser never sees it.
import { existsSync, readFileSync } from 'node:fs';

const API = 'https://api.openai.com/v1/agents/sessions';
const TYPES = ['נתונים', 'דוח', 'שיחה'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

// Optional per-session instructions override. Delete the file to use the instructions saved on the agent.
const instructionsFile = new URL('./agent-instructions.txt', import.meta.url);
const instructions = existsSync(instructionsFile) ? readFileSync(instructionsFile, 'utf8').trim() : '';

/** Compact, quarter-aware data package for one locality. */
async function areaData(store, code) {
  const year = await store.crime(code, null);
  if (!year) return null;
  const perQuarter = await Promise.all(QUARTERS.map((q) => store.crime(code, q)));
  return {
    yeshuvKod: code,
    yeshuv: year.name,
    year: year.year,
    records: year.records,
    uniqueIds: year.uniqueIds,
    quarters: year.quarters,
    groups: year.groups.map((g) => ({
      group: g.name,
      records: g.records,
      byQuarter: Object.fromEntries(QUARTERS.map((q, i) =>
        [q, perQuarter[i]?.groups.find((x) => x.code === g.code)?.records ?? 0])),
      types: g.types.slice(0, 10).map((t) => ({ type: t.name, records: t.records })),
    })),
    police: year.police,
    statisticAreas: year.statisticAreas.slice(0, 15),
    recordsWithoutStatisticArea: year.recordsWithoutStatisticArea,
    note: 'records = מספר רשומות עבירה, לא בהכרח אירועים נפרדים. uniqueIds = מזהי FictiveIDNumber ייחודיים.',
  };
}

async function buildInput(store, { message, type, code, history }) {
  const lines = [`סוג בקשה: ${TYPES.includes(type) ? type : 'שיחה'}`];
  const data = code ? await areaData(store, code) : null;
  if (data) {
    lines.push(`אזור: ${data.yeshuv} (קוד יישוב ${code})`, 'נתוני האזור מהמערכת (JSON):', JSON.stringify(data));
  } else {
    const [meta, localities] = await Promise.all([store.meta(), store.localities()]);
    lines.push('אזור: לא נבחר יישוב', 'נתונים כלליים מהמערכת (JSON):', JSON.stringify({
      ...meta,
      localitiesCount: localities.length,
      topLocalitiesByRecords: localities.slice(0, 20).map((l) => ({ yeshuv: l.name, yeshuvKod: l.code, records: l.records })),
    }));
  }
  const past = (Array.isArray(history) ? history : []).slice(-8)
    .filter((m) => m && typeof m.text === 'string')
    .map((m) => `${m.role === 'user' ? 'משתמש' : 'סוכן'}: ${m.text.slice(0, 1500)}`);
  if (past.length) lines.push('היסטוריית השיחה עד כה:', ...past);
  lines.push('הודעת המשתמש:', message);
  return lines.join('\n');
}

export function chatRoute(store) {
  return async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 4000) : '';
    if (!message) return res.status(400).json({ error: 'message is required' });
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_AGENT_ID) {
      return res.status(503).json({ error: 'OPENAI_API_KEY / OPENAI_AGENT_ID are not configured' });
    }

    const input = await buildInput(store, { ...req.body, message });
    const upstream = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'agents=v1',
      },
      body: JSON.stringify({
        agent_id: process.env.OPENAI_AGENT_ID,
        ...(instructions && { agent: { instructions } }),
        environment: { type: 'none' },
        input,
        stream: true,
      }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('agent error', upstream.status, detail.slice(0, 500));
      return res.status(502).json({ error: 'agent request failed', status: upstream.status });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const phases = new Map(); // item id -> phase
    let wrote = false;
    const handle = (ev) => {
      if (ev.type === 'agent.session.turn.item.added' && ev.item?.role === 'assistant') {
        phases.set(ev.item.id, ev.item.phase);
      } else if (ev.type === 'agent.session.turn.output_text.delta') {
        const phase = phases.get(ev.item_id);
        if (phase == null || phase === 'final_answer') { res.write(ev.delta); wrote = true; }
      } else if (/\.failed$/.test(ev.type) || ev.type === 'error') {
        console.error('agent event', JSON.stringify(ev).slice(0, 500));
        res.write(wrote ? '\n\n[התשובה נקטעה עקב שגיאה אצל הסוכן]' : 'אירעה שגיאה אצל הסוכן. נסו שוב.');
        wrote = true;
      }
    };

    const decoder = new TextDecoder();
    let buf = '';
    try {
      for await (const chunk of upstream.body) {
        buf += decoder.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
          if (!data || data === '[DONE]') continue;
          try { handle(JSON.parse(data)); } catch { /* ignore malformed event */ }
        }
      }
    } catch (e) {
      console.error('agent stream error', e.message);
      if (!wrote) res.write('החיבור לסוכן נקטע. נסו שוב.');
    }
    if (!wrote) res.write('הסוכן לא החזיר תשובה.');
    res.end();
  };
}
