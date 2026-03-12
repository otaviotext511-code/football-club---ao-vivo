// adapter.js
// Traduz a resposta da API-Football para o formato interno do app

const PRIORITY_MAP = {
  // Competição (league.name) → prioridade + intervalo
  'FIFA World Cup':               { priority: 100, interval: 5 },
  'Copa America':                 { priority: 95,  interval: 5 },
  'UEFA Champions League':        { priority: 80,  interval: 5 },
  'UEFA Europa League':           { priority: 70,  interval: 15 },
  'Copa Libertadores':            { priority: 90,  interval: 5 },
  'Copa Sudamericana':            { priority: 85,  interval: 5 },
  'Copa Do Brasil':               { priority: 75,  interval: 5 },
  'Serie A':                      { priority: 70,  interval: 15 }, // Brasileirão
  'Serie B':                      { priority: 50,  interval: 15 },
  'Campeonato Paulista':          { priority: 55,  interval: 15 },
  'Campeonato Carioca':           { priority: 55,  interval: 15 },
  'Campeonato Gaucho':            { priority: 45,  interval: 15 },
  'Campeonato Mineiro':           { priority: 45,  interval: 15 },
  'La Liga':                      { priority: 65,  interval: 15 },
  'Premier League':               { priority: 65,  interval: 15 },
  'Bundesliga':                   { priority: 60,  interval: 15 },
  'Ligue 1':                      { priority: 60,  interval: 15 },
};

// Clássicos que sobem para intervalo de 5min automaticamente
const CLASSICOS = [
  ['flamengo',  'fluminense'],
  ['flamengo',  'vasco'],
  ['flamengo',  'botafogo'],
  ['fluminense','vasco'],
  ['fluminense','botafogo'],
  ['vasco',     'botafogo'],
  ['gremio',    'internacional'],
  ['atletico',  'cruzeiro'],
  ['atletico',  'america'],
  ['corinthians','palmeiras'],
  ['corinthians','santos'],
  ['corinthians','sao paulo'],
  ['palmeiras',  'santos'],
  ['palmeiras',  'sao paulo'],
  ['santos',     'sao paulo'],
  ['barcelona',  'real madrid'],
  ['boca',       'river'],
];

function isClassico(home, away) {
  const h = home.toLowerCase();
  const a = away.toLowerCase();
  return CLASSICOS.some(([t1, t2]) =>
    (h.includes(t1) && a.includes(t2)) ||
    (h.includes(t2) && a.includes(t1))
  );
}

// STATUS da API-Football → status interno
const STATUS_MAP = {
  'TBD':  'scheduled',
  'NS':   'scheduled',  // Not Started
  '1H':   '1h',
  'HT':   'ht',
  '2H':   '2h',
  'ET':   'et',
  'BT':   'ht',         // Break Time (prorrogação intervalo)
  'P':    'pen',
  'FT':   'ft',
  'AET':  'ft',
  'PEN':  'ft',
  'SUSP': 'susp',
  'INT':  'susp',
  'PST':  'canc',
  'CANC': 'canc',
  'ABD':  'canc',
  'AWD':  'ft',
  'WO':   'ft',
  'LIVE': '2h',
};

// EVENT type da API → tipo interno
function mapEventType(type, detail) {
  const t = (type || '').toLowerCase();
  const d = (detail || '').toLowerCase();
  if (t === 'goal') {
    if (d.includes('own')) return 'goal'; // gol contra — trata igual
    return 'goal';
  }
  if (t === 'card') {
    if (d.includes('red'))    return 'red';
    if (d.includes('yellow')) return 'yellow';
    return 'yellow';
  }
  if (t === 'subst') return 'sub';
  if (t === 'var')   return 'var';
  return 'note';
}

function adaptFixture(fix) {
  const league = fix.league?.name ?? '';
  const home   = fix.teams?.home?.name ?? '';
  const away   = fix.teams?.away?.name ?? '';

  const meta = PRIORITY_MAP[league] ?? { priority: 30, interval: 15 };

  // Clássico sobe intervalo pra 5min
  const interval = isClassico(home, away) ? 5 : meta.interval;
  const priority = isClassico(home, away)
    ? Math.max(meta.priority, 75)
    : meta.priority;

  const statusRaw = fix.fixture?.status?.short ?? 'NS';
  const status    = STATUS_MAP[statusRaw] ?? 'scheduled';

  const events = (fix.events ?? []).map(ev => ({
    t:      mapEventType(ev.type, ev.detail),
    m:      ev.time?.elapsed ?? 0,
    team:   ev.team?.id === fix.teams?.home?.id ? 'home' : 'away',
    player: ev.player?.name ?? '',
    detail: ev.detail ?? '',
  }));

  return {
    id:          fix.fixture?.id,
    priority,
    interval,
    home,
    away,
    homeLogo:    fix.teams?.home?.logo ?? null,
    awayLogo:    fix.teams?.away?.logo ?? null,
    sh:          fix.goals?.home ?? 0,
    sa:          fix.goals?.away ?? 0,
    minute:      fix.fixture?.status?.elapsed
                   ? String(fix.fixture.status.elapsed)
                   : null,
    status,
    competition: league,
    round:       fix.league?.round ?? '',
    tags:        ['#' + league.toLowerCase().replace(/\s+/g, '-')],
    events,
    scheduledTime: fix.fixture?.date
      ? new Date(fix.fixture.date).toLocaleTimeString('pt-BR', {
          hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
        })
      : null,
  };
}

function adaptResponse(apiData) {
  if (!apiData?.response) return [];
  return apiData.response.map(adaptFixture);
}

module.exports = { adaptResponse, PRIORITY_MAP };
