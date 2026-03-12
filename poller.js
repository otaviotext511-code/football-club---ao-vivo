// poller.js — v3
// Slots dinâmicos: detecta horários reais do dia via API no boot
// Reset automático à meia-noite

const { adaptResponse } = require('./adapter');
const fs           = require('fs');
const COUNTER_FILE = './counter.json';
const REQ_LIMIT    = 90; // para antes de estourar os 100 da API

// ── MOCK DATA ───────────────────────────────────────────────────────────
const MOCK_MATCHES = [
  {
    id:1, priority:90, interval:5, pinned:true,
    home:'Flamengo', away:'Palmeiras',
    homeLogo:null, awayLogo:null,
    sh:2, sa:1, minute:'74', status:'2h',
    competition:'Copa Libertadores', round:'Oitavas — Ida',
    tags:['#copa-libertadores','#classico'],
    events:[
      {t:'goal',   m:23, team:'home', player:'Gabigol'},
      {t:'goal',   m:51, team:'home', player:'Pedro'},
      {t:'yellow', m:38, team:'away', player:'G. Gómez'},
      {t:'goal',   m:67, team:'away', player:'Endrick'},
    ]
  },
  {
    id:2, priority:70, interval:15,
    home:'São Paulo', away:'Corinthians',
    homeLogo:null, awayLogo:null,
    sh:0, sa:0, minute:'22', status:'1h',
    competition:'Serie A', round:'Rodada 18',
    tags:['#serie-a','#classico'],
    events:[]
  },
  {
    id:3, priority:70, interval:15,
    home:'Atletico Mineiro', away:'Cruzeiro',
    homeLogo:null, awayLogo:null,
    sh:1, sa:1, minute:'HT', status:'ht',
    competition:'Serie A', round:'Rodada 18',
    tags:['#serie-a','#classico'],
    events:[
      {t:'goal', m:12, team:'home', player:'Hulk'},
      {t:'goal', m:44, team:'away', player:'M. Pereira'},
    ]
  },
  {
    id:4, priority:70, interval:15,
    home:'Internacional', away:'Gremio',
    homeLogo:null, awayLogo:null,
    sh:0, sa:0, minute:null, status:'soon',
    competition:'Serie A', round:'Rodada 18',
    scheduledTime:'19:00',
    tags:['#serie-a','#grenal'],
    events:[]
  },
  {
    id:5, priority:50, interval:15,
    home:'Santos', away:'Botafogo',
    homeLogo:null, awayLogo:null,
    sh:null, sa:null, minute:null, status:'scheduled',
    competition:'Serie A', round:'Rodada 18',
    scheduledTime:'19:00',
    tags:['#serie-a'],
    events:[]
  },
  {
    id:6, priority:55, interval:15,
    home:'Fluminense', away:'Vasco da Gama',
    homeLogo:null, awayLogo:null,
    sh:3, sa:2, minute:'FT', status:'ft',
    competition:'Serie A', round:'Rodada 17',
    tags:['#serie-a','#classico'],
    events:[
      {t:'goal', m:8,  team:'home', player:'Cano'},
      {t:'goal', m:31, team:'away', player:'David'},
      {t:'goal', m:55, team:'home', player:'Ganso'},
      {t:'red',  m:72, team:'away', player:'Vegetti'},
      {t:'goal', m:89, team:'home', player:'Kauã'},
    ]
  },
  {
    id:7, priority:75, interval:5,
    home:'Boca Juniors', away:'River Plate',
    homeLogo:null, awayLogo:null,
    sh:1, sa:1, minute:'88', status:'2h',
    competition:'Copa Libertadores', round:'Oitavas',
    tags:['#copa-libertadores','#superclasico'],
    events:[
      {t:'goal', m:14, team:'home', player:'Cavani'},
      {t:'goal', m:61, team:'away', player:'Borja'},
    ]
  },
  {
    id:8, priority:65, interval:15,
    home:'Barcelona', away:'Real Madrid',
    homeLogo:null, awayLogo:null,
    sh:null, sa:null, minute:null, status:'scheduled',
    competition:'La Liga', round:'Jornada 30',
    scheduledTime:'21:00',
    tags:['#la-liga','#elclasico'],
    events:[]
  },
  {
    id:9, priority:55, interval:15,
    home:'Ceara', away:'Fortaleza',
    homeLogo:null, awayLogo:null,
    sh:0, sa:1, minute:'45+2', status:'1h',
    competition:'Campeonato Cearense', round:'Final',
    tags:['#campeonato-cearense','#nordeste'],
    events:[{t:'goal', m:33, team:'away', player:'Moisés'}]
  },
  {
    id:10, priority:60, interval:15,
    home:'PSG', away:'Olympique Marseille',
    homeLogo:null, awayLogo:null,
    sh:2, sa:0, minute:'FT', status:'ft',
    competition:'Ligue 1', round:'Semaine 29',
    tags:['#ligue-1','#lelassique'],
    events:[
      {t:'goal', m:19, team:'home', player:'Mbappé'},
      {t:'goal', m:55, team:'home', player:'Asensio'},
      {t:'red',  m:67, team:'away', player:'Balerdi'},
    ]
  },
];

