// ===========================
// STATE
// ===========================
let sortKey = 'avgScore';
let sortAsc = false;
let selectedAlliance = [null, null, null];
let takenByAlliance = {};
let preferredRanks = {};
let editingEntryId = null;
let readOnly = false;

const ALLIANCE_COLORS = ['','#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#a855f7','#ec4899'];

// ===========================
// AUTH
// ===========================
const PASSWORD_HASH = '312274c1e4b86e58185e3911b6a2673ff651c798f679a1fb0d9b2082a4bcd0ea';

async function hashString(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function doLogin() {
  const name = document.getElementById('loginName').value.trim();
  const pass = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = '⚠ Enter your name'; errEl.style.display = 'block'; return; }
  if (!pass) { errEl.textContent = '⚠ Enter the team password'; errEl.style.display = 'block'; return; }
  const hash = await hashString(pass);
  if (hash !== PASSWORD_HASH) {
    errEl.textContent = '⚠ Incorrect password';
    errEl.style.display = 'block';
    document.getElementById('loginPassword').value = '';
    return;
  }
  localStorage.setItem('rebuilt_scoutName', name);
  sessionStorage.setItem('rebuilt_loggedIn', '1');
  sessionStorage.removeItem('rebuilt_readOnly');
  readOnly = false;
  document.body.classList.remove('read-only');
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('scoutName').value = name;
  _showLogoutBtn(name);
}

function doViewOnly() {
  sessionStorage.setItem('rebuilt_readOnly', '1');
  readOnly = true;
  document.body.classList.add('read-only');
  document.getElementById('loginOverlay').style.display = 'none';
  _showLogoutBtn(null, 'readonly');
}

function doTestMode() {
  sessionStorage.setItem('rebuilt_testMode', '1');
  sessionStorage.removeItem('rebuilt_readOnly');
  readOnly = false;
  document.body.classList.remove('read-only');
  document.getElementById('loginOverlay').style.display = 'none';
  activateTestMode();
  _showLogoutBtn('Test Mode');
}

function showLoginOverlay() {
  document.getElementById('loginOverlay').style.display = 'flex';
}

function _showLogoutBtn(label, mode) {
  const container = document.getElementById('logoutBtn');
  if (!container) return;
  const nameEl = container.querySelector('.logout-user');
  const actionBtn = document.getElementById('logoutActionBtn');
  if (!nameEl || !actionBtn) return;

  if (mode === 'readonly') {
    nameEl.textContent = 'READ ONLY';
    nameEl.className = 'logout-user logout-user--readonly';
    actionBtn.textContent = '→ Scout Login';
    actionBtn.className = 'header-auth-btn header-auth-btn--login';
    actionBtn.onclick = showLoginOverlay;
  } else {
    nameEl.textContent = label;
    nameEl.className = 'logout-user';
    actionBtn.textContent = '⎋ Logout';
    actionBtn.className = 'header-auth-btn header-auth-btn--logout';
    actionBtn.onclick = doLogout;
  }

  container.style.display = 'flex';
}

function doLogout() {
  sessionStorage.removeItem('rebuilt_loggedIn');
  sessionStorage.removeItem('rebuilt_readOnly');
  sessionStorage.removeItem('rebuilt_testMode');
  location.reload();
}

// getData() is provided by firebase-setup.js (real-time Firestore cache)

// ===========================
// TEAM AGGREGATION
// ===========================
function aggregateTeams() {
  const data = getData().filter(e => (e.event || 'NJWAS') === currentEvent);
  const map = {};
  data.forEach(e => {
    if (!map[e.teamNum]) map[e.teamNum] = [];
    map[e.teamNum].push(e);
  });
  return Object.entries(map).map(([num, entries]) => {
    const n = entries.length;
    const avg = v => entries.reduce((s,e)=>s+(e[v]||0),0)/n;
    const anyTrue = v => entries.some(e=>e[v]);
    const bestClimb = Math.max(...entries.map(e=>e.teleopTower||0));
    const bestAutoTower = Math.max(...entries.map(e=>e.autoTower||0));
    const avgFuel = avg('autoFuel') + avg('teleopFuel');
    const towerPts = { 0:0, 1:10, 2:20, 3:30 };
    const avgTowerPts = entries.reduce((s,e)=>{
      const atPts = e.autoTower===1?15:0;
      return s + atPts + (towerPts[e.teleopTower||0]);
    },0)/n;
    return {
      teamNum: parseInt(num),
      matches: n,
      avgScore: Math.round(entries.reduce((s,e)=>s+e.score,0)/n),
      avgFuel: Math.round(avgFuel*10)/10,
      avgAutoFuel: Math.round(avg('autoFuel')*10)/10,
      avgTeleopFuel: Math.round(avg('teleopFuel')*10)/10,
      bestClimb,
      bestAutoTower,
      avgTowerPts: Math.round(avgTowerPts*10)/10,
      avgDriving: Math.round(avg('driving')*10)/10,
      avgDefense: Math.round(avg('defense')*10)/10,
      avgReliability: Math.round(avg('reliability')*10)/10,
      hasStrFuelVolume: anyTrue('strFuelVolume'),
      hasStrClimber: anyTrue('strClimber'),
      hasStrConsistentAuto: anyTrue('strConsistentAuto'),
      hasStrDefense: anyTrue('strDefense'),
      wkBroke: anyTrue('wkBroke'),
      wkScoredWrong: anyTrue('wkScoredWrong'),
      gotCard: anyTrue('gotCard'),
      entries,
      // Statbotics fields (null if not yet loaded or team not found)
      ...(() => {
        const sb = (typeof getStatbotics === 'function') ? getStatbotics(parseInt(num)) : null;
        if (!sb) return { statEpa: null };
        const bp = sb.epa?.breakdown || {};
        const ranks = sb.epa?.ranks || {};
        return {
          statEpa:           sb.epa?.total_points?.mean ?? null,
          statEpaSd:         sb.epa?.total_points?.sd   ?? null,
          statNormEpa:       sb.epa?.norm               ?? null,
          statAutoEpa:       bp.auto_points             ?? null,
          statTeleopEpa:     bp.teleop_points           ?? null,
          statEndgameEpa:    bp.endgame_points          ?? null,
          statEnergizedRp:   bp.energized_rp            ?? null,
          statSuperchargedRp:bp.supercharged_rp         ?? null,
          statTraversalRp:   bp.traversal_rp            ?? null,
          statWinRate:       sb.record?.winrate         ?? null,
          statWins:          sb.record?.wins            ?? null,
          statLosses:        sb.record?.losses          ?? null,
          statNatRank:       ranks.total?.rank          ?? null,
          statNatPct:        ranks.total?.percentile    ?? null,
          statStateRank:     ranks.state?.rank          ?? null,
          statStatePct:      ranks.state?.percentile    ?? null,
          statDistrictRank:  ranks.district?.rank       ?? null,
          statDistrictPct:   ranks.district?.percentile ?? null,
        };
      })()
    };
  });
}

