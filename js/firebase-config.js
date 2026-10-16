/**
 * Firebase Realtime Database Integration & Session Store
 * Official Firebase Web SDK integration with seamless LocalStorage fallback.
 * Stores simulation telemetry, session runs, and benchmark comparisons.
 */

const FirebaseConfig = {
  // Default / Placeholder configuration.
  // Users or judges can input their own config via the UI modal or localStorage.
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "smart-traffic-junction",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

class FirebaseManager {
  constructor() {
    this.app = null;
    this.db = null;
    this.isCloudConnected = false;
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

    // 3. Attempt initialization if databaseURL or apiKey is provided
    if (activeConfig.databaseURL && typeof firebase !== 'undefined') {
      this.connectFirebase(activeConfig);
    } else {
      this.isCloudConnected = false;
      this.updateUIStatus('Local Storage Mode (Standby)', false);
    }
  }

  connectFirebase(config) {
    try {
      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(config);
      } else {
        this.app = firebase.app();
      }

      this.db = firebase.database();
      this.isCloudConnected = true;
      this.updateUIStatus('Firebase Cloud Connected', true);
      this.startCloudListener();
      console.log('Firebase Realtime Database initialized successfully.');
    } catch (err) {
      console.warn('Firebase init notice: Running with local resilient storage.', err.message);
      this.isCloudConnected = false;
      this.updateUIStatus('Local Storage (Cloud Unreachable)', false);
    }
  }

  updateConfig(newConfig) {
    localStorage.setItem(this.configStorageKey, JSON.stringify(newConfig));
    this.connectFirebase(newConfig);
  }

  getConfig() {
    const saved = localStorage.getItem(this.configStorageKey);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
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

  startCloudListener() {
    if (!this.db || !this.isCloudConnected) return;

    try {
      const sessionsRef = this.db.ref('simulation_sessions').limitToLast(30);
      sessionsRef.on('value', (snapshot) => {
        const val = snapshot.val();
        if (val) {
          const cloudList = Object.keys(val).map(key => ({
            id: key,
            ...val[key]
          }));
          cloudList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          this.sessionsCache = cloudList;
          this.notifyListeners();
        }
      }, (error) => {
        console.warn('Firebase realtime listener error, falling back to local cache:', error);
      });
    } catch (e) {
      console.warn('Listener setup exception:', e);
    }
  }

  /**
   * Save a completed simulation session
   * @param {Object} sessionData
   * {
   *   id, timestamp, durationSeconds, mode, totalCarsPassed, avgWaitTime,
   *   maxQueue, throughput, spawnRate, efficiencyDelta
   * }
   */
  async saveSession(sessionData) {
    const session = {
      ...sessionData,
      id: sessionData.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      savedAt: new Date().toLocaleTimeString(),
      source: this.isCloudConnected ? 'Firebase Realtime DB' : 'Local Storage'
    };

    // Always keep in local memory/storage
    this.sessionsCache.unshift(session);
    if (this.sessionsCache.length > 50) this.sessionsCache.pop();
    this.saveLocalSessions();
    this.notifyListeners();

    // If connected to Firebase Realtime Database, push to cloud
    if (this.isCloudConnected && this.db) {
      try {
        await this.db.ref(`simulation_sessions/${session.id}`).set(session);
        console.log('Session synced to Firebase Cloud:', session.id);
        return { success: true, target: 'firebase' };
      } catch (err) {
        console.warn('Firebase push failed, kept in local storage:', err);
        return { success: true, target: 'local_fallback', error: err.message };
      }
    }

    return { success: true, target: 'local' };
  }

  getSessions() {
    return this.sessionsCache;
  }

  clearHistory() {
    this.sessionsCache = [];
    localStorage.removeItem(this.localStorageKey);

    if (this.isCloudConnected && this.db) {
      try {
        this.db.ref('simulation_sessions').remove();
      } catch (e) {}
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
      textSpan.textContent = isConnected ? 'Firebase: Live Cloud' : 'Firebase: Local Mode';
    }
    if (modalStatus) {
      modalStatus.textContent = statusText;
    }
  }
}

// Global Firebase instance
window.firebaseManager = new FirebaseManager();