// ── HELPERS DE TEMPO ────────────────────────────────────────────────────
function nowBRT() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}
function nowMinBRT() {
  const n = nowBRT();
  return n.getHours() * 60 + n.getMinutes();
}
function msUntilMidnight() {
  const n      = nowBRT();
  const midnight = new Date(n);
  midnight.setHours(24, 0, 1, 0); // 00:00:01 do dia seguinte
  return midnight - n;
}
function todayStr() {
  return nowBRT().toISOString().split('T')[0];
}

// ── CONTADOR PERSISTENTE ───────────────────────────────────────────────
function loadCounter(today) {
  try {
    const data = JSON.parse(fs.readFileSync(COUNTER_FILE,'utf8'));
    if (data.day === today) {
      console.log(`[counter] retomando: ${data.count} req já feitos hoje`);
      return data.count;
    }
  } catch {}
  return 0;
}
function saveCounter() {
  try { fs.writeFileSync(COUNTER_FILE, JSON.stringify({ day: todayStr(), count: reqToday })); }
  catch (e) { console.warn('[counter] falha ao salvar:', e.message); }
}
function checkCap() {
  if (reqToday >= REQ_LIMIT) {
    console.warn(`[cap] ⚠ limite de ${REQ_LIMIT} req atingido — pausando até meia-noite`);
    pollStatus = 'capped';
    matches    = [];
    nextPollIn = msUntilMidnight();
    timer      = setTimeout(poll, nextPollIn);
    return true;
  }
  return false;
}

// ── ESTADO ─────────────────────────────────────────────────────────────
let matches       = [];
let scheduled     = [];       // agendados do dia
let slots         = [];       // [{startMin, endMin}] — calculados da API
let lastPoll      = null;
let lastSlotFetch = null;     // "YYYY-MM-DDTHH" — evita re-fetch no mesmo slot
let pollStatus    = 'booting';
let nextPollIn    = null;
let reqToday      = 0;
let currentDay    = null;
let timer         = null;
let midnightTimer = null;
let apiKey        = null;
let mockMode      = false;

// ── SLOTS DINÂMICOS ────────────────────────────────────────────────────
// Recebe lista de fixtures e extrai janelas de atividade
// Margem: 30min antes, 2h30 depois de cada horário de jogo
const SLOT_BEFORE_MIN = 30;
const SLOT_AFTER_MIN  = 150;
const SLOT_GAP_MIN    = 45; // intervalos menores que isso são fundidos

function buildSlots(fixtures) {
  if (!fixtures.length) return [];

  // Extrai minutos do dia BRT de cada jogo agendado
  const gameMins = fixtures
    .filter(f => f.fixture?.date)
    .map(f => {
      const d = new Date(new Date(f.fixture.date).toLocaleString('en-US', {
        timeZone: 'America/Sao_Paulo'
      }));
      return d.getHours() * 60 + d.getMinutes();
    })
    .filter(m => m >= 0)
    .sort((a, b) => a - b);

  if (!gameMins.length) return [];

  // Cria janelas individuais
  const windows = gameMins.map(m => ({
    startMin: m - SLOT_BEFORE_MIN,
    endMin:   m + SLOT_AFTER_MIN,
  }));

  // Funde janelas sobrepostas ou muito próximas
  const merged = [windows[0]];
  for (let i = 1; i < windows.length; i++) {
    const last = merged[merged.length - 1];
    if (windows[i].startMin - last.endMin <= SLOT_GAP_MIN) {
      last.endMin = Math.max(last.endMin, windows[i].endMin);
    } else {
      merged.push({ ...windows[i] });
    }
  }

  return merged;
}

