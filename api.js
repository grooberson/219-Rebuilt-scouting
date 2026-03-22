// ===========================
// FRC API — CREDENTIALS
// ===========================
// Credentials are XOR-obfuscated with key REBUILT-2026-FMA-NJWAS-219
const _K = 'REBUILT-2026-FMA-NJWAS-219';
const _C = '353772652b29265e5d5e0007147c757119772e3177370005005f616876307b2a79150a02001b1d7729204e2c2965736a1454';
function _getAuth() {
  const dec = _C.match(/.{2}/g).map((h, i) =>
    String.fromCharCode(parseInt(h, 16) ^ _K.charCodeAt(i % _K.length))
  ).join('');
  return 'Basic ' + btoa(dec);
}
const FRC_BASE = 'https://frc-api.firstinspires.org/v3.0';
const FRC_YEAR = '2026';

// Current active event — persisted across sessions
let currentEvent = localStorage.getItem('rebuilt_event') || 'NJWAS';
function getFrcEvent() { return currentEvent; }

// ===========================
// OFFICIAL RANKINGS
// ===========================
let officialRankings = {};  // teamNumber → ranking object
let _rankLastLoad = 0;

async function loadOfficialRankings() {
  const now = Date.now();
  if (now - _rankLastLoad < 30000) return; // throttle to 30 s
  _rankLastLoad = now;
  try {
    const res = await fetch(`${FRC_BASE}/${FRC_YEAR}/rankings/${getFrcEvent()}`, {
      headers: { 'Authorization': _getAuth(), 'Accept': 'application/json' }
    });
    if (!res.ok) return;
    const data = await res.json();
    officialRankings = {};
    (data.Rankings || []).forEach(r => { officialRankings[r.teamNumber] = r; });
    renderTeams(); // refresh table with official rank data
  } catch (e) {
    console.warn('FRC API rankings unavailable:', e);
  }
  // Kick off Statbotics fetch in parallel (no-op if already cached for this event)
  if (typeof loadStatboticsData === 'function') loadStatboticsData(currentEvent);
}

// ===========================
// SCHEDULE VIEW
// ===========================
let scheduleData = [];
let scoreDetailData = {}; // matchNumber → { red: {...}, blue: {...} }
let scheduleView = 'upcoming'; // 'upcoming' | 'completed'
let scheduleType = 'qual';    // 'practice' | 'qual' | 'playoff'
let _schedRefreshTimer = null;
let _schedCountdown = 0;
let _schedGeneration = 0;

// Populated once initRosterMap() is called for the current event
const ROSTER_MAP = {};

