/**
 * Main Controller & UI Glue
 * Connects the simulation engine, UI controls, audio synthesis,
 * Firebase cloud storage, AI decision engine, and benchmark metrics.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Simulation Engine
  const sim = new SimulationEngine('trafficCanvas');
  window.simInstance = sim;

  // DOM Elements - Master Controls
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnResume = document.getElementById('btnResume');
  const btnReset = document.getElementById('btnReset');
  const simStatusPill = document.getElementById('simStatusPill');
  const simStatusText = document.getElementById('simStatusText');
  const simStatusDot = simStatusPill ? simStatusPill.querySelector('.status-dot') : null;
  const canvasOverlay = document.getElementById('canvasOverlay');

  // Sliders & Speeds
  const spawnRateSlider = document.getElementById('spawnRateSlider');
  const spawnRateValue = document.getElementById('spawnRateValue');
  const speedBtnGroup = document.getElementById('speedBtnGroup');

  // Modes & AI
  const btnModeFixed = document.getElementById('btnModeFixed');
  const btnModeAdaptive = document.getElementById('btnModeAdaptive');
  const currentModeBadge = document.getElementById('currentModeBadge');
  const currentModeText = document.getElementById('currentModeText');
  const chkFreeLeftTurn = document.getElementById('chkFreeLeftTurn');
  const aiDecisionText = document.getElementById('aiDecisionText');
  const nDemandVal = document.getElementById('nDemandVal');
  const eDemandVal = document.getElementById('eDemandVal');
  const sDemandVal = document.getElementById('sDemandVal');
  const wDemandVal = document.getElementById('wDemandVal');

  // Emergency Controls
  const btnSpawnEmergency = document.getElementById('btnSpawnEmergency');
  const emergencyDirectionSelect = document.getElementById('emergencyDirectionSelect');
  const corridorBadge = document.getElementById('corridorBadge');

  // AI Red-Light Camera & E-Challan Controls
  const btnSimulateViolation = document.getElementById('btnSimulateViolation');
  const violationCountBadge = document.getElementById('violationCountBadge');
  const violatorFeed = document.getElementById('violatorFeed');

  // Quick Toggles
  const nightModeToggle = document.getElementById('nightModeToggle');
  const soundToggle = document.getElementById('soundToggle');
  const helpModalBtn = document.getElementById('helpModalBtn');

  // Canvas HUD elements
  const hudActivePhase = document.getElementById('hudActivePhase');
  const hudSignalLamp = document.getElementById('hudSignalLamp');
  const hudPhaseSeconds = document.getElementById('hudPhaseSeconds');
  const hudPhaseSub = document.getElementById('hudPhaseSub');

  // Modals
  const firebaseModal = document.getElementById('firebaseModal');
  const historyModal = document.getElementById('historyModal');
  const helpModal = document.getElementById('helpModal');
  const btnOpenFirebaseModal = document.getElementById('btnOpenFirebaseModal');
  const btnCloseFirebaseModal = document.getElementById('btnCloseFirebaseModal');
  const btnSaveFirebaseConfig = document.getElementById('btnSaveFirebaseConfig');
  const btnTestFirebase = document.getElementById('btnTestFirebase');
  const fbStatusPill = document.getElementById('firebaseStatusPill');

  const btnViewHistory = document.getElementById('btnViewHistory');
  const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
  const btnSaveSession = document.getElementById('btnSaveSession');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const historyTableBody = document.getElementById('historyTableBody');
  const sessionCount = document.getElementById('sessionCount');

  const btnResetComparison = document.getElementById('btnResetComparison');
  const btnBenchRun = document.getElementById('btnBenchRun');

  // Render initial frame so canvas is never blank
  sim.render();

  // -------------------------------------------------------------
  // PLAYBACK CONTROL HANDLERS
  // -------------------------------------------------------------
  btnStart.addEventListener('click', () => {
    if (window.soundFX) window.soundFX.playClick();
    sim.start();
    updatePlaybackUI('RUNNING');
  });

  btnPause.addEventListener('click', () => {
    if (window.soundFX) window.soundFX.playClick();
    sim.pause();
    updatePlaybackUI('PAUSED');
  });

  btnResume.addEventListener('click', () => {
    if (window.soundFX) window.soundFX.playClick();
    sim.resume();
    updatePlaybackUI('RUNNING');
  });

  btnReset.addEventListener('click', () => {
    if (window.soundFX) window.soundFX.playClick();
    // Archive run to comparison benchmark if vehicles passed
    if (sim.stats.totalCarsPassed > 0) {
      sim.stats.archiveRun(sim.simMode);
    }
    sim.reset();
    if (violationCountBadge) violationCountBadge.textContent = '0 VIOLATIONS';
    if (violatorFeed) {
      violatorFeed.innerHTML = '<div class="violator-empty text-muted"><i class="fa-solid fa-shield-check text-success"></i> All vehicles obeying red signals</div>';
    }
    updatePlaybackUI('STOPPED');
  });

  function updatePlaybackUI(state) {
    if (state === 'RUNNING') {
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnPause.style.display = 'inline-flex';
      btnResume.style.display = 'none';
      if (simStatusDot) {
        simStatusDot.className = 'status-dot active';
      }
      if (simStatusText) simStatusText.textContent = 'SIMULATING';
      if (canvasOverlay) canvasOverlay.style.display = 'none';
    } else if (state === 'PAUSED') {
      btnPause.style.display = 'none';
      btnResume.style.display = 'inline-flex';
      if (simStatusDot) {
        simStatusDot.className = 'status-dot paused';
      }
      if (simStatusText) simStatusText.textContent = 'PAUSED';
      if (canvasOverlay) {
        canvasOverlay.style.display = 'flex';
        document.getElementById('overlayMessage').textContent = 'SIMULATION PAUSED';
      }
    } else if (state === 'STOPPED') {
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnPause.style.display = 'inline-flex';
      btnResume.style.display = 'none';
      if (simStatusDot) {
        simStatusDot.className = 'status-dot stopped';
      }
      if (simStatusText) simStatusText.textContent = 'READY';
      if (canvasOverlay) canvasOverlay.style.display = 'none';
    }
  }

  // -------------------------------------------------------------
  // SIMULATION SPEED HANDLERS
  // -------------------------------------------------------------
  speedBtnGroup.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtnGroup.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const speed = parseFloat(btn.dataset.speed);
      sim.setSpeed(speed);
      if (window.soundFX) window.soundFX.playClick();
    });
  });

  // -------------------------------------------------------------
  // SPAWN RATE SLIDER
  // -------------------------------------------------------------
  spawnRateSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    spawnRateValue.textContent = `${val} veh/min`;
    sim.setSpawnRate(val);
  });

  // -------------------------------------------------------------
  // MODE SELECTION: FIXED VS ADAPTIVE AI
  // -------------------------------------------------------------
  btnModeFixed.addEventListener('click', () => {
    if (window.soundFX) window.soundFX.playClick();
    btnModeFixed.classList.add('active');
    btnModeAdaptive.classList.remove('active');
    currentModeText.textContent = 'FIXED-TIME MODE';
    currentModeBadge.innerHTML = '<i class="fa-solid fa-clock"></i> <span>FIXED-TIME MODE</span>';
    sim.setMode('FIXED');
    aiDecisionText.textContent = 'Fixed-Time single-arm cycle active (14s Green / 3s Amber). Sequential North -> East -> South -> West.';
  });

  btnModeAdaptive.addEventListener('click', () => {
    if (window.soundFX) window.soundFX.playClick();
    btnModeAdaptive.classList.add('active');
    btnModeFixed.classList.remove('active');
    currentModeText.textContent = 'ADAPTIVE AI MODE';
    currentModeBadge.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-purple"></i> <span>ADAPTIVE AI MODE</span>';
    sim.setMode('ADAPTIVE');
    aiDecisionText.textContent = 'Adaptive AI active: Dynamically weighing queues and arrival flow.';
  });

  // -------------------------------------------------------------
  // FREE LEFT TURN (INDIAN TRAFFIC RULE)
  // -------------------------------------------------------------
  chkFreeLeftTurn.addEventListener('change', (e) => {
    if (window.soundFX) window.soundFX.playClick();
    sim.setFreeLeftTurn(e.target.checked);
  });

  // -------------------------------------------------------------
  // EMERGENCY AMBULANCE DISPATCH
  // -------------------------------------------------------------
  btnSpawnEmergency.addEventListener('click', () => {
    if (window.soundFX) window.soundFX.playClick();
    if (!sim.isRunning) {
      sim.start();
      updatePlaybackUI('RUNNING');
    }
    const dir = emergencyDirectionSelect.value;
    sim.spawnEmergencyVehicle(dir);
    corridorBadge.textContent = 'ACTIVE CORRIDOR';
    corridorBadge.className = 'badge badge-emergency fa-beat';

    setTimeout(() => {
      if (!sim.signalController.emergencyActive) {
        corridorBadge.textContent = 'STANDBY';
        corridorBadge.className = 'badge badge-emergency';
      }
    }, 15000);
  });

  // -------------------------------------------------------------
  // AI RED-LIGHT ENFORCEMENT & E-CHALLAN
  // -------------------------------------------------------------
  if (btnSimulateViolation) {
    btnSimulateViolation.addEventListener('click', () => {
      if (window.soundFX) window.soundFX.playClick();
      if (!sim.isRunning) {
        sim.start();
        updatePlaybackUI('RUNNING');
      }
      sim.simulateRedLightJump();
    });
  }

  sim.onViolation((rec, allViolations) => {
    if (violationCountBadge) {
      violationCountBadge.textContent = `${allViolations.length} VIOLATION${allViolations.length > 1 ? 'S' : ''}`;
      violationCountBadge.className = 'badge badge-emergency fa-beat';
      setTimeout(() => {
        violationCountBadge.className = 'badge badge-emergency';
      }, 3000);
    }

    if (violatorFeed) {
      violatorFeed.innerHTML = allViolations.map(v => `
        <div class="violator-item">
          <div class="violator-top">
            <div class="hsrp-plate"><span class="hsrp-ind">IND</span>${v.plateNumber}</div>
            <span class="violator-fine">₹${v.fineAmount} E-Challan</span>
          </div>
          <div class="violator-details">
            <span><i class="fa-solid fa-car-side"></i> <strong>${v.vehicleType}</strong> (${v.direction})</span>
            <span><i class="fa-solid fa-gauge-simple-high"></i> ${v.speedKmph} km/h • ${v.timeStr}</span>
          </div>
        </div>
      `).join('');
    }
  });

  // -------------------------------------------------------------
  // DAY / NIGHT & AUDIO TOGGLES
  // -------------------------------------------------------------
  nightModeToggle.addEventListener('click', () => {
    const isNight = sim.toggleNightMode();
    document.body.className = isNight ? 'theme-night' : 'theme-day';
    nightModeToggle.innerHTML = isNight ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    if (window.soundFX) window.soundFX.playClick();
  });

  soundToggle.addEventListener('click', () => {
    if (window.soundFX) {
      const isEnabled = window.soundFX.toggle();
      soundToggle.innerHTML = isEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
    }
  });

  // -------------------------------------------------------------
  // HELP MODAL
  // -------------------------------------------------------------
  helpModalBtn.addEventListener('click', () => { helpModal.style.display = 'flex'; });
  document.getElementById('btnCloseHelpModal').addEventListener('click', () => { helpModal.style.display = 'none'; });
  document.getElementById('btnCloseHelpBtn').addEventListener('click', () => { helpModal.style.display = 'none'; });

  // -------------------------------------------------------------
  // FIREBASE CONFIG & INTEGRATION MODAL
  // -------------------------------------------------------------
  const openFirebaseModal = () => {
    const cfg = window.firebaseManager.getConfig();
    document.getElementById('fbDatabaseUrl').value = cfg.databaseURL || '';
    document.getElementById('fbApiKey').value = cfg.apiKey || '';
    document.getElementById('fbProjectId').value = cfg.projectId || '';
    firebaseModal.style.display = 'flex';
  };

  btnOpenFirebaseModal.addEventListener('click', openFirebaseModal);
  fbStatusPill.addEventListener('click', openFirebaseModal);
  btnCloseFirebaseModal.addEventListener('click', () => { firebaseModal.style.display = 'none'; });

  btnSaveFirebaseConfig.addEventListener('click', () => {
    const newConfig = {
      databaseURL: document.getElementById('fbDatabaseUrl').value.trim(),
      apiKey: document.getElementById('fbApiKey').value.trim(),
      projectId: document.getElementById('fbProjectId').value.trim()
    };
    window.firebaseManager.updateConfig(newConfig);
    firebaseModal.style.display = 'none';
  });

  btnTestFirebase.addEventListener('click', () => {
    const statusSpan = document.getElementById('fbStatusSpan');
    statusSpan.textContent = 'Testing connection...';
    setTimeout(() => {
      if (window.firebaseManager.isCloudConnected) {
        statusSpan.textContent = 'Connected to Firebase Realtime Database!';
      } else {
        statusSpan.textContent = 'Operating smoothly in Local / Offline resilient storage.';
      }
    }, 600);
  });

  // -------------------------------------------------------------
  // SESSION HISTORY & CLOUD SAVING
  // -------------------------------------------------------------
  btnSaveSession.addEventListener('click', async () => {
    if (window.soundFX) window.soundFX.playClick();
    if (sim.stats.totalCarsPassed === 0 && sim.stats.elapsedSimulationSeconds < 5) {
      alert('Start the simulation and let vehicles pass before saving a session run.');
      return;
    }

    const sessionPayload = {
      mode: sim.simMode,
      durationSeconds: Math.round(sim.stats.elapsedSimulationSeconds),
      totalCarsPassed: sim.stats.totalCarsPassed,
      avgWaitTime: sim.stats.getAverageWaitTime(),
      maxQueue: sim.stats.maxQueueObserved,
      throughput: sim.stats.throughputVehiclesPerMinute,
      spawnRate: sim.spawnRatePerMinute
    };

    const result = await window.firebaseManager.saveSession(sessionPayload);
    const lastSyncText = document.getElementById('lastSyncText');
    if (lastSyncText) {
      lastSyncText.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> Saved run #${sessionPayload.id.slice(0, 12)} (${result.target})`;
    }
  });

  btnViewHistory.addEventListener('click', () => {
    renderHistoryTable();
    historyModal.style.display = 'flex';
  });

  btnCloseHistoryModal.addEventListener('click', () => { historyModal.style.display = 'none'; });

  btnExportJson.addEventListener('click', () => {
    window.firebaseManager.exportJson();
  });

  btnClearHistory.addEventListener('click', () => {
    if (confirm('Clear all saved simulation runs from memory/database?')) {
      window.firebaseManager.clearHistory();
      renderHistoryTable();
    }
  });

  function renderHistoryTable() {
    const sessions = window.firebaseManager.getSessions();
    if (!sessions || sessions.length === 0) {
      historyTableBody.innerHTML = '<tr><td colspan="8" class="text-center">No simulation runs saved yet. Start a run and click "Save Run"!</td></tr>';
      return;
    }

    historyTableBody.innerHTML = sessions.map(s => `
      <tr>
        <td><code>${s.id ? s.id.slice(0, 10) : 'run'}</code></td>
        <td>${s.savedAt || new Date(s.timestamp || Date.now()).toLocaleTimeString()}</td>
        <td>${s.durationSeconds || 0}s</td>
        <td><span class="badge ${s.mode === 'ADAPTIVE' ? 'ai-badge' : 'badge-time'}">${s.mode}</span></td>
        <td><strong>${s.totalCarsPassed || 0}</strong></td>
        <td>${s.avgWaitTime || 0}s</td>
        <td>${s.throughput || 0}/m</td>
        <td><small class="text-muted">${s.source || 'Local'}</small></td>
      </tr>
    `).join('');
  }

  // Listen to sessions update
  window.firebaseManager.onSessionsUpdate((sessions) => {
    if (sessionCount) sessionCount.textContent = sessions.length;
  });

  // -------------------------------------------------------------
  // BENCHMARKING ENGINE
  // -------------------------------------------------------------
  btnResetComparison.addEventListener('click', () => {
    if (window.soundFX) window.soundFX.playClick();
    sim.stats.resetAll();
  });

  let isBenchmarking = false;
  btnBenchRun.addEventListener('click', () => {
    if (isBenchmarking) return;
    isBenchmarking = true;
    btnBenchRun.disabled = true;
    btnBenchRun.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running Fixed Test (60s sim)...';

    // Step 1: Run Fixed-Time for 60s sim at 3.0x speed (20 real seconds)
    sim.reset();
    sim.setMode('FIXED');
    btnModeFixed.click();
    sim.setSpeed(3.0);
    sim.start();
    updatePlaybackUI('RUNNING');

    setTimeout(() => {
      sim.stats.archiveRun('FIXED');
      btnBenchRun.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running Adaptive Test (60s sim)...';

      // Step 2: Run Adaptive for 60s sim at 3.0x speed with same traffic
      sim.reset();
      sim.setMode('ADAPTIVE');
      btnModeAdaptive.click();
      sim.setSpeed(3.0);
      sim.start();
      updatePlaybackUI('RUNNING');

      setTimeout(() => {
        sim.stats.archiveRun('ADAPTIVE');
        btnBenchRun.disabled = false;
        btnBenchRun.innerHTML = '<i class="fa-solid fa-flask-vial"></i> Benchmark Complete!';
        sim.setSpeed(1.0);
        isBenchmarking = false;
        setTimeout(() => {
          btnBenchRun.innerHTML = '<i class="fa-solid fa-flask-vial"></i> Benchmark 60s Test Run';
        }, 4000);
      }, 20000); // 20 real seconds at 3x = 60 simulation seconds
    }, 20000);
  });

  // -------------------------------------------------------------
  // REGULAR HUD & REASONER TELEMETRY REFRESH LOOP
  // -------------------------------------------------------------
  setInterval(() => {
    if (!sim) return;

    // Phase display
    hudActivePhase.textContent = sim.signalController.getActivePhaseDisplayName();
    const rem = sim.signalController.getRemainingSeconds();
    hudPhaseSeconds.textContent = `${rem}s`;

    // Lamp color & subtext
    const pState = sim.signalController.phaseState;
    hudPhaseSub.textContent = pState;

    hudSignalLamp.className = 'phase-circle';
    if (pState === SignalColor.GREEN) hudSignalLamp.classList.add('green');
    else if (pState === SignalColor.AMBER) hudSignalLamp.classList.add('amber');
    else hudSignalLamp.classList.add('red');

    // AI Reasoner text
    if (sim.simMode === 'ADAPTIVE') {
      aiDecisionText.textContent = sim.adaptiveAI.lastDecisionText;
      if (nDemandVal) nDemandVal.textContent = sim.adaptiveAI.demands.NORTH;
      if (eDemandVal) eDemandVal.textContent = sim.adaptiveAI.demands.EAST;
      if (sDemandVal) sDemandVal.textContent = sim.adaptiveAI.demands.SOUTH;
      if (wDemandVal) wDemandVal.textContent = sim.adaptiveAI.demands.WEST;
    }

    // Live Telemetry DOM Update
    sim.stats.updateDOM();

    // Emergency Corridor Status Badge
    if (sim.signalController.emergencyActive) {
      corridorBadge.textContent = 'ACTIVE CORRIDOR';
      corridorBadge.className = 'badge badge-emergency fa-beat';
    } else {
      corridorBadge.textContent = 'STANDBY';
      corridorBadge.className = 'badge badge-emergency';
    }
  }, 100);
});
