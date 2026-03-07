// ===========================
// TEAM AUTOCOMPLETE
// ===========================
function teamAvatar(num) {
  return `https://www.thebluealliance.com/avatar/2026/frc${num}.png`;
}

let teamAcHighlight = -1;

function teamAcFilter() {
  const q = document.getElementById('teamAcInput').value.trim().toLowerCase();
  const dd = document.getElementById('teamDropdown');
  const roster = getEventRoster();
  const matches = q
    ? roster.filter(t => String(t.num).startsWith(q) || t.name.toLowerCase().includes(q))
    : roster;
  if (!matches.length) { dd.innerHTML = ''; dd.classList.remove('open'); return; }
  teamAcHighlight = -1;
  dd.innerHTML = matches.map(t => {
    const safeName = t.name.replace(/'/g, "\\'");
    return `<div class="team-dropdown-item" data-num="${t.num}" data-name="${t.name}"
        onmousedown="selectTeam(${t.num},'${safeName}')">
      <img class="team-dropdown-avatar" src="${teamAvatar(t.num)}" alt="" onerror="this.style.display='none'">
      <span class="team-dropdown-num">${t.num}</span>
      <span class="team-dropdown-name">${t.name}</span>
    </div>`;
  }).join('');
  dd.classList.add('open');
}

function teamAcKey(e) {
  const dd = document.getElementById('teamDropdown');
  const items = dd.querySelectorAll('.team-dropdown-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    teamAcHighlight = Math.min(teamAcHighlight + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('highlighted', i === teamAcHighlight));
    items[teamAcHighlight]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    teamAcHighlight = Math.max(teamAcHighlight - 1, 0);
    items.forEach((el, i) => el.classList.toggle('highlighted', i === teamAcHighlight));
    items[teamAcHighlight]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && teamAcHighlight >= 0) {
    e.preventDefault();
    const el = items[teamAcHighlight];
    selectTeam(parseInt(el.dataset.num), el.dataset.name);
  } else if (e.key === 'Escape') {
    dd.classList.remove('open');
  }
}

function selectTeam(num, name) {
  document.getElementById('teamNum').value = num;
  document.getElementById('teamAcInput').value = '';
  document.getElementById('teamDropdown').classList.remove('open');
  const avatar = document.getElementById('teamBadgeAvatar');
  avatar.src = teamAvatar(num);
  avatar.style.display = '';
  document.getElementById('teamBadgeNum').textContent = '#' + num;
  document.getElementById('teamBadgeName').textContent = name;
  document.getElementById('teamBadge').classList.add('visible');
  checkForExistingEntry();
}

function clearTeamSelection() {
  document.getElementById('teamNum').value = '';
  document.getElementById('teamAcInput').value = '';
  document.getElementById('teamDropdown').classList.remove('open');
  document.getElementById('teamBadge').classList.remove('visible');
  editingEntryId = null;
}

function checkForExistingEntry() {
  const teamNum = parseInt(document.getElementById('teamNum').value);
  const matchNum = parseInt(document.getElementById('matchNum').value);
  if (teamNum > 0 && matchNum > 0) loadExistingEntry(teamNum, matchNum);
}

function loadExistingEntry(teamNum, matchNum) {
  const data = getData();
  const existing = data.find(e => e.teamNum === teamNum && e.matchNum === matchNum && (e.event || 'NJWAS') === currentEvent);
  if (!existing) { editingEntryId = null; return; }

  editingEntryId = existing.id;

  // Restore numeric formState
  formState.autoFuel = existing.autoFuel || 0;
  formState.teleopFuel = existing.teleopFuel || 0;
  formState.fuelMissed = existing.fuelMissed || 0;
  formState.autoTower = existing.autoTower || 0;
  formState.teleopTower = existing.teleopTower || 0;
  formState.driving = existing.driving || 0;
  formState.defense = existing.defense || 0;
  formState.reliability = existing.reliability || 0;

  // Restore boolean formState
  ['autoMoved','hubAware','scoredInactive','srcDepot','srcOutpost','srcNeutral',
   'climbFast','climbFailed','climbAssisted','playedDefense','wasPinned','pinnedOpponent','gotCard',
   'strFuelVolume','strClimber','strConsistentAuto','strDefense','strHubAware','strIntake',
   'wkScoredWrong','wkBroke','wkSlowIntake','wkNoClimb','wkLooseFuel'
  ].forEach(k => { formState[k] = !!existing[k]; });

  // Update counter displays
  ['autoFuel','teleopFuel','fuelMissed'].forEach(k => {
    const el = document.getElementById(k + '-display');
    if (el) el.value = formState[k];
  });

  // Tower selectors
  setTower('autoTower', formState.autoTower);
  setTower('teleopTower', formState.teleopTower);

  // Ratings
  setRating('driving', formState.driving);
  setRating('defense', formState.defense);
  setRating('reliability', formState.reliability);

  // Chips
  const orangeKeys = new Set(['scoredInactive','climbFailed','playedDefense','wasPinned',
    'pinnedOpponent','gotCard','wkScoredWrong','wkBroke','wkSlowIntake','wkNoClimb','wkLooseFuel']);
  document.querySelectorAll('.toggle-chip[data-key]').forEach(chip => {
    const key = chip.dataset.key;
    chip.classList.remove('active', 'active-orange');
    if (formState[key]) chip.classList.add(orangeKeys.has(key) ? 'active-orange' : 'active');
  });

  // Text fields
  const autoStratEl = document.getElementById('autoStrategy');
  if (autoStratEl) autoStratEl.value = existing.autoStrategy || '';
  const notesEl = document.getElementById('freeNotes');
  if (notesEl) notesEl.value = existing.notes || '';

  // Alliance color (only if not already set by scoutFromSchedule)
  if (existing.alliance && !document.getElementById('allianceColor').value) {
    document.getElementById('allianceColor').value = existing.alliance;
    setAllianceColor(existing.alliance);
  }

  updatePreview();
  showToast(`↩ Loaded existing entry — Team ${teamNum} Match ${matchNum}`);
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.team-ac-wrap')) {
    document.getElementById('teamDropdown')?.classList.remove('open');
  }
});

