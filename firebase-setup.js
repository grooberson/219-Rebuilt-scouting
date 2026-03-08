// ===========================
// FIREBASE SETUP
// ===========================
// FIRESTORE SECURITY RULES (paste into Firebase Console → Firestore → Rules):
//
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /scout_entries/{entryId} {
//         allow read: if true;
//         allow write: if request.auth != null;
//       }
//       match /alliance_state/{eventCode} {
//         allow read: if true;
//         allow write: if request.auth != null;
//       }
//     }
//   }
//
const firebaseConfig = {
  apiKey:            "AIzaSyDSAJ6E3NEHCwsoQVRgzDdX168W3lDz_R8",
  authDomain:        "rebuilt-scouting-db.firebaseapp.com",
  projectId:         "rebuilt-scouting-db",
  storageBucket:     "rebuilt-scouting-db.firebasestorage.app",
  messagingSenderId: "573466431782",
  appId:             "1:573466431782:web:b76db94f91be5bd154b1e7"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Offline persistence — lets scouts keep scouting even with spotty venue WiFi.
// Changes sync automatically when connectivity is restored.
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
    console.warn('Firestore persistence error:', err);
  }
});

// Sign in anonymously so Firestore security rules can require auth on writes
auth.signInAnonymously().catch(e => console.warn('Firebase auth error:', e));

// ===========================
// TEST MODE
// ===========================
// In test mode all reads/writes go to localStorage instead of Firestore.
// Live Firestore data is never touched.
let _testMode = false;
const _TEST_KEY = 'rebuilt_scout_test';

function _getTestData() {
  try { return JSON.parse(localStorage.getItem(_TEST_KEY) || '[]'); } catch { return []; }
}
function _saveTestData(data) {
  localStorage.setItem(_TEST_KEY, JSON.stringify(data));
}
function _rerenderAll() {
  if (typeof renderTeams === 'function') renderTeams();
  if (typeof renderAlliance === 'function') renderAlliance();
  if (typeof updateEntryCount === 'function') updateEntryCount();
}

function activateTestMode() {
  _testMode = true;
  sessionStorage.setItem('rebuilt_testMode', '1');
  _updateDbStatus('TEST MODE — LOCAL ONLY', 'background:#e8a000');
  if (typeof applyAllianceState === 'function') {
    applyAllianceState({ takenByAlliance: _getTestAllianceData(currentEvent) });
  }
  _rerenderAll();
}

// ===========================
// IN-MEMORY CACHE + getData()
// ===========================
// In live mode: Firestore cache kept current by onSnapshot.
// In test mode: reads directly from localStorage each call.
let _entriesCache = [];

function getData() {
  if (_testMode) return _getTestData();
  return _entriesCache;
}

// ===========================
// REAL-TIME LISTENER
// ===========================
function _updateDbStatus(text, dotStyle) {
  const el = document.getElementById('dbStatus');
  if (!el) return;
  const styleAttr = dotStyle ? `style="${dotStyle}"` : '';
  el.innerHTML = `<span class="status-dot" ${styleAttr}></span>${text}`;
}

db.collection('scout_entries').onSnapshot(snapshot => {
  if (_testMode) return; // ignore Firestore updates while in test mode
  _entriesCache = snapshot.docs.map(d => d.data());
  _updateDbStatus('FIRESTORE LIVE', '');
  _rerenderAll();
}, err => {
  if (_testMode) return;
  console.warn('Firestore listener error:', err);
  _updateDbStatus('FIRESTORE ERROR', 'background:var(--text-dim)');
});

// ===========================
// WRITE HELPERS
// All functions branch on _testMode — test mode uses localStorage,
// live mode uses Firestore. Callers don't need to know which.
// ===========================

async function saveEntryToFirestore(entry) {
  if (_testMode) {
    const data = _getTestData();
    const idx = data.findIndex(e => e.id === entry.id);
    if (idx >= 0) data[idx] = entry; else data.push(entry);
    _saveTestData(data);
    _rerenderAll();
    return;
  }
  await db.collection('scout_entries').doc(String(entry.id)).set(entry);
}

