// server.js
require('dotenv').config();

const express = require('express');
const path    = require('path');
const poller  = require('./poller');

const app      = express();
const PORT     = process.env.PORT     || 3000;
const API_KEY  = process.env.API_KEY  || '';
const MOCK_MODE = process.env.MOCK_MODE === 'true' || !API_KEY || API_KEY === 'SUA_CHAVE_AQUI';

app.use(express.static(path.join(__dirname)));
app.use(express.json());

// /api/matches — frontend chama aqui
app.get('/api/matches', (req, res) => {
  const status  = poller.getStatus();
  const matches = poller.getMatches();
  const q = (req.query.q || '').toLowerCase().trim();
  const filtered = q
    ? matches.filter(m =>
        m.home.toLowerCase().includes(q) ||
        m.away.toLowerCase().includes(q) ||
        (m.tags||[]).some(t => t.toLowerCase().includes(q)) ||
        (m.competition||'').toLowerCase().includes(q)
      )
    : matches;
  res.json({ ok: true, ...status, matches: filtered });
});

app.get('/api/status', (req, res) => res.json(poller.getStatus()));

// badge proxy (Wikipedia)
const badgeCache = new Map();
const CACHE_TTL  = 1000 * 60 * 60;
const WIKI_NAME = {
  'flamengo':'Clube de Regatas do Flamengo','palmeiras':'Sociedade Esportiva Palmeiras',
  'corinthians':'Sport Club Corinthians Paulista','são paulo':'São Paulo FC',
  'sao paulo':'São Paulo FC','santos':'Santos FC',
  'grêmio':'Grêmio Foot-Ball Porto Alegrense','gremio':'Grêmio Foot-Ball Porto Alegrense',
  'internacional':'Sport Club Internacional','atletico mineiro':'Clube Atlético Mineiro',
  'atlético mineiro':'Clube Atlético Mineiro','cruzeiro':'Cruzeiro Esporte Clube',
  'fluminense':'Fluminense Football Club','botafogo':'Botafogo de Futebol e Regatas',
  'vasco':'Club de Regatas Vasco da Gama','vasco da gama':'Club de Regatas Vasco da Gama',
  'ceara':'Ceará Sporting Club','ceará':'Ceará Sporting Club',
  'fortaleza':'Fortaleza Esporte Clube','boca juniors':'Club Atlético Boca Juniors',
  'river plate':'Club Atlético River Plate','barcelona':'FC Barcelona',
  'real madrid':'Real Madrid CF','psg':'Paris Saint-Germain F.C.',
  'olympique marseille':'Olympique de Marseille',
};
async function wikiThumb(name) {
  const title = WIKI_NAME[name.toLowerCase()] ?? name;
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { 'User-Agent': 'football-live/0.1' } });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.originalimage?.source ?? d?.thumbnail?.source ?? null;
}
app.post('/api/badges', async (req, res) => {
  const teams = Array.isArray(req.body) ? req.body : [];
  const result = {};
  await Promise.all(teams.map(async name => {
    const key = name.toLowerCase();
    const cached = badgeCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) { result[name] = cached.url; return; }
    try {
      const url = await wikiThumb(name);
      badgeCache.set(key, { ts: Date.now(), url });
      result[name] = url;
    } catch { result[name] = null; }
  }));
  console.log(`[badges] ${Object.values(result).filter(Boolean).length}/${teams.length} encontrados`);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`\n⚽  Football Live em http://localhost:${PORT}`);
  if (MOCK_MODE) {
    console.log('    modo: MOCK (dados fictícios)');
    console.log('    para API real: .env → MOCK_MODE=false + API_KEY=sua_chave\n');
  } else {
    console.log('    modo: API-Football (chave configurada)\n');
  }
  poller.start(API_KEY, MOCK_MODE);
});
