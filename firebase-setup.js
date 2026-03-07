// ===========================
// FIREBASE SETUP
// ===========================
// Replace these placeholder values with your Firebase project config.
// Find it at: Firebase Console → Project Settings → Your Apps → SDK setup and configuration
//
// FIRESTORE SECURITY RULES (paste into Firebase Console → Firestore → Rules):
//
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /scout_entries/{entryId} {
//         allow read: true;
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
// IN-MEMORY CACHE + getData()
// ===========================
// All reads go through this cache. onSnapshot keeps it current in real time.
let _entriesCache = [];

function getData() {
  return _entriesCache;
}

// ===========================
// REAL-TIME LISTENER
// ===========================
function _updateDbStatus(text, connected) {
  const el = document.getElementById('dbStatus');
  if (!el) return;
  const dotStyle = connected ? '' : 'style="background:var(--text-dim)"';
  el.innerHTML = `<span class="status-dot" ${dotStyle}></span>${text}`;
}

db.collection('scout_entries').onSnapshot(snapshot => {
  _entriesCache = snapshot.docs.map(d => d.data());
  _updateDbStatus('FIRESTORE LIVE', true);
  if (typeof renderTeams === 'function') renderTeams();
  if (typeof renderAlliance === 'function') renderAlliance();
  if (typeof updateEntryCount === 'function') updateEntryCount();
}, err => {
  console.warn('Firestore listener error:', err);
  _updateDbStatus('FIRESTORE ERROR', false);
});

// ===========================
// FIRESTORE WRITE HELPERS
// ===========================
async function saveEntryToFirestore(entry) {
  await db.collection('scout_entries').doc(String(entry.id)).set(entry);
}

async function deleteEntryFromFirestore(entryId) {
  await db.collection('scout_entries').doc(String(entryId)).delete();
}

async function deleteTeamFromFirestore(teamNum, event) {
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
  const existingIds = new Set(_entriesCache.map(e => e.id));
  const newEntries = entries.filter(e => e.teamNum && e.matchNum && !existingIds.has(e.id));
  if (!newEntries.length) return 0;
  for (let i = 0; i < newEntries.length; i += 500) {
    const batch = db.batch();
    newEntries.slice(i, i + 500).forEach(e => {
      if (!e.event) e.event = 'NJWAS'; // default for old localStorage exports
      batch.set(db.collection('scout_entries').doc(String(e.id)), e);
    });
    await batch.commit();
  }
  return newEntries.length;
}