async function loadSchedule(isAutoRefresh = false) {
  if (!isAutoRefresh) {
    document.getElementById('schedStatus').textContent = 'Loading…';
    document.getElementById('schedCountdown').textContent = '';
  }
  clearInterval(_schedRefreshTimer);
  _schedRefreshTimer = null;
  const gen = ++_schedGeneration;
  try {
    // The /hybrid endpoint only exists for qual and playoff; practice uses the base schedule endpoint
    const url = scheduleType === 'practice'
      ? `${FRC_BASE}/${FRC_YEAR}/schedule/${getFrcEvent()}?tournamentLevel=Practice`
      : `${FRC_BASE}/${FRC_YEAR}/schedule/${getFrcEvent()}/${scheduleType}/hybrid`;
    const res = await fetch(url, {
      headers: { 'Authorization': _getAuth(), 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (gen !== _schedGeneration) return; // superseded by a newer call
    scheduleData = data.Schedule || [];
    renderSchedule();
    loadScoreDetails(); // fetch breakdown data in the background
    document.getElementById('schedStatus').textContent =
      'Updated ' + new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  } catch (e) {
    if (gen !== _schedGeneration) return;
    document.getElementById('schedStatus').textContent = '⚠ FRC API unavailable';
    console.warn('FRC schedule fetch failed:', e);
  }
  // Start 60-second auto-refresh countdown
  _schedCountdown = 60;
  _schedRefreshTimer = setInterval(() => {
    _schedCountdown--;
    const el = document.getElementById('schedCountdown');
    if (el) el.textContent = `Refresh in ${_schedCountdown}s`;
    if (_schedCountdown <= 0) {
      clearInterval(_schedRefreshTimer);
      _schedRefreshTimer = null;
      loadSchedule(true);
    }
  }, 1000);
}

async function loadScoreDetails() {
  try {
    const res = await fetch(`${FRC_BASE}/${FRC_YEAR}/scores/${getFrcEvent()}/${scheduleType}`, {
      headers: { 'Authorization': _getAuth(), 'Accept': 'application/json' }
    });
    if (!res.ok) return;
    const data = await res.json();
    scoreDetailData = {};
    let needsRerender = false;
    (data.MatchScores || []).forEach(ms => {
      const red  = (ms.alliances || []).find(a => a.alliance === 'Red');
      const blue = (ms.alliances || []).find(a => a.alliance === 'Blue');
      if (red || blue) {
        if (!scoreDetailData[ms.matchNumber]) needsRerender = true;
        scoreDetailData[ms.matchNumber] = { red, blue };
        // Update any already-rendered panel in place (avoids full re-render)
        const panel = document.getElementById('score-detail-' + ms.matchNumber);
        if (panel) panel.innerHTML = renderScoreBreakdown(red, blue);
      }
    });
    // Re-render if we learned about newly completed matches (e.g. matches missing
    // scoreRedFinal in the hybrid endpoint but present in the scores endpoint)
    if (needsRerender) renderSchedule();
  } catch(e) {
    console.warn('FRC score details unavailable:', e);
  }
}

function renderScoreBreakdown(red, blue) {
  const row = (label, rVal, bVal, bold) => `
    <div class="sb-row${bold ? ' sb-total' : ''}">
      <span class="sb-label">${label}</span>
      <span class="sb-val red-col">${rVal ?? '—'}</span>
      <span class="sb-val blue-col">${bVal ?? '—'}</span>
    </div>`;
  return `
    <div class="sb-header-row">
      <span></span>
      <span class="sb-hdr red-col">RED</span>
      <span class="sb-hdr blue-col">BLUE</span>
    </div>
    ${row('Auto', red?.totalAutoPoints, blue?.totalAutoPoints)}
    ${row('Teleop', red?.totalTeleopPoints, blue?.totalTeleopPoints)}
    ${row('Endgame', red?.endGameTowerPoints, blue?.endGameTowerPoints)}
    ${row('Penalties', red?.foulPoints, blue?.foulPoints)}
    <div class="sb-divider"></div>
    ${row('Total', red?.totalPoints, blue?.totalPoints, true)}
    ${row('RP Earned', red?.rp, blue?.rp)}
  `;
}

function toggleMatchDetail(matchNum) {
  const panel = document.getElementById('score-detail-' + matchNum);
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  const arrow = panel.closest('.match-block').querySelector('.score-expand-btn');
  if (arrow) arrow.textContent = isOpen ? '▾' : '▴';
}

function setScheduleView(view) {
  scheduleView = view;
  const upBtn = document.getElementById('schedToggleUpcoming');
  const cmBtn = document.getElementById('schedToggleCompleted');
  if (upBtn) upBtn.classList.toggle('sched-tab-active', view === 'upcoming');
  if (cmBtn) cmBtn.classList.toggle('sched-tab-active', view === 'completed');
  renderSchedule();
}

function setScheduleType(type) {
  scheduleType = type;
  ['practice', 'qual', 'playoff'].forEach(t => {
    const btn = document.getElementById('schedType-' + t);
    if (btn) btn.classList.toggle('sched-tab-active', t === type);
  });
  const labels = { practice: 'Practice', qual: 'Qualification', playoff: 'Playoff' };
  const titleEl = document.getElementById('schedTitle');
  if (titleEl) titleEl.textContent = `${labels[type]} Schedule — ${getFrcEvent()} 2026`;
  scheduleData = [];
  scoreDetailData = {};
  // Immediately clear content and show a loading spinner
  const container = document.getElementById('scheduleList');
  if (container) container.innerHTML = `<div class="empty-state" style="padding:40px 0;">
    <div class="sched-spinner"></div>
    <div style="color:var(--text-dim);font-size:0.85rem;margin-top:14px;">Loading ${labels[type]} schedule…</div>
  </div>`;
  loadSchedule();
}

function renderSchedule() {
  const container = document.getElementById('scheduleList');
  if (!container) return;
  if (!scheduleData.length) {
    container.innerHTML = `<div class="empty-state">
      <div style="font-size:2rem;margin-bottom:12px;">📋</div>
      <div style="font-family:var(--font-display);font-size:1.1rem;color:var(--text);">Schedule not yet published</div>
      <div style="color:var(--text-dim);margin-top:8px;font-size:0.85rem;">Check back when the event begins</div>
    </div>`;
    return;
  }
  const isMatchComplete = m =>
    (m.postResultTime && m.scoreRedFinal !== null && m.scoreRedFinal !== undefined) ||
    scoreDetailData[m.matchNumber] !== undefined;
  const completed = scheduleData.filter(isMatchComplete);
  const upcoming  = scheduleData.filter(m => !isMatchComplete(m));
  let html = '';
  if (scheduleView === 'completed') {
    if (completed.length) {
      html += `<div class="sched-section-title">Completed — ${completed.length} match${completed.length !== 1 ? 'es' : ''}</div>`;
      html += [...completed].reverse().map(m => renderMatchBlock(m, true)).join('');
    } else {
      html = `<div class="empty-state"><div style="color:var(--text-dim);font-size:0.9rem;">No completed matches yet</div></div>`;
    }
  } else {
    if (upcoming.length) {
      html += `<div class="sched-section-title">Upcoming — ${upcoming.length} match${upcoming.length !== 1 ? 'es' : ''}</div>`;
      html += upcoming.map(m => renderMatchBlock(m, false)).join('');
    } else {
      html = `<div class="empty-state"><div style="color:var(--text-dim);font-size:0.9rem;">No upcoming matches</div></div>`;
    }
  }
  container.innerHTML = html;
}

function getMatchLabel(match) {
  if (scheduleType === 'practice') return `P${match.matchNumber}`;
  if (scheduleType === 'playoff') {
    // Abbreviate descriptions like "Semifinal 1 Match 2" → "SF1-2", "Final 1 Match 1" → "F1-1"
    const desc = match.description || '';
    const sf = desc.match(/Semifinal\s+(\d+)\s+Match\s+(\d+)/i);
    if (sf) return `SF${sf[1]}-${sf[2]}`;
    const f = desc.match(/Final\s+(?:\d+\s+)?Match\s+(\d+)/i);
    if (f) return `F1-${f[1]}`;
    return desc || `PO${match.matchNumber}`;
  }
  return `Q${match.matchNumber}`;
}

function renderMatchBlock(match, isCompleted) {
  const red  = match.teams.filter(t => t.station.startsWith('Red'));
  const blue = match.teams.filter(t => t.station.startsWith('Blue'));
  const timeStr = new Date(match.startTime).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});

  let headerRight;
  if (isCompleted) {
    const detail = scoreDetailData[match.matchNumber];
    const redScore  = match.scoreRedFinal  ?? detail?.red?.totalPoints;
    const blueScore = match.scoreBlueFinal ?? detail?.blue?.totalPoints;
    const rWon = redScore > blueScore;
    const bWon = blueScore > redScore;
    headerRight = `<div style="display:flex;align-items:center;gap:10px;">
      <div class="match-score-row">
        <span class="match-score-val red-score ${rWon ? 'winner' : ''}">${redScore ?? '—'}</span>
        <span class="match-score-sep">–</span>
        <span class="match-score-val blue-score ${bWon ? 'winner' : ''}">${blueScore ?? '—'}</span>
      </div>
      <span class="score-expand-btn">▾</span>
    </div>`;
  } else {
    headerRight = `<span class="match-time-badge">${timeStr}</span>`;
  }

  const makePills = (teams, color) => teams.map(t => {
    const info = ROSTER_MAP[t.teamNumber];
    const name = info ? info.name : '';
    const shortName = name.length > 13 ? name.slice(0, 12) + '…' : name;
    const allianceVal = color === 'red' ? 'Red' : 'Blue';
    return `<button class="team-pill ${color}"
        onclick="scoutFromSchedule(${t.teamNumber},${match.matchNumber},'${allianceVal}')">
      <span class="pill-num">${t.teamNumber}</span>
      <span class="pill-name">${shortName}</span>
    </button>`;
  }).join('');

  const detailPanel = isCompleted ? (() => {
    const detail = scoreDetailData[match.matchNumber];
    const content = detail
      ? renderScoreBreakdown(detail.red, detail.blue)
      : '<div style="color:var(--text-dim);font-size:0.75rem;padding:4px 0;">Loading breakdown…</div>';
    return `<div class="score-breakdown" id="score-detail-${match.matchNumber}" style="display:none">${content}</div>`;
  })() : '';

  const headerAttrs = isCompleted ? `onclick="toggleMatchDetail(${match.matchNumber})" style="cursor:pointer"` : '';

  return `<div class="match-block ${isCompleted ? 'completed' : 'upcoming'}">
    <div class="match-block-header" ${headerAttrs}>
      <span class="match-block-num">${getMatchLabel(match)}</span>
      ${headerRight}
    </div>
    <div class="match-teams-grid">
      <div class="match-alliance">${makePills(red, 'red')}</div>
      <div class="match-alliance">${makePills(blue, 'blue')}</div>
    </div>
    ${detailPanel}
  </div>`;
}

function scoutFromSchedule(teamNum, matchNum, alliance) {
  const info = ROSTER_MAP[teamNum];
  const teamName = info ? info.name : '';
  // Switch to scout tab
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-scout').classList.add('active');
  document.querySelector('[onclick="showView(\'scout\')"]').classList.add('active');
  // Pre-fill the form
  selectTeam(teamNum, teamName);
  document.getElementById('matchNum').value = matchNum;
  document.getElementById('allianceColor').value = alliance;
  setAllianceColor(alliance);
  loadExistingEntry(teamNum, matchNum);
  showToast(`Scouting T${teamNum} — Match ${matchNum} — ${alliance}`);
  window.scrollTo(0, 0);
}

// ===========================
// EVENT ROSTERS
// ===========================
const EVENT_ROSTERS = {
  NJWAS: [
    { num: 11,    name: 'MORT' },
    { num: 41,    name: 'RoboWarriors' },
    { num: 193,   name: 'MORT Beta' },
    { num: 219,   name: 'Team Impact' },
    { num: 222,   name: 'Tigertrons' },
    { num: 223,   name: 'Xtreme Heat' },
    { num: 316,   name: 'LUNATECS' },
    { num: 430,   name: 'MORT GAMMA' },
    { num: 555,   name: 'Montclair Robotics' },
    { num: 752,   name: 'Chargers' },
    { num: 1279,  name: 'Cold Fusion' },
    { num: 1672,  name: 'Robo T-Birds' },
    { num: 1676,  name: 'The Pascack PI-oneers' },
    { num: 1811,  name: 'FRESH' },
    { num: 3142,  name: 'Aperture' },
    { num: 3637,  name: 'The Daleks' },
    { num: 4285,  name: 'Camo-Bots' },
    { num: 4361,  name: 'Roxbotix' },
    { num: 5895,  name: 'Peddie Robotics' },
    { num: 5992,  name: 'Pirates' },
    { num: 6016,  name: 'Tiger Robotics' },
    { num: 6945,  name: 'Children of the Corn' },
    { num: 8117,  name: 'Easton RoboRovers' },
    { num: 8513,  name: 'Sisters 1st' },
    { num: 8706,  name: 'MXS Bulldog Bots' },
    { num: 8707,  name: 'The Newark Circuit Breakers' },
    { num: 8771,  name: 'PioTech' },
    { num: 9015,  name: 'Questionable Engineering' },
    { num: 9116,  name: 'The Canucks & Bolts' },
    { num: 10600, name: 'Two Steps Ahead' },
    { num: 10995, name: 'ACS Eagle Robotics' },
  ],

  NJFLA: [
    { num: 11,    name: 'MORT' },
    { num: 41,    name: 'RoboWarriors' },
    { num: 193,   name: 'MORT Beta' },
    { num: 219,   name: 'Team Impact' },
    { num: 222,   name: 'Tigertrons' },
    { num: 223,   name: 'Xtreme Heat' },
    { num: 430,   name: 'MORT GAMMA' },
    { num: 555,   name: 'Montclair Robotics' },
    { num: 1279,  name: 'Cold Fusion' },
    { num: 1626,  name: 'Falcon Robotics' },
    { num: 1676,  name: 'The Pascack PI-oneers' },
    { num: 1811,  name: 'FRESH' },
    { num: 3142,  name: 'Aperture' },
    { num: 4652,  name: 'Ironmen 2' },
    { num: 4653,  name: 'Ironmen Robotics' },
    { num: 5624,  name: 'TIGER TECH Robotics' },
    { num: 5732,  name: 'ROBOTIGERS' },
    { num: 5992,  name: 'Pirates' },
    { num: 6016,  name: 'Tiger Robotics' },
    { num: 6860,  name: 'Equitum Robotics' },
    { num: 6945,  name: 'Children of the Corn' },
    { num: 7045,  name: 'MCCrusaders' },
    { num: 8075,  name: 'CyberTigers' },
    { num: 8117,  name: 'Easton RoboRovers' },
    { num: 8513,  name: 'Sisters 1st' },
    { num: 8628,  name: 'Newark School of Global Studies' },
    { num: 8706,  name: 'MXS Bulldog Bots' },
    { num: 8707,  name: 'The Newark Circuit Breakers' },
    { num: 8771,  name: 'PioTech' },
    { num: 9116,  name: 'The Canucks & Bolts' },
    { num: 9424,  name: 'E.O. JAG BOTS' },
    { num: 10232, name: 'Killer Kardinals 2' },
    { num: 10366, name: 'Builder Bears' },
    { num: 10995, name: 'ACS Eagle Robotics' },
    { num: 10997, name: 'St. George' },
  ],
};

const EVENT_LABELS = {
  NJWAS: 'NJWAS — Washington',
  NJFLA: 'NJFLA — Mount Olive',
};

function getEventRoster() {
  return EVENT_ROSTERS[currentEvent] || [];
}

function initRosterMap() {
  // Clear existing entries
  Object.keys(ROSTER_MAP).forEach(k => delete ROSTER_MAP[k]);
  getEventRoster().forEach(t => { ROSTER_MAP[t.num] = t; });
}

function switchEvent(code) {
  if (code === currentEvent) return;
  currentEvent = code;
  localStorage.setItem('rebuilt_event', code);
  initRosterMap();
  officialRankings = {};
  _rankLastLoad = 0;
  scheduleData = [];
  scoreDetailData = {};
  if (typeof clearStatboticsCache === 'function') clearStatboticsCache(currentEvent);
  // Update schedule section title
  const titleEl = document.getElementById('schedTitle');
  if (titleEl) titleEl.textContent = `Match Schedule — ${code} 2026`;
  // Sync selector in case called programmatically
  const sel = document.getElementById('eventSelect');
  if (sel) sel.value = code;
  _subscribeAllianceState(code);
  renderTeams();
  renderAlliance();
  updateEntryCount();
  loadOfficialRankings();
  showToast(`Event: ${EVENT_LABELS[code] || code}`);
}