// ===========================
// RENDER TEAMS TABLE
// ===========================
let teamsData = [];
let activeTagFilters = new Set();

function toggleTagFilter(btn) {
  const tag = btn.dataset.tag;
  if (activeTagFilters.has(tag)) activeTagFilters.delete(tag);
  else activeTagFilters.add(tag);
  btn.classList.toggle('active', activeTagFilters.has(tag));
  renderTeams();
}

function renderTeams() {
  teamsData = aggregateTeams();
  const search = (document.getElementById('teamSearch')?.value||'').trim();
  let filtered = teamsData;
  if (search) filtered = filtered.filter(t=>String(t.teamNum).includes(search));
  if (activeTagFilters.size > 0) {
    filtered = filtered.filter(t => [...activeTagFilters].every(tag => t[tag]));
  }
  filtered.sort((a,b)=>{
    let av, bv;
    if (sortKey === 'officialRank') {
      av = officialRankings[a.teamNum]?.rank ?? 9999;
      bv = officialRankings[b.teamNum]?.rank ?? 9999;
      return sortAsc ? bv-av : av-bv; // lower rank # = better, default descending shows #1 first
    }
    if (sortKey === 'statEpa') {
      av = a.statEpa ?? -1;
      bv = b.statEpa ?? -1;
      return sortAsc ? av-bv : bv-av;
    }
    av=a[sortKey]??0; bv=b[sortKey]??0;
    return sortAsc ? av-bv : bv-av;
  });

  const tbody = document.getElementById('teamsBody');
  const empty = document.getElementById('teamsEmpty');
  tbody.innerHTML = '';
  document.getElementById('teamsCards').innerHTML = '';

  if (!filtered.length) {
    empty.style.display='block';
    return;
  }
  empty.style.display='none';

  const climbLabel = ['—','L1','L2','L3'];
  const starRating = v => v>0 ? '★'.repeat(Math.round(v)) + '☆'.repeat(5-Math.round(v)) : '—';

  filtered.forEach(t => {
    const tr = document.createElement('tr');
    tr.onclick = () => openTeamModal(t.teamNum);

    const tags = [];
    if (t.hasStrFuelVolume) tags.push('<span class="badge badge-blue">HIGH FUEL</span>');
    if (t.hasStrClimber) tags.push('<span class="badge badge-green">CLIMBER</span>');
    if (t.hasStrConsistentAuto) tags.push('<span class="badge badge-blue">AUTO</span>');
    if (t.hasStrDefense) tags.push('<span class="badge badge-orange">DEFENSE</span>');
    if (t.wkBroke) tags.push('<span class="badge badge-red">UNRELIABLE</span>');
    if (t.gotCard) tags.push('<span class="badge badge-red">CARDED</span>');
    if (t.wkScoredWrong) tags.push('<span class="badge badge-red">HUB ERR</span>');

    const rpDots = [
      t.avgFuel >= 100 ? 'lit' : '',
      t.avgFuel >= 360 ? 'lit' : '',
      t.avgTowerPts >= 50 ? 'lit' : ''
    ];

    const climbSegs = `
      <div class="climb-bar">
        <div class="climb-seg ${t.bestClimb>=1?'lit':''}"></div>
        <div class="climb-seg ${t.bestClimb>=2?'lit':''}"></div>
        <div class="climb-seg ${t.bestClimb>=3?'lit':''}"></div>
      </div>`;

    const rawNote = t.entries.slice(-1)[0]?.notes || '';
    const escapedNote = rawNote.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const noteCell = rawNote
      ? `<td class="td-note-icon"><span class="note-icon" data-note="${escapedNote}">ⓘ</span></td>`
      : `<td class="td-note-icon"></td>`;

    const or = officialRankings[t.teamNum];
    const frcRankCell = or
      ? `<td class="td-frc"><span class="frc-rank-num">#${or.rank}</span><span class="frc-rank-wl">${or.wins}W-${or.losses}L</span></td>`
      : `<td class="td-frc td-frc-empty">—</td>`;

    const epaCell = t.statEpa != null
      ? `<td class="td-epa">
           <span class="epa-val" style="color:${epaColor(t.statEpa)};">${t.statEpa.toFixed(1)}</span>
           ${t.statEpaSd != null ? `<span class="epa-sd">±${t.statEpaSd.toFixed(1)}</span>` : ''}
         </td>`
      : `<td class="td-epa td-epa-empty">—</td>`;

    tr.innerHTML = `
      <td class="team-num">
        <div class="team-num-cell">
          <img class="row-avatar" src="${teamAvatar(t.teamNum)}" alt="" onerror="this.style.display='none'">
          ${t.teamNum}
        </div>
      </td>
      ${frcRankCell}
      ${epaCell}
      <td style="font-family:var(--font-mono);color:var(--text-dim)">${t.matches}</td>
      <td class="score-cell">${t.avgScore}</td>
      <td style="font-family:var(--font-mono)">${t.avgFuel}</td>
      <td>${climbSegs} <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-dim);margin-left:4px;">${climbLabel[t.bestClimb]}</span></td>
      <td style="color:var(--accent3);font-size:0.85rem;">${starRating(t.avgDriving)}</td>
      <td style="color:var(--accent3);font-size:0.85rem;">${starRating(t.avgReliability)}</td>
      <td>
        <div class="rp-dots">
          <div class="rp-dot ${rpDots[0]}" title="ENERGIZED RP (100 fuel)"></div>
          <div class="rp-dot ${rpDots[1]}" title="SUPERCHARGED RP (360 fuel)"></div>
          <div class="rp-dot ${rpDots[2]}" title="TRAVERSAL RP (50 tower pts)"></div>
        </div>
      </td>
      <td class="td-tags">${tags.join('')}</td>
      ${noteCell}
    `;
    tbody.appendChild(tr);
  });
  renderTeamsCards(filtered);
  updateEntryCount();
}