function isSlotActive() {
  const m = nowMinBRT();
  return slots.some(s => m >= s.startMin && m <= s.endMin);
}

function nextSlotMs() {
  const m = nowMinBRT();
  // Próximo slot hoje
  for (const s of slots) {
    if (s.startMin > m) return (s.startMin - m) * 60 * 1000;
  }
  // Nenhum slot hoje — dorme até meia-noite (vai recarregar o dia)
  return msUntilMidnight();
}

// ── API CALLS ──────────────────────────────────────────────────────────
async function apiFetch(url) {
  if (checkCap()) throw new Error('limite diário atingido');
  reqToday++;
  saveCounter();
  console.log(`[api]   ${url.split('?')[1] ?? url}  (req #${reqToday} hoje)`);
  const r = await fetch(`https://v3.football.api-sports.io/${url}`, {
    headers: { 'x-apisports-key': apiKey }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (d?.errors && Object.keys(d.errors).length) {
    throw new Error(JSON.stringify(d.errors));
  }
  return d;
}

// Boot do dia: busca fixtures raw (para extrair horários) + monta slots
async function bootstrapDay() {
  const today = todayStr();
  console.log(`\n[boot]  carregando agenda de ${today}...`);

  const raw  = await apiFetch(`fixtures?date=${today}`);
  const all  = raw?.response ?? [];

  // Monta slots a partir dos horários reais
  slots     = buildSlots(all);
  scheduled = adaptResponse(raw).filter(m => ['scheduled','soon'].includes(m.status));
  currentDay = today;

  if (!slots.length) {
    console.log('[boot]  sem jogos hoje — dorme até meia-noite');
  } else {
    const fmt = s => {
      const hh = String(Math.floor(s.startMin/60)).padStart(2,'0');
      const mm = String(s.startMin%60).padStart(2,'0');
      const eh = String(Math.floor(s.endMin/60)).padStart(2,'0');
      const em = String(s.endMin%60).padStart(2,'0');
      return `${hh}:${mm}–${eh}:${em}`;
    };
    console.log(`[boot]  ${slots.length} slot(s): ${slots.map(fmt).join('  |  ')}`);
    console.log(`[boot]  ${scheduled.length} jogos agendados\n`);
  }
}

async function fetchLive() {
  const d = await apiFetch('fixtures?live=all');
  return adaptResponse(d);
}

// ── MESCLA AO VIVO + AGENDADOS ─────────────────────────────────────────
function mergeMatches(live) {
  const liveIds = new Set(live.map(m => m.id));
  return [...live, ...scheduled.filter(m => !liveIds.has(m.id))];
}

// ── INTERVALO DINÂMICO ─────────────────────────────────────────────────
function calcInterval() {
  const live = matches.filter(m => ['1h','2h','et','pen','ht'].includes(m.status));
  if (!live.length) return 15 * 60 * 1000;
  return live.some(m => m.interval === 5) ? 5 * 60 * 1000 : 15 * 60 * 1000;
}

// ── RESET MEIA-NOITE ────────────────────────────────────────────────────
function scheduleMidnightReset() {
  clearTimeout(midnightTimer);
  const wait = msUntilMidnight();
  const min  = Math.round(wait / 60000);
  console.log(`[reset] reinício automático em ${min}min (meia-noite)\n`);
  midnightTimer = setTimeout(async () => {
    console.log('\n[reset] ── meia-noite — reiniciando ciclo do dia ──');
    clearTimeout(timer);
    reqToday   = 0;
    saveCounter();
    matches    = [];
    scheduled  = [];
    slots      = [];
    currentDay = null;
    await poll();
  }, wait);
}

// ── POLL PRINCIPAL ─────────────────────────────────────────────────────
async function poll() {
  clearTimeout(timer);

  // MOCK
  if (mockMode) {
    matches    = MOCK_MATCHES;
    pollStatus = 'mock';
    lastPoll   = new Date();
    console.log('[poller] mock — dados fictícios');
    timer = setTimeout(poll, 30 * 1000);
    return;
  }

  // Boot do dia (primeira vez ou virada de dia)
  if (currentDay !== todayStr()) {
    try {
      await bootstrapDay();
      scheduleMidnightReset();
    } catch (err) {
      console.error('[boot]  erro:', err.message, '— retry em 5min');
      pollStatus = 'error';
      timer = setTimeout(poll, 5 * 60 * 1000);
      return;
    }
  }

  // Sem jogos hoje
  if (!slots.length) {
    pollStatus = 'no_games';
    matches    = [];
    const wait = msUntilMidnight();
    nextPollIn = wait;
    console.log(`[poller] sem jogos hoje — dorme até meia-noite`);
    timer = setTimeout(poll, wait);
    return;
  }

  // Fora de slot ativo
  if (!isSlotActive()) {
    const waitMs  = nextSlotMs();
    const waitMin = Math.round(waitMs / 60000);
    pollStatus = 'waiting';
    nextPollIn = waitMs;
    matches    = [];
    console.log(`[poller] fora de slot — próximo em ${waitMin}min  (${reqToday} req hoje)`);
    timer = setTimeout(poll, waitMs);
    return;
  }

  // Dentro de slot — re-busca agendados 1x por hora
  const slotKey = nowBRT().toISOString().slice(0, 13);
  if (lastSlotFetch !== slotKey) {
    try {
      const raw  = await apiFetch(`fixtures?date=${todayStr()}`);
      scheduled  = adaptResponse(raw).filter(m => ['scheduled','soon'].includes(m.status));
      lastSlotFetch = slotKey;
      console.log(`[poller] agendados atualizados: ${scheduled.length} jogos`);
    } catch (err) {
      console.warn('[poller] falha ao re-buscar agendados:', err.message);
    }
  }

  // Poll de ao vivo
  try {
    pollStatus = 'polling';
    const live = await fetchLive();
    matches    = mergeMatches(live);
    lastPoll   = new Date();

    const liveCount = live.filter(m => ['1h','2h','et'].includes(m.status)).length;
    pollStatus = matches.length ? 'ok' : 'no_games';
    console.log(`[poller] ${matches.length} partidas | ${liveCount} ao vivo | ${reqToday} req hoje`);

    const interval = calcInterval();
    nextPollIn     = interval;
    console.log(`[poller] próximo poll em ${interval / 60000}min`);
    timer = setTimeout(poll, interval);

  } catch (err) {
    console.error('[poller] erro:', err.message, '— retry em 2min');
    pollStatus = 'error';
    timer = setTimeout(poll, 2 * 60 * 1000);
  }
}

// ── API PÚBLICA ────────────────────────────────────────────────────────
module.exports = {
  start(key, mock) {
    apiKey   = key;
    mockMode = mock;
    reqToday = loadCounter(todayStr());
    console.log(`[poller] iniciando — modo: ${mock ? 'MOCK' : 'API-Football'}`);
    poll();
  },
  getMatches() { return matches; },
  getStatus() {
    return {
      status:     pollStatus,
      lastPoll:   lastPoll?.toISOString() ?? null,
      nextPollIn: nextPollIn ? Math.round(nextPollIn / 1000) : null,
      count:      matches.length,
      reqToday,
      slots:      slots.map(s => ({
        start: `${String(Math.floor(s.startMin/60)).padStart(2,'0')}:${String(s.startMin%60).padStart(2,'0')}`,
        end:   `${String(Math.floor(s.endMin/60)).padStart(2,'0')}:${String(s.endMin%60).padStart(2,'0')}`,
      })),
      mockMode: pollStatus === 'mock',
      capped: pollStatus === 'capped',
    };
  },
};