// ===========================
// FORM STATE
// ===========================
let formState = {
  autoFuel: 0,
  teleopFuel: 0,
  fuelMissed: 0,
  autoTower: 0,
  teleopTower: 0,
  driving: 0,
  defense: 0,
  reliability: 0,
  autoMoved: false, hubAware: false, scoredInactive: false,
  srcDepot: false, srcOutpost: false, srcNeutral: false,
  climbFast: false, climbFailed: false, climbAssisted: false,
  playedDefense: false, wasPinned: false, pinnedOpponent: false, gotCard: false,
  strFuelVolume: false, strClimber: false, strConsistentAuto: false,
  strDefense: false, strHubAware: false, strIntake: false,
  wkScoredWrong: false, wkBroke: false, wkSlowIntake: false,
  wkNoClimb: false, wkLooseFuel: false,
  autoStrategy: ''
};

// ===========================
// FORM INTERACTIONS
// ===========================
function setAllianceColor(val) {
  const view = document.getElementById('view-scout');
  view.classList.remove('alliance-red', 'alliance-blue');
  if (val === 'Red') view.classList.add('alliance-red');
  else if (val === 'Blue') view.classList.add('alliance-blue');
}

function adjust(key, delta) {
  formState[key] = Math.min(999, Math.max(0, (formState[key] || 0) + delta));
  const el = document.getElementById(key + '-display');
  el.value = formState[key];
  el.classList.remove('counter-flash-green', 'counter-flash-red');
  void el.offsetWidth; // restart animation if clicked rapidly
  el.classList.add(delta > 0 ? 'counter-flash-green' : 'counter-flash-red');
  updatePreview();
}

function setCounter(key, input) {
  const v = parseInt(input.value, 10);
  formState[key] = isNaN(v) ? 0 : Math.min(999, Math.max(0, v));
  updatePreview();
}

function setTower(key, val) {
  formState[key] = val;
  const max = key === 'autoTower' ? 1 : 3;
  for (let i = 0; i <= max; i++) {
    const el = document.getElementById(key + '-' + i);
    if (el) el.classList.toggle('active', i === val);
  }
  updatePreview();
}

function toggleChip(el, key) {
  formState[key] = !formState[key];
  el.classList.toggle('active', formState[key]);
}
function toggleChipOrange(el, key) {
  formState[key] = !formState[key];
  el.classList.toggle('active-orange', formState[key]);
}

function setRating(key, val) {
  formState[key] = val;
  const btns = document.querySelectorAll(`#rating-${key} .rating-btn`);
  btns.forEach((b, i) => {
    b.className = 'rating-btn';
    if (i + 1 <= val) b.classList.add(`active-${i+1}`);
  });
}

function updatePreview() {
  const towerPts = { 0:0, 1:10, 2:20, 3:30 };
  const autoTowerPts = formState.autoTower === 1 ? 15 : 0;
  const af = formState.autoFuel || 0;
  const tf = formState.teleopFuel || 0;
  const tt = towerPts[formState.teleopTower || 0];
  const total = af + tf + autoTowerPts + tt;
  document.getElementById('prev-autoFuel').textContent = af;
  document.getElementById('prev-autoTower').textContent = autoTowerPts;
  document.getElementById('prev-teleopFuel').textContent = tf;
  document.getElementById('prev-teleopTower').textContent = tt;
  document.getElementById('prev-total').textContent = total;
}