function renderTeamsCards(teams) {
  const container = document.getElementById('teamsCards');
  const climbLabel = ['—','L1','L2','L3'];
  const starRating = v => v > 0 ? '★'.repeat(Math.round(v)) + '☆'.repeat(5 - Math.round(v)) : '—';

  container.innerHTML = teams.map(t => {
    const teamName = ROSTER_MAP[t.teamNum]?.name || '';
    const or = officialRankings[t.teamNum];
    const rankBadge = or
      ? `<div style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);">#${or.rank}</div>
         <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);">${or.wins}W-${or.losses}L</div>`
      : '';

    const epaVal = t.statEpa != null
      ? `<div class="s-num" style="color:${epaColor(t.statEpa)};">${t.statEpa.toFixed(1)}</div>`
      : `<div class="s-num">—</div>`;

    const tags = [];
    if (t.hasStrFuelVolume) tags.push('<span class="badge badge-blue">HIGH FUEL</span>');
    if (t.hasStrClimber)    tags.push('<span class="badge badge-green">CLIMBER</span>');
    if (t.hasStrConsistentAuto) tags.push('<span class="badge badge-blue">AUTO</span>');
    if (t.hasStrDefense)    tags.push('<span class="badge badge-orange">DEFENSE</span>');
    if (t.wkBroke)          tags.push('<span class="badge badge-red">UNRELIABLE</span>');
    if (t.gotCard)          tags.push('<span class="badge badge-red">CARDED</span>');
    if (t.wkScoredWrong)    tags.push('<span class="badge badge-red">HUB ERR</span>');

    const rawNote = t.entries.slice(-1)[0]?.notes || '';
    const noteRow = rawNote
      ? `<div style="margin-top:8px;font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);border-top:1px solid var(--border);padding-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${rawNote.replace(/"/g,'&quot;')}">ⓘ ${rawNote}</div>`
      : '';

    return `
      <div class="team-card" onclick="openTeamModal(${t.teamNum})">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <img class="card-avatar" src="${teamAvatar(t.teamNum)}" alt="" onerror="this.style.display='none'">
            <div>
              <div class="card-team-num">${t.teamNum}</div>
              ${teamName ? `<div class="card-team-name">${teamName}</div>` : ''}
            </div>
          </div>
          <div style="text-align:right;">${rankBadge}</div>
        </div>
        <div class="card-stats">
          <div class="stat-box"><div class="s-num">${t.avgScore}</div><div class="s-lbl">Avg Score</div></div>
          <div class="stat-box"><div class="s-num">${t.avgFuel}</div><div class="s-lbl">Avg Fuel</div></div>
          <div class="stat-box"><div class="s-num">${climbLabel[t.bestClimb]}</div><div class="s-lbl">Best Climb</div></div>
          <div class="stat-box">${epaVal}<div class="s-lbl">◈ EPA</div></div>
          <div class="stat-box"><div class="s-num">${t.matches}</div><div class="s-lbl">Matches</div></div>
          <div class="stat-box"><div class="s-num" style="font-size:0.75rem;">${starRating(t.avgReliability)}</div><div class="s-lbl">Reliability</div></div>
        </div>
        ${tags.length ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">${tags.join('')}</div>` : ''}
        ${noteRow}
      </div>`;
  }).join('');
}

function sortTeams(key) {
  if (sortKey === key) sortAsc = !sortAsc;
  else { sortKey = key; sortAsc = false; }
  document.querySelectorAll('thead th').forEach(th => {
    th.classList.remove('sorted','asc');
  });
  renderTeams();
}

// ===========================
// TEAM MODAL
// ===========================
function openTeamModal(teamNum) {
  const teams = aggregateTeams();
  const team = teams.find(t=>t.teamNum===teamNum);
  if (!team) return;
  const sbData = (typeof getStatbotics === 'function') ? getStatbotics(teamNum) : null;
  const distRankStr = sbData?.epa?.ranks?.district?.rank != null
    ? ` · FMA #${sbData.epa.ranks.district.rank}` : '';
  document.getElementById('modalTitle').textContent = `Team ${teamNum} — ${team.matches} Match${team.matches!==1?'es':''}${distRankStr}`;
  const climbLabel = ['—','L1','L2','L3'];
  const towerPts = { 0:0, 1:10, 2:20, 3:30 };

  const matchesHtml = team.entries.map(e=>{
    const flags = [];
    if(e.strFuelVolume) flags.push('<span class="info-chip lit">HIGH FUEL</span>');
    if(e.strClimber) flags.push('<span class="info-chip lit">CLIMBER</span>');
    if(e.climbFailed) flags.push('<span class="info-chip lit">CLIMB FAIL</span>');
    if(e.gotCard) flags.push('<span class="info-chip lit">CARDED</span>');
    if(e.scoredInactive) flags.push('<span class="info-chip lit">WRONG HUB</span>');
    if(e.playedDefense) flags.push('<span class="info-chip">DEFENSE</span>');
    if(e.hubAware) flags.push('<span class="info-chip">SHIFT-AWARE</span>');
    return `
      <div class="match-entry">
        <div class="match-entry-header">
          <span>Match ${e.matchNum} — ${e.alliance||'?'} Alliance${e.scout ? ` · <span style="color:var(--text-dim);font-size:0.82rem;">Scout: ${e.scout}</span>` : ''}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="match-score">${e.score} pts</span>
            <button class="btn-sm danger" style="padding:2px 8px;font-size:0.7rem;" onclick="deleteEntry(${e.id},${teamNum})">✕</button>
          </div>
        </div>
        <div class="match-stats-grid">
          <div class="ms"><span class="ms-l">Auto Fuel</span><span class="ms-v">${e.autoFuel}</span></div>
          <div class="ms"><span class="ms-l">Teleop Fuel</span><span class="ms-v">${e.teleopFuel}</span></div>
          <div class="ms"><span class="ms-l">Tower (Teleop)</span><span class="ms-v">${climbLabel[e.teleopTower||0]} (+${towerPts[e.teleopTower||0]}pts)</span></div>
          <div class="ms"><span class="ms-l">Driving</span><span class="ms-v">${e.driving||'—'}/5</span></div>
          <div class="ms"><span class="ms-l">Defense</span><span class="ms-v">${e.defense||'—'}/5</span></div>
          <div class="ms"><span class="ms-l">Reliability</span><span class="ms-v">${e.reliability||'—'}/5</span></div>
        </div>
        ${flags.length ? '<div style="margin-top:10px;">'+flags.join('')+'</div>' : ''}
        ${e.notes ? `<div style="margin-top:10px;font-size:0.82rem;color:var(--text-dim);border-top:1px solid var(--border);padding-top:8px;">${e.notes}</div>` : ''}
      </div>`;
  }).join('');

  document.getElementById('modalBody').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
      <div class="stat-box"><div class="s-num">${team.avgScore}</div><div class="s-lbl">Avg Score</div></div>
      <div class="stat-box"><div class="s-num">${team.avgFuel}</div><div class="s-lbl">Avg Fuel/Match</div></div>
      <div class="stat-box"><div class="s-num">${climbLabel[team.bestClimb]}</div><div class="s-lbl">Best Climb</div></div>
      <div class="stat-box"><div class="s-num">${team.avgDriving||'—'}</div><div class="s-lbl">Avg Driving</div></div>
      <div class="stat-box"><div class="s-num">${team.avgReliability||'—'}</div><div class="s-lbl">Avg Reliability</div></div>
      <div class="stat-box"><div class="s-num">${team.avgTowerPts}</div><div class="s-lbl">Avg Tower Pts</div></div>
    </div>
    ${(typeof renderStatboticsModalSection === 'function') ? renderStatboticsModalSection(teamNum) : ''}
    <div class="panel-title" style="margin-bottom:14px;">Match History</div>
    ${matchesHtml}
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn-sm danger" onclick="deleteTeam(${teamNum})">✕ Delete All Entries</button>
    </div>
  `;
  document.getElementById('teamModal').classList.add('open');
}

function closeModal() {
  document.getElementById('teamModal').classList.remove('open');
}
document.getElementById('teamModal').addEventListener('click', e => {
  if (e.target === document.getElementById('teamModal')) closeModal();
});

let _deleteConfirmKey = null;
let _deleteConfirmCallback = null;

function _openDeleteConfirm({ title, description, confirmKey, inputMode = 'text', buttonLabel = 'Delete', onConfirm }) {
  _deleteConfirmKey = String(confirmKey);
  _deleteConfirmCallback = onConfirm;
  document.getElementById('deleteConfirmTitle').textContent = title;
  document.getElementById('deleteConfirmDesc').textContent = description;
  document.getElementById('deleteConfirmPrompt').textContent = confirmKey;
  document.getElementById('deleteConfirmBtn').textContent = buttonLabel;
  const input = document.getElementById('deleteConfirmInput');
  input.value = '';
  input.inputMode = inputMode;
  input.classList.remove('confirmed');
  document.getElementById('deleteConfirmBtn').disabled = true;
  document.getElementById('deleteConfirmModal').classList.add('open');
  input.focus();
}

function closeDeleteConfirm() {
  document.getElementById('deleteConfirmModal').classList.remove('open');
  _deleteConfirmKey = null;
  _deleteConfirmCallback = null;
}

function _isLiveEventLocked() {
  return !sessionStorage.getItem('rebuilt_testMode') && (currentEvent === 'NJWAS' || currentEvent === 'NJFLA');
}

function deleteTeam(teamNum) {
  if (_isLiveEventLocked()) { showToast(currentEvent + ' event is locked — deletes are disabled in live mode'); return; }
  _openDeleteConfirm({
    title: 'Confirm Delete',
    description: `This will permanently delete all scouting entries for team ${teamNum}. This cannot be undone.`,
    confirmKey: teamNum,
    inputMode: 'numeric',
    buttonLabel: 'Delete All Entries',
    onConfirm: () => {
      deleteTeamFromFirestore(teamNum, currentEvent)
        .then(() => { closeDeleteConfirm(); closeModal(); showToast('Deleted team ' + teamNum); })
        .catch(() => showToast('⚠ Delete failed'));
    }
  });
}

// ===========================
// ALLIANCE PICKER
// ===========================
function renderAlliance() {
  const teams = aggregateTeams().sort((a, b) => {
    const ra = preferredRanks[a.teamNum];
    const rb = preferredRanks[b.teamNum];
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return b.avgScore - a.avgScore;
  });
  const container = document.getElementById('allianceCards');
  const empty = document.getElementById('allianceEmpty');
  const content = document.getElementById('allianceContent');

  if (!teams.length) {
    empty.style.display = 'block';
    content.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  content.style.display = 'block';

  const climbLabel = ['—','L1','L2','L3'];
  container.innerHTML = teams.map((t,i)=>{
    const isSelected = selectedAlliance.includes(t.teamNum);
    const takenNum = takenByAlliance[t.teamNum];
    const isTaken = !!takenNum;
    const tags = [];
    if(t.hasStrFuelVolume) tags.push('HIGH FUEL');
    if(t.hasStrClimber) tags.push('CLIMBER');
    if(t.hasStrConsistentAuto) tags.push('AUTO');
    if(t.hasStrDefense) tags.push('DEFENSE');

    const allianceOptions = `<option value="">—</option>${Array.from({length:8},(_,n)=>`<option value="${n+1}" ${takenNum==n+1?'selected':''}>A${n+1}</option>`).join('')}`;

    const teamName = ROSTER_MAP[t.teamNum]?.name || '';
    const hasPref = preferredRanks[t.teamNum] != null;
    const distBadge = t.statDistrictRank != null
      ? `<span class="card-dist-rank">FMA #${t.statDistrictRank}</span>` : '';
    return `
      <div class="team-card ${isSelected?'selected':''} ${isTaken?'taken':''}" onclick="toggleAlliancePick(${t.teamNum})">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <img class="card-avatar" src="${teamAvatar(t.teamNum)}" alt="" onerror="this.style.display='none'">
            <div>
              <div class="card-team-num">Team ${t.teamNum} ${distBadge}</div>
              ${teamName ? `<div class="card-team-name">${teamName}</div>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <select class="alliance-num-select${isTaken?' taken':''}" style="${isTaken?`color:${ALLIANCE_COLORS[takenNum]};border-color:${ALLIANCE_COLORS[takenNum]};`:'color:var(--text-dim);border-color:var(--border);'}" onchange="setTeamAlliance(${t.teamNum},this.value)" onclick="event.stopPropagation()">${allianceOptions}</select>
            <input class="rank-input${hasPref?' rank-set':''}" type="number" min="1" value="${hasPref?preferredRanks[t.teamNum]:''}" placeholder="#${i+1}" title="Set preferred rank" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')this.blur()" onchange="setPreferredRank(${t.teamNum},this.value)" onclick="event.stopPropagation()">
          </div>
        </div>
        ${isTaken?`<div class="taken-overlay" style="background:${ALLIANCE_COLORS[takenNum]}22;border-color:${ALLIANCE_COLORS[takenNum]};">TAKEN · A${takenNum}</div>`:''}
        <div class="card-stats">
          <div class="stat-box">
            <div class="s-num">${t.avgScore}</div>
            <div class="s-lbl">Avg Score</div>
          </div>
          <div class="stat-box">
            <div class="s-num">${t.avgFuel}</div>
            <div class="s-lbl">Avg Fuel</div>
          </div>
          <div class="stat-box">
            <div class="s-num">${climbLabel[t.bestClimb]}</div>
            <div class="s-lbl">Best Climb</div>
          </div>
          <div class="stat-box">
            <div class="s-num">${t.avgReliability||'—'}</div>
            <div class="s-lbl">Reliability</div>
          </div>
          <div class="stat-box">
            <div class="s-num" style="color:${(typeof epaColor==='function')?epaColor(t.statEpa):'inherit'};">${t.statEpa != null ? t.statEpa.toFixed(1) : '—'}</div>
            <div class="s-lbl">◈ EPA</div>
          </div>
          <div class="stat-box">
            <div class="s-num" style="font-size:0.85rem;">${t.statWinRate != null ? Math.round(t.statWinRate*100)+'%' : '—'}</div>
            <div class="s-lbl">Win Rate</div>
          </div>
        </div>
        ${tags.map(tag=>`<span class="info-chip ${tag==='HIGH FUEL'||tag==='CLIMBER'?'lit':''}">${tag}</span>`).join('')}
        ${t.wkBroke?'<span class="info-chip" style="border-color:var(--red);color:var(--red);">UNRELIABLE</span>':''}
        ${t.gotCard?'<span class="info-chip" style="border-color:var(--red);color:var(--red);">CARDED</span>':''}
      </div>`;
  }).join('');

  updateAllianceSlots();
  renderDraftBoard();
}

function toggleAlliancePick(teamNum) {
  if (takenByAlliance[teamNum]) {
    showToast(`Team ${teamNum} is taken by Alliance ${takenByAlliance[teamNum]}`);
    return;
  }
  const idx = selectedAlliance.indexOf(teamNum);
  if (idx >= 0) {
    selectedAlliance[idx] = null;
  } else {
    const firstEmpty = selectedAlliance.indexOf(null);
    if (firstEmpty === -1) { showToast('Alliance is full — remove a team first'); return; }
    selectedAlliance[firstEmpty] = teamNum;
  }
  renderAlliance();
}

// Called by firebase-setup.js onSnapshot — applies shared alliance state from Firestore
function applyAllianceState(state) {
  takenByAlliance = (state && state.takenByAlliance) ? state.takenByAlliance : {};
  preferredRanks = (state && state.preferredRanks) ? state.preferredRanks : {};
  renderAlliance();
}

function setTeamAlliance(teamNum, val) {
  if (readOnly) { showToast('View-only mode — cannot change alliance assignments'); renderAlliance(); return; }
  if (!val) {
    delete takenByAlliance[teamNum];
  } else {
    takenByAlliance[teamNum] = parseInt(val);
    const idx = selectedAlliance.indexOf(teamNum);
    if (idx >= 0) { selectedAlliance[idx] = null; }
  }
  renderAlliance();
  saveAllianceState(currentEvent, takenByAlliance, preferredRanks).catch(() => showToast('⚠ Could not save alliance state'));
}

function setPreferredRank(teamNum, val) {
  if (readOnly) { showToast('View-only mode — cannot change preferred ranks'); renderAlliance(); return; }
  const n = parseInt(val);
  if (!val || isNaN(n) || n < 1) {
    delete preferredRanks[teamNum];
  } else {
    preferredRanks[teamNum] = n;
  }
  renderAlliance();
  saveAllianceState(currentEvent, takenByAlliance, preferredRanks).catch(() => showToast('⚠ Could not save alliance state'));
}

function renderDraftBoard() {
  const board = document.getElementById('draftBoard');
  if (!board) return;
  const tmap = {};
  aggregateTeams().forEach(t => { tmap[t.teamNum] = t; });

  board.innerHTML = Array.from({length:8}, (_,i) => {
    const n = i + 1;
    const color = ALLIANCE_COLORS[n];
    const allianceTeams = Object.entries(takenByAlliance)
      .filter(([,v]) => v === n)
      .map(([k]) => parseInt(k))
      .sort((a,b) => {
        const sa = tmap[a]?.avgScore ?? 0;
        const sb = tmap[b]?.avgScore ?? 0;
        return sb - sa;
      });

    return `
      <div class="draft-col" style="--ac:${color}">
        <div class="draft-col-header">Alliance ${n}</div>
        <div class="draft-col-teams">
          ${allianceTeams.length
            ? allianceTeams.map(num => {
                const t = tmap[num];
                return `<div class="draft-chip" title="Avg ${t?.avgScore??'?'} pts">${num}<span class="draft-chip-score">${t?.avgScore??'?'}</span></div>`;
              }).join('')
            : '<div class="draft-empty">empty</div>'}
        </div>
      </div>`;
  }).join('');
}

function updateAllianceSlots() {
  const labels = ['CAPTAIN','PICK 1','PICK 2'];
  const teams = aggregateTeams();
  const tmap = {};
  teams.forEach(t=>{ tmap[t.teamNum]=t; });

  selectedAlliance.forEach((num, i) => {
    const slot = document.getElementById('slot-'+i);
    if (!slot) return;
    if (num) {
      const t = tmap[num];
      slot.classList.add('filled');
      slot.innerHTML = `
        <span class="slot-num">${num}</span>
        <span class="slot-label">${labels[i]}</span>
        <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-dim);">avg ${t?.avgScore||0} pts</span>
        <button class="slot-remove" onclick="event.stopPropagation();removeSlot(${i})">Remove</button>
      `;
    } else {
      slot.classList.remove('filled');
      slot.innerHTML = `<span class="slot-empty">+ Pick ${labels[i]}</span><span class="slot-label">${labels[i]}</span>`;
    }
  });

  // Summary
  const picked = selectedAlliance.filter(Boolean).map(n=>tmap[n]).filter(Boolean);
  if (picked.length > 0) {
    const totalFuel = picked.reduce((s,t)=>s+t.avgFuel,0);
    const totalScore = picked.reduce((s,t)=>s+t.avgScore,0);
    const totalTowerPts = picked.reduce((s,t)=>s+t.avgTowerPts,0);
    document.getElementById('allyTotalFuel').textContent = Math.round(totalFuel*10)/10;
    document.getElementById('allyTowerPts').textContent = Math.round(totalTowerPts*10)/10;
    document.getElementById('allyAvgScore').textContent = Math.round(totalScore*10)/10;

    // RP pills
    const rpE = document.getElementById('rp-energized');
    const rpS = document.getElementById('rp-supercharged');
    const rpT = document.getElementById('rp-traversal');
    document.getElementById('rp-e-val').textContent = totalFuel >= 100 ? `✓ ~${Math.round(totalFuel)} avg` : `${Math.round(totalFuel)}/100 avg fuel`;
    document.getElementById('rp-s-val').textContent = totalFuel >= 360 ? `✓ ~${Math.round(totalFuel)} avg` : `${Math.round(totalFuel)}/360 avg fuel`;
    document.getElementById('rp-t-val').textContent = totalTowerPts >= 50 ? `✓ ~${Math.round(totalTowerPts)} avg pts` : `${Math.round(totalTowerPts)}/50 avg pts`;
    rpE.className = 'rp-pill' + (totalFuel>=100?' rp-reached':'');
    rpS.className = 'rp-pill' + (totalFuel>=360?' rp-reached':'');
    rpT.className = 'rp-pill' + (totalTowerPts>=50?' rp-reached':'');
  } else {
    document.getElementById('allyTotalFuel').textContent = '—';
    document.getElementById('allyTowerPts').textContent = '—';
    document.getElementById('allyAvgScore').textContent = '—';
    document.getElementById('rp-e-val').textContent = 'Need 100 fuel';
    document.getElementById('rp-s-val').textContent = 'Need 360 fuel';
    document.getElementById('rp-t-val').textContent = 'Need 50 tower pts';
    ['rp-energized','rp-supercharged','rp-traversal'].forEach(id=>{ document.getElementById(id).className='rp-pill'; });
  }
}

function removeSlot(i) {
  selectedAlliance[i] = null;
  renderAlliance();
}

// ===========================
// SCOUT REPORT
// ===========================
function showScoutReport() {
  const entries = getData().filter(e => (e.event || 'NJWAS') === currentEvent);

  if (!entries.length) {
    showToast('No scouting entries for ' + currentEvent);
    return;
  }

  // Group by scout name
  const byScout = {};
  entries.forEach(e => {
    const name = (e.scout || '').trim() || '(unknown)';
    if (!byScout[name]) byScout[name] = [];
    byScout[name].push(e);
  });

  const scouts = Object.entries(byScout).sort((a, b) => b[1].length - a[1].length);

  const html = scouts.map(([name, scoutEntries]) => {
    const sorted = scoutEntries.slice().sort((a, b) => a.matchNum - b.matchNum);
    const matchList = sorted.map(e =>
      `<span class="info-chip" style="font-size:0.75rem;font-family:var(--font-mono);">M${e.matchNum}&thinsp;·&thinsp;T${e.teamNum}</span>`
    ).join('');
    return `
      <div class="match-entry">
        <div class="match-entry-header">
          <span style="font-family:var(--font-display);font-weight:600;font-size:1rem;">${name}</span>
          <span class="match-score">${scoutEntries.length} entr${scoutEntries.length === 1 ? 'y' : 'ies'}</span>
        </div>
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">${matchList}</div>
      </div>`;
  }).join('');

  document.getElementById('modalTitle').textContent = `Scout Report — ${currentEvent} · ${entries.length} total entr${entries.length === 1 ? 'y' : 'ies'}`;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('teamModal').classList.add('open');
}

// ===========================
// TEAMS TOOLS DRAWER
// ===========================
function toggleTeamsTools() {
  const drawer = document.getElementById('teamsToolsDrawer');
  const btn = document.querySelector('.teams-gear-btn');
  if (!drawer) return;
  const open = drawer.classList.toggle('open');
  if (btn) btn.classList.toggle('open', open);
}

// ===========================
// EXPORT / IMPORT
// ===========================
function exportCSV() {
  const data = getData();
  if (!data.length) { showToast('No data to export'); return; }
  const headers = ['event','teamNum','matchNum','alliance','scout','autoFuel','teleopFuel','fuelMissed','autoTower','teleopTower','score','driving','defense','reliability','autoMoved','hubAware','scoredInactive','climbFast','climbFailed','playedDefense','wasPinned','gotCard','autoStrategy','notes','timestamp'];
  const csv = [headers.join(','), ...data.map(e=>headers.map(h=>{
    const v = e[h]===undefined?'':e[h];
    return typeof v==='string'&&v.includes(',') ? `"${v}"` : v;
  }).join(','))].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rebuilt_scout_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('CSV exported!');
}

function exportJSON() {
  const data = getData();
  if (!data.length) { showToast('No data to export'); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rebuilt_scout_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  showToast('JSON exported!');
}

function importJSON(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) { showToast('⚠ Invalid file — expected JSON array'); return; }
      const count = await batchImportToFirestore(imported);
      if (!count) { showToast('No new entries to merge'); return; }
      showToast(`✓ Merged ${count} new entr${count===1?'y':'ies'}`);
      // onSnapshot will re-render automatically
    } catch {
      showToast('⚠ Could not parse file');
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

function deleteEntry(entryId, teamNum) {
  if (_isLiveEventLocked()) { showToast(currentEvent + ' event is locked — deletes are disabled in live mode'); return; }
  if (!confirm('Delete this match entry?')) return;
  const hasRemaining = getData().filter(e => e.teamNum === teamNum && e.id !== entryId).length > 0;
  deleteEntryFromFirestore(entryId)
    .then(() => {
      showToast('Entry deleted');
      // onSnapshot will re-render; decide modal state optimistically
      if (hasRemaining) openTeamModal(teamNum);
      else closeModal();
    })
    .catch(() => showToast('⚠ Delete failed'));
}

function clearAll() {
  if (_isLiveEventLocked()) { showToast(currentEvent + ' event is locked — deletes are disabled in live mode'); return; }
  _openDeleteConfirm({
    title: 'Clear All Data',
    description: `This will permanently delete ALL scouting data for event ${currentEvent}. This cannot be undone.`,
    confirmKey: currentEvent,
    inputMode: 'text',
    buttonLabel: 'Clear All Data',
    onConfirm: () => {
      clearAllEntriesFromFirestore(currentEvent)
        .then(() => {
          selectedAlliance = [null,null,null];
          takenByAlliance = {};
          clearAllianceState(currentEvent).catch(() => {});
          closeDeleteConfirm();
          showToast('All data cleared');
        })
        .catch(() => showToast('⚠ Clear failed'));
    }
  });
}

// ===========================
// NAVIGATION
// ===========================
function showView(name) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  event.currentTarget.classList.add('active');
  if (name==='schedule') loadSchedule();
  if (name==='teams') { renderTeams(); loadOfficialRankings(); }
  if (name==='alliance') renderAlliance();
}

// ===========================
// HELPERS
// ===========================
function updateEntryCount() {
  const n = getData().filter(e => (e.event || 'NJWAS') === currentEvent).length;
  document.getElementById('entryCount').textContent = n + ' ENTR' + (n===1?'Y':'IES') + ' LOGGED';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2400);
}

// ===========================
// INIT
// ===========================
window.addEventListener('DOMContentLoaded', ()=>{
  initRosterMap();
  // Restore persisted event selection
  const savedEvent = localStorage.getItem('rebuilt_event') || 'NJWAS';
  const eventSel = document.getElementById('eventSelect');
  if (eventSel) eventSel.value = savedEvent;
  const schedTitle = document.getElementById('schedTitle');
  if (schedTitle) schedTitle.textContent = `Match Schedule — ${savedEvent} 2026`;
  setTower('autoTower', 0);
  setTower('teleopTower', 0);
  updatePreview();
  updateEntryCount();
  loadOfficialRankings(); // pre-load so rankings tab shows data immediately

  // Check login session
  const loggedIn = sessionStorage.getItem('rebuilt_loggedIn');
  const savedName = localStorage.getItem('rebuilt_scoutName');
  const savedReadOnly = sessionStorage.getItem('rebuilt_readOnly');
  const savedTestMode = sessionStorage.getItem('rebuilt_testMode');
  if (savedTestMode) {
    readOnly = false;
    document.getElementById('loginOverlay').style.display = 'none';
    activateTestMode();
    _showLogoutBtn('Test Mode');
  } else if (loggedIn && savedName) {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('scoutName').value = savedName;
    _showLogoutBtn(savedName);
  } else if (savedReadOnly) {
    readOnly = true;
    document.body.classList.add('read-only');
    document.getElementById('loginOverlay').style.display = 'none';
    _showLogoutBtn(null, 'readonly');
  } else if (savedName) {
    // Pre-fill name so returning scouts only need to enter the password
    document.getElementById('loginName').value = savedName;
  }

  // Submit login on Enter key from either login field
  ['loginName', 'loginPassword'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });

  // Persist scout name on change
  document.getElementById('scoutName').addEventListener('change', e=>{
    localStorage.setItem('rebuilt_scoutName', e.target.value);
  });
});
