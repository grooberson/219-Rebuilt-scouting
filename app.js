// ===========================
// STATE
// ===========================
let sortKey = 'avgScore';
let sortAsc = false;
let selectedAlliance = [null, null, null];
let editingEntryId = null;
let readOnly = false;

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
  _showLogoutBtn('View Only');
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

function _showLogoutBtn(label) {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.style.display = 'flex';
  const nameEl = btn.querySelector('.logout-user');
  if (nameEl) nameEl.textContent = label;
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
      entries
    };
  });
}

// ===========================
// RENDER TEAMS TABLE
// ===========================
let teamsData = [];
function renderTeams() {
  teamsData = aggregateTeams();
  const search = (document.getElementById('teamSearch')?.value||'').trim();
  let filtered = teamsData;
  if (search) filtered = filtered.filter(t=>String(t.teamNum).includes(search));
  filtered.sort((a,b)=>{
    const av=a[sortKey]??0, bv=b[sortKey]??0;
    return sortAsc ? av-bv : bv-av;
  });

  const tbody = document.getElementById('teamsBody');
  const empty = document.getElementById('teamsEmpty');
  tbody.innerHTML = '';

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

    const lastNote = t.entries.slice(-1)[0]?.notes || '—';

    const or = officialRankings[t.teamNum];
    const rankBadge = or
      ? `<div class="off-rank">#${or.rank} · ${or.wins}W-${or.losses}L</div>`
      : '';
    tr.innerHTML = `
      <td class="team-num">${t.teamNum}${rankBadge}</td>
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
      <td>${tags.join('')}</td>
      <td class="notes-cell">${lastNote}</td>
    `;
    tbody.appendChild(tr);
  });
  updateEntryCount();
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
  document.getElementById('modalTitle').textContent = `Team ${teamNum} — ${team.matches} Match${team.matches!==1?'es':''}`;
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
          <span>Match ${e.matchNum} — ${e.alliance||'?'} Alliance</span>
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

function deleteTeam(teamNum) {
  if (!confirm(`Delete ALL entries for team ${teamNum} at ${currentEvent}? This cannot be undone.`)) return;
  deleteTeamFromFirestore(teamNum, currentEvent)
    .then(() => {
      closeModal();
      showToast('Deleted team ' + teamNum);
      // onSnapshot will re-render tables automatically
    })
    .catch(() => showToast('⚠ Delete failed'));
}

// ===========================
// ALLIANCE PICKER
// ===========================
function renderAlliance() {
  const teams = aggregateTeams().sort((a,b)=>b.avgScore-a.avgScore);
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
  container.innerHTML = teams.slice(0,20).map((t,i)=>{
    const isSelected = selectedAlliance.includes(t.teamNum);
    const tags = [];
    if(t.hasStrFuelVolume) tags.push('HIGH FUEL');
    if(t.hasStrClimber) tags.push('CLIMBER');
    if(t.hasStrConsistentAuto) tags.push('AUTO');
    if(t.hasStrDefense) tags.push('DEFENSE');

    return `
      <div class="team-card ${isSelected?'selected':''}" onclick="toggleAlliancePick(${t.teamNum})">
        <div class="card-header">
          <div class="card-team-num">Team ${t.teamNum}</div>
          <div class="card-rank">#${i+1} seed</div>
        </div>
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
        </div>
        ${tags.map(tag=>`<span class="info-chip ${tag==='HIGH FUEL'||tag==='CLIMBER'?'lit':''}">${tag}</span>`).join('')}
        ${t.wkBroke?'<span class="info-chip" style="border-color:var(--red);color:var(--red);">UNRELIABLE</span>':''}
        ${t.gotCard?'<span class="info-chip" style="border-color:var(--red);color:var(--red);">CARDED</span>':''}
      </div>`;
  }).join('');

  updateAllianceSlots();
}

function toggleAlliancePick(teamNum) {
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
  if (!confirm('Delete ALL scouting data? This cannot be undone.')) return;
  clearAllEntriesFromFirestore(currentEvent)
    .then(() => {
      selectedAlliance = [null,null,null];
      showToast('All data cleared');
      // onSnapshot will re-render automatically
    })
    .catch(() => showToast('⚠ Clear failed'));
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
    _showLogoutBtn('View Only');
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
