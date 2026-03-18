// ===========================
// STATBOTICS API INTEGRATION
// Base URL: https://api.statbotics.io/v3/
// No auth required. Data is 2026 season.
// ===========================

const STATBOTICS_BASE = 'https://api.statbotics.io/v3';

// Cache keyed by "{eventCode}_{teamNum}" so switching events doesn't
// serve stale data, but switching back avoids re-fetching.
const statboticsCache = {};
let statboticsLoadedEvent = null;
let statboticsLoading = false;

// ===========================
// LOAD ALL TEAMS FOR EVENT
// ===========================
async function loadStatboticsData(eventCode) {
  if (statboticsLoading) return;
  if (statboticsLoadedEvent === eventCode) return; // already cached

  statboticsLoading = true;
  const roster = (typeof EVENT_ROSTERS !== 'undefined' && EVENT_ROSTERS[eventCode]) || [];
  if (!roster.length) { statboticsLoading = false; return; }

  const results = await Promise.allSettled(
    roster.map(({ num }) =>
      fetch(`${STATBOTICS_BASE}/team_year/${num}/2026`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  );

  roster.forEach(({ num }, i) => {
    const result = results[i];
    const data = result.status === 'fulfilled' ? result.value : null;
    statboticsCache[`${eventCode}_${num}`] = data;
  });

  statboticsLoadedEvent = eventCode;
  statboticsLoading = false;

  // Refresh the teams table now that data has arrived
  if (typeof renderTeams === 'function') renderTeams();
}

// ===========================
// ACCESSORS
// ===========================

// Returns the full Statbotics team_year object, or null if not loaded / not found.
function getStatbotics(teamNum) {
  const key = `${statboticsLoadedEvent}_${teamNum}`;
  return statboticsCache[key] ?? null;
}

// Invalidate cache for a given event (called on event switch)
function clearStatboticsCache(eventCode) {
  statboticsLoadedEvent = null;
  statboticsLoading = false;
  // Leave the keyed entries in place so switching back is instant
}

// ===========================
// DISPLAY HELPERS
// ===========================

// Color-code EPA mean by tier (2026 calibration)
function epaColor(mean) {
  if (mean == null) return 'var(--text-dim)';
  if (mean >= 70) return 'var(--accent3)';   // elite — green
  if (mean >= 50) return 'var(--accent)';    // strong — cyan
  if (mean >= 35) return 'var(--text)';      // average — white
  return 'var(--text-dim)';                  // below average — dim
}

// Format a 0–1 percentile into "83rd %ile" etc.
function formatPercentile(p) {
  if (p == null) return '';
  const pct = Math.round(p * 100);
  const suffix = pct === 11 || pct === 12 || pct === 13 ? 'th'
    : pct % 10 === 1 ? 'st'
    : pct % 10 === 2 ? 'nd'
    : pct % 10 === 3 ? 'rd' : 'th';
  return `${pct}${suffix} %ile`;
}

// Clamp RP probability to 0–1 and format as a percentage string
function formatRpProb(val) {
  if (val == null) return '—';
  const clamped = Math.max(0, Math.min(1, val));
  return Math.round(clamped * 100) + '%';
}

// Width (0–100) for an EPA bar, relative to a max expected value
function epaBarWidth(val, max) {
  if (!val || !max) return 0;
  return Math.min(100, Math.round((val / max) * 100));
}

// Render the full Statbotics section HTML for the team detail modal
function renderStatboticsModalSection(teamNum) {
  const d = getStatbotics(teamNum);
  if (!d) return '';

  const epa = d.epa || {};
  const bp  = epa.breakdown || {};
  const ranks = epa.ranks || {};
  const rec = d.record || {};

  const mean      = epa.total_points?.mean;
  const sd        = epa.total_points?.sd;
  const autoEpa   = bp.auto_points ?? 0;
  const telEpa    = bp.teleop_points ?? 0;
  const endEpa    = bp.endgame_points ?? 0;
  const totalEpa  = mean ?? (autoEpa + telEpa + endEpa);
  const maxBar    = Math.max(totalEpa, 1);

  const natRank   = ranks.total?.rank;
  const natPct    = ranks.total?.percentile;
  const stateRank = ranks.state?.rank;
  const statePct  = ranks.state?.percentile;
  const distRank  = ranks.district?.rank;
  const distPct   = ranks.district?.percentile;

  const winRate   = rec.winrate != null ? Math.round(rec.winrate * 100) + '%' : '—';
  const wl        = (rec.wins != null) ? `${rec.wins}W – ${rec.losses}L` : '';

  const energRp   = Math.max(0, Math.min(1, bp.energized_rp  ?? 0));
  const superRp   = Math.max(0, Math.min(1, bp.supercharged_rp ?? 0));
  const travRp    = Math.max(0, Math.min(1, bp.traversal_rp   ?? 0));

  const rpBar = (val) => `
    <div class="rp-prob-track">
      <div class="rp-prob-fill" style="width:${Math.round(val*100)}%;background:${val>=0.5?'var(--accent3)':val>=0.25?'var(--accent)':'var(--text-dim)'};"></div>
    </div>`;

  const epaBarRow = (label, val, color) => `
    <div class="epa-bar-row">
      <span class="epa-bar-label">${label}</span>
      <div class="epa-bar-track">
        <div class="epa-bar-fill" style="width:${epaBarWidth(val, maxBar)}%;background:${color};"></div>
      </div>
      <span class="epa-bar-val" style="color:${color};">${val != null ? val.toFixed(1) : '—'}</span>
    </div>`;

  const badge = (text, pct) => `
    <div class="rank-badge">
      <span class="rank-badge-val">${text}</span>
      ${pct != null ? `<span class="rank-badge-pct">${formatPercentile(pct)}</span>` : ''}
    </div>`;

  return `
    <div class="statbotics-panel">
      <div class="statbotics-panel-header">
        <span class="statbotics-label">◈ STATBOTICS · 2026</span>
        <span class="statbotics-epa-total" style="color:${epaColor(mean)};">
          ${mean != null ? mean.toFixed(1) + ' EPA' : '—'}
          ${sd != null ? `<span class="epa-sd">±${sd.toFixed(1)}</span>` : ''}
        </span>
      </div>

      <div class="stat-rank-badges">
        ${natRank   != null ? badge(`#${natRank} Nationally`, natPct)        : ''}
        ${stateRank != null ? badge(`#${stateRank} in ${d.state || 'State'}`, statePct) : ''}
        ${distRank  != null ? badge(`#${distRank} in ${(d.district || 'dist').toUpperCase()}`, distPct) : ''}
      </div>

      ${wl ? `<div class="stat-winrate">${wl} &nbsp;·&nbsp; ${winRate} win rate</div>` : ''}

      <div class="epa-breakdown">
        <div class="epa-breakdown-title">EPA Breakdown</div>
        ${epaBarRow('Auto',    autoEpa, 'var(--accent)')}
        ${epaBarRow('Teleop',  telEpa,  'var(--accent3)')}
        ${epaBarRow('Endgame', endEpa,  'var(--accent2)')}
      </div>

      <div class="rp-prob-section">
        <div class="epa-breakdown-title">RP Probability</div>
        <div class="rp-prob-row">
          <div class="rp-prob-item">
            <span class="rp-prob-name">⚡ Energized</span>
            ${rpBar(energRp)}
            <span class="rp-prob-pct">${formatRpProb(energRp)}</span>
          </div>
          <div class="rp-prob-item">
            <span class="rp-prob-name">⚡⚡ Supercharged</span>
            ${rpBar(superRp)}
            <span class="rp-prob-pct">${formatRpProb(superRp)}</span>
          </div>
          <div class="rp-prob-item">
            <span class="rp-prob-name">🗼 Traversal</span>
            ${rpBar(travRp)}
            <span class="rp-prob-pct">${formatRpProb(travRp)}</span>
          </div>
        </div>
      </div>
    </div>`;
}