async function deleteEntryFromFirestore(entryId) {
  if (_testMode) {
    _saveTestData(_getTestData().filter(e => e.id !== entryId));
    _rerenderAll();
    return;
  }
  await db.collection('scout_entries').doc(String(entryId)).delete();
}

async function deleteTeamFromFirestore(teamNum, event) {
  if (_testMode) {
    _saveTestData(_getTestData().filter(e => !(e.teamNum === teamNum && (e.event || 'NJWAS') === event)));
    _rerenderAll();
    return;
  }
  const snap = await db.collection('scout_entries')
    .where('teamNum', '==', teamNum)
    .where('event', '==', event)
    .get();
  if (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

async function clearAllEntriesFromFirestore(event) {
  if (_testMode) {
    _saveTestData(_getTestData().filter(e => (e.event || 'NJWAS') !== event));
    _rerenderAll();
    return;
  }
  const snap = await db.collection('scout_entries')
    .where('event', '==', event)
    .get();
  if (!snap.empty) {
    for (let i = 0; i < snap.docs.length; i += 500) {
      const batch = db.batch();
      snap.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

async function batchImportToFirestore(entries) {
  if (_testMode) {
    const existingIds = new Set(_getTestData().map(e => e.id));
    const newEntries = entries.filter(e => e.teamNum && e.matchNum && !existingIds.has(e.id));
    if (!newEntries.length) return 0;
    newEntries.forEach(e => { if (!e.event) e.event = 'NJWAS'; });
    _saveTestData([..._getTestData(), ...newEntries]);
    _rerenderAll();
    return newEntries.length;
  }
  const existingIds = new Set(_entriesCache.map(e => e.id));
  const newEntries = entries.filter(e => e.teamNum && e.matchNum && !existingIds.has(e.id));
  if (!newEntries.length) return 0;
  for (let i = 0; i < newEntries.length; i += 500) {
    const batch = db.batch();
    newEntries.slice(i, i + 500).forEach(e => {
      if (!e.event) e.event = 'NJWAS';
      batch.set(db.collection('scout_entries').doc(String(e.id)), e);
    });
    await batch.commit();
  }
  return newEntries.length;
}

// ===========================
// ALLIANCE STATE (shared, real-time)
// Stored as alliance_state/{eventCode} → { takenByAlliance: { "teamNum": allianceNum, ... } }
// ===========================
let _allianceUnsubscribe = null;

function _getTestAllianceData(eventCode) {
  try {
    const stored = JSON.parse(localStorage.getItem('rebuilt_alliance_' + eventCode) || '{}');
    // Handle legacy format where only takenByAlliance was stored directly
    if (stored && !stored.takenByAlliance) return { takenByAlliance: stored };
    return stored;
  } catch { return {}; }
}

function _subscribeAllianceState(eventCode) {
  if (_allianceUnsubscribe) { _allianceUnsubscribe(); _allianceUnsubscribe = null; }
  if (_testMode) {
    if (typeof applyAllianceState === 'function') {
      applyAllianceState(_getTestAllianceData(eventCode));
    }
    return;
  }
  _allianceUnsubscribe = db.collection('alliance_state').doc(eventCode).onSnapshot(snap => {
    if (_testMode) return;
    if (typeof applyAllianceState === 'function') {
      applyAllianceState(snap.exists ? snap.data() : {});
    }
  }, err => {
    console.warn('Alliance state listener error:', err);
  });
}

async function saveAllianceState(eventCode, takenMap, ranksMap = {}) {
  if (_testMode) {
    localStorage.setItem('rebuilt_alliance_' + eventCode, JSON.stringify({ takenByAlliance: takenMap, preferredRanks: ranksMap }));
    return;
  }
  await db.collection('alliance_state').doc(eventCode).set({ takenByAlliance: takenMap, preferredRanks: ranksMap });
}

async function clearAllianceState(eventCode) {
  if (_testMode) {
    localStorage.removeItem('rebuilt_alliance_' + eventCode);
    return;
  }
  await db.collection('alliance_state').doc(eventCode).delete();
}

// Start listening for the initial event
_subscribeAllianceState(currentEvent);
