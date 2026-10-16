/**
 * Firebase Realtime Database & Firestore Integration & Session Store
 * Official Firebase Web SDK integration configured for project: varuags
 * Saves simulation telemetry, session runs, and benchmark comparisons to the cloud.
 */

const FirebaseConfig = {
  apiKey: "AIzaSyAVlPUgycOIF7dAG-KE0xU_7BQMc7qu05Q",
  authDomain: "varuags.firebaseapp.com",
  projectId: "varuags",
  storageBucket: "varuags.firebasestorage.app",
  messagingSenderId: "1045017841785",
  appId: "1:1045017841785:web:abc029101633ccba6244a8",
  measurementId: "G-0VE2SW7FYT",
  databaseURL: "https://varuags-default-rtdb.firebaseio.com"
};

class FirebaseManager {
  constructor() {
    this.app = null;
    this.rtdb = null;
    this.firestore = null;
    this.isCloudConnected = false;
    this.cloudProvider = 'Local Fallback';
    this.sessionsCache = [];
    this.listeners = [];
    this.localStorageKey = 'smart_traffic_simulation_sessions';
    this.configStorageKey = 'smart_traffic_firebase_config';

    this.init();
  }

  init() {
    // 1. Check if user previously saved custom config in localStorage
    const savedConfig = localStorage.getItem(this.configStorageKey);
    let activeConfig = FirebaseConfig;
    if (savedConfig) {
      try {
        activeConfig = { ...FirebaseConfig, ...JSON.parse(savedConfig) };
      } catch (e) {
        console.warn('Failed to parse saved Firebase config:', e);
      }
    }

    // 2. Load cached local sessions
    this.loadLocalSessions();

    // 3. Connect to Firebase Cloud
    if (typeof firebase !== 'undefined' && activeConfig.apiKey) {
      this.connectFirebase(activeConfig);
    } else {
      this.isCloudConnected = false;
      this.updateUIStatus('Local Storage Mode', false);
    }
  }