function resetForm() {
  formState = {
    autoFuel:0, teleopFuel:0, fuelMissed:0, autoTower:0, teleopTower:0,
    driving:0, defense:0, reliability:0,
    autoMoved:false, hubAware:false, scoredInactive:false,
    srcDepot:false, srcOutpost:false, srcNeutral:false,
    climbFast:false, climbFailed:false, climbAssisted:false,
    playedDefense:false, wasPinned:false, pinnedOpponent:false, gotCard:false,
    strFuelVolume:false, strClimber:false, strConsistentAuto:false,
    strDefense:false, strHubAware:false, strIntake:false,
    wkScoredWrong:false, wkBroke:false, wkSlowIntake:false,
    wkNoClimb:false, wkLooseFuel:false,
    autoStrategy:''
  };
  // Reset counters
  ['autoFuel','teleopFuel','fuelMissed'].forEach(k => {
    document.getElementById(k+'-display').value = 0;
  });
  // Reset tower buttons
  [0,1].forEach(i => { const el=document.getElementById('autoTower-'+i); if(el){el.classList.remove('active');}});
  document.getElementById('autoTower-0').classList.add('active');
  [0,1,2,3].forEach(i => { const el=document.getElementById('teleopTower-'+i); if(el){el.classList.remove('active');}});
  document.getElementById('teleopTower-0').classList.add('active');
  // Reset ratings
  ['driving','defense','reliability'].forEach(k => {
    document.querySelectorAll(`#rating-${k} .rating-btn`).forEach(b => b.className='rating-btn');
  });
  // Reset chips
  document.querySelectorAll('.toggle-chip').forEach(c => { c.classList.remove('active','active-orange'); });
  // Reset inputs
  clearTeamSelection();
  ['matchNum','freeNotes'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('allianceColor').value = '';
  setAllianceColor('');
  document.getElementById('autoStrategy').value = '';
  editingEntryId = null;
  updatePreview();
}

// ===========================
// SUBMIT
// ===========================
function submitEntry() {
  if (readOnly) { showToast('⚠ Read-only mode — login to save entries'); return; }
  const teamNum = parseInt(document.getElementById('teamNum').value);
  const matchNum = parseInt(document.getElementById('matchNum').value);
  if (!teamNum || teamNum < 1) { showToast('⚠ Enter a valid team number'); return; }
  if (!matchNum || matchNum < 1) { showToast('⚠ Enter a match number'); return; }

  const towerPts = { 0:0, 1:10, 2:20, 3:30 };
  const autoTowerPts = formState.autoTower === 1 ? 15 : 0;
  const score = (formState.autoFuel||0) + (formState.teleopFuel||0) + autoTowerPts + (towerPts[formState.teleopTower||0]);

  const entry = {
    id: Date.now(),
    event: currentEvent,
    teamNum,
    matchNum,
    alliance: document.getElementById('allianceColor').value,
    scout: document.getElementById('scoutName').value,
    autoFuel: formState.autoFuel||0,
    teleopFuel: formState.teleopFuel||0,
    fuelMissed: formState.fuelMissed||0,
    autoTower: formState.autoTower||0,
    teleopTower: formState.teleopTower||0,
    driving: formState.driving||0,
    defense: formState.defense||0,
    reliability: formState.reliability||0,
    autoMoved: formState.autoMoved,
    hubAware: formState.hubAware,
    scoredInactive: formState.scoredInactive,
    srcDepot: formState.srcDepot,
    srcOutpost: formState.srcOutpost,
    srcNeutral: formState.srcNeutral,
    climbFast: formState.climbFast,
    climbFailed: formState.climbFailed,
    climbAssisted: formState.climbAssisted,
    playedDefense: formState.playedDefense,
    wasPinned: formState.wasPinned,
    pinnedOpponent: formState.pinnedOpponent,
    gotCard: formState.gotCard,
    strFuelVolume: formState.strFuelVolume,
    strClimber: formState.strClimber,
    strConsistentAuto: formState.strConsistentAuto,
    strDefense: formState.strDefense,
    strHubAware: formState.strHubAware,
    strIntake: formState.strIntake,
    wkScoredWrong: formState.wkScoredWrong,
    wkBroke: formState.wkBroke,
    wkSlowIntake: formState.wkSlowIntake,
    wkNoClimb: formState.wkNoClimb,
    wkLooseFuel: formState.wkLooseFuel,
    autoStrategy: document.getElementById('autoStrategy').value,
    notes: document.getElementById('freeNotes').value,
    score,
    timestamp: new Date().toISOString()
  };

  const data = getData();
  const existingIdx = data.findIndex(e => e.teamNum === teamNum && e.matchNum === matchNum && (e.event || 'NJWAS') === currentEvent);
  if (existingIdx >= 0) {
    entry.id = data[existingIdx].id; // preserve original id
    data[existingIdx] = entry;
  } else {
    data.push(entry);
  }
  saveData(data);
  editingEntryId = null;
  updateEntryCount();
  showToast(existingIdx >= 0 ? `✓ Entry updated — Team ${teamNum} Match ${matchNum}` : '✓ Entry saved — Team ' + teamNum);
  resetForm();
}