  connectFirebase(config) {
    try {
      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(config);
      } else {
        this.app = firebase.app();
      }

      let connectedServices = [];

      // 1. Connect Firestore
      if (typeof firebase.firestore === 'function') {
        try {
          this.firestore = firebase.firestore();
          connectedServices.push('Firestore');
          this.startFirestoreListener();
        } catch (e) {
          console.warn('Firestore initialization notice:', e.message);
        }
      }

      // 2. Connect Realtime Database
      if (typeof firebase.database === 'function') {
        try {
          this.rtdb = firebase.database();
          connectedServices.push('Realtime DB');
          this.startRtdbListener();
        } catch (e) {
          console.warn('Realtime Database initialization notice:', e.message);
        }
      }

      if (connectedServices.length > 0) {
        this.isCloudConnected = true;
        this.cloudProvider = connectedServices.join(' & ');
        this.updateUIStatus(`Firebase Connected (${this.cloudProvider})`, true);
        console.log(`Firebase connected successfully for project [${config.projectId}] via ${this.cloudProvider}.`);
      } else {
        this.isCloudConnected = false;
        this.updateUIStatus('Local Storage Mode', false);
      }
    } catch (err) {
      console.warn('Firebase init exception: Using local storage cache.', err.message);
      this.isCloudConnected = false;
      this.updateUIStatus('Local Storage (Cloud Offline)', false);
    }
  }

  updateConfig(newConfig) {
    localStorage.setItem(this.configStorageKey, JSON.stringify(newConfig));
    this.connectFirebase(newConfig);
  }

  getConfig() {
    const saved = localStorage.getItem(this.configStorageKey);
    if (saved) {
      try { return { ...FirebaseConfig, ...JSON.parse(saved) }; } catch (e) {}
    }
    return FirebaseConfig;
  }

  loadLocalSessions() {
    try {
      const raw = localStorage.getItem(this.localStorageKey);
      if (raw) {
        this.sessionsCache = JSON.parse(raw);
      }
    } catch (e) {
      this.sessionsCache = [];
    }
  }

  saveLocalSessions() {
    try {
      localStorage.setItem(this.localStorageKey, JSON.stringify(this.sessionsCache));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  startRtdbListener() {
    if (!this.rtdb) return;
    try {
      const ref = this.rtdb.ref('simulation_sessions').limitToLast(30);
      ref.on('value', (snapshot) => {
        const val = snapshot.val();
        if (val) {
          const cloudList = Object.keys(val).map(key => ({
            id: key,
            ...val[key]
          }));
          cloudList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          this.mergeSessions(cloudList);
        }
      }, (error) => {
        console.warn('RTDB realtime listener error:', error.message);
      });
    } catch (e) {
      console.warn('RTDB listener setup error:', e);
    }
  }

  startFirestoreListener() {
    if (!this.firestore) return;
    try {
      this.firestore.collection('simulation_sessions')
        .orderBy('timestamp', 'desc')
        .limit(30)
        .onSnapshot((snapshot) => {
          if (!snapshot.empty) {
            const list = [];
            snapshot.forEach(doc => {
              list.push({ id: doc.id, ...doc.data() });
            });
            this.mergeSessions(list);
          }
        }, (error) => {
          console.warn('Firestore onSnapshot listener error (rules may require write):', error.message);
        });
    } catch (e) {
      console.warn('Firestore listener setup error:', e);
    }
  }

  mergeSessions(cloudList) {
    const map = new Map();
    // Insert local cached first
    this.sessionsCache.forEach(s => map.set(s.id, s));
    // Overwrite/Add cloud sessions
    cloudList.forEach(s => map.set(s.id, s));

    const merged = Array.from(map.values());
    merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    this.sessionsCache = merged.slice(0, 50);
    this.saveLocalSessions();
    this.notifyListeners();
  }

  /**
   * Save a completed simulation session
   * @param {Object} sessionData
   */
  async saveSession(sessionData) {
    const session = {
      ...sessionData,
      id: sessionData.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      savedAt: new Date().toLocaleTimeString(),
      source: this.isCloudConnected ? `Firebase Cloud (${this.cloudProvider})` : 'Local Storage'
    };

    // Keep in local cache
    this.sessionsCache.unshift(session);
    if (this.sessionsCache.length > 50) this.sessionsCache.pop();
    this.saveLocalSessions();
    this.notifyListeners();

    let savedTargets = [];

    // 1. Push to Realtime Database
    if (this.rtdb) {
      try {
        await this.rtdb.ref(`simulation_sessions/${session.id}`).set(session);
        savedTargets.push('Realtime DB');
      } catch (err) {
        console.warn('Realtime Database push notice:', err.message);
      }
    }

    // 2. Push to Firestore
    if (this.firestore) {
      try {
        await this.firestore.collection('simulation_sessions').doc(session.id).set(session);
        savedTargets.push('Firestore');
      } catch (err) {
        console.warn('Firestore push notice:', err.message);
      }
    }

    if (savedTargets.length > 0) {
      console.log(`Session successfully saved to Firebase (${savedTargets.join(', ')}):`, session.id);
      return { success: true, target: savedTargets.join(' & ') };
    }

    return { success: true, target: 'Local Storage Fallback' };
  }

  getSessions() {
    return this.sessionsCache;
  }

  clearHistory() {
    this.sessionsCache = [];
    localStorage.removeItem(this.localStorageKey);

    if (this.rtdb) {
      try { this.rtdb.ref('simulation_sessions').remove(); } catch (e) {}
    }
    this.notifyListeners();
  }

  exportJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.sessionsCache, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `traffic_sim_sessions_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  onSessionsUpdate(callback) {
    this.listeners.push(callback);
    callback(this.sessionsCache);
  }

  notifyListeners() {
    this.listeners.forEach(cb => {
      try { cb(this.sessionsCache); } catch (e) {}
    });
  }

  updateUIStatus(statusText, isConnected) {
    const pill = document.getElementById('firebaseStatusPill');
    const textSpan = document.getElementById('firebaseStatusText');
    const modalStatus = document.getElementById('fbStatusSpan');

    if (pill) {
      if (isConnected) {
        pill.classList.add('connected');
      } else {
        pill.classList.remove('connected');
      }
    }
    if (textSpan) {
      textSpan.textContent = isConnected ? 'Firebase: varuags (Connected)' : 'Firebase: Local Mode';
    }
    if (modalStatus) {
      modalStatus.textContent = statusText;
    }
  }
}

// Global Firebase instance
window.firebaseManager = new FirebaseManager();
