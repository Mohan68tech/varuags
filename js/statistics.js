/**
 * StatisticsEngine & Performance Benchmarking
 * Accurate calculation of vehicle delay, throughput, queue lengths,
 * and side-by-side Fixed-Time vs Adaptive AI comparison telemetry.
 */

class StatisticsEngine {
  constructor() {
    // Current Active Run Metrics
    this.totalCarsPassed = 0;
    this.accumulatedWaitTimeTotal = 0; // Sum of wait times of all vehicles that completed
    this.currentWaitingVehicles = 0;
    this.queueLengths = { NORTH: 0, SOUTH: 0, EAST: 0, WEST: 0 };
    this.elapsedSimulationSeconds = 0;
    this.throughputVehiclesPerMinute = 0;

    // Peak Queue Tracker
    this.maxQueueObserved = 0;

    // Benchmark Run Comparison Datasets
    this.benchmarkData = {
      fixed: {
        runsCount: 0,
        avgWaitTime: 0,
        carsPassed: 0,
        maxQueue: 0,
        throughput: 0,
        samples: []
      },
      adaptive: {
        runsCount: 0,
        avgWaitTime: 0,
        carsPassed: 0,
        maxQueue: 0,
        throughput: 0,
        samples: []
      }
    };

    // Chart.js chart reference
    this.chartInstance = null;
    this.initChart();
  }

  resetCurrentRun() {
    this.totalCarsPassed = 0;
    this.accumulatedWaitTimeTotal = 0;
    this.currentWaitingVehicles = 0;
    this.queueLengths = { NORTH: 0, SOUTH: 0, EAST: 0, WEST: 0 };
    this.elapsedSimulationSeconds = 0;
    this.throughputVehiclesPerMinute = 0;
    this.maxQueueObserved = 0;
    this.updateDOM();
  }

  resetAll() {
    this.resetCurrentRun();
    this.benchmarkData.fixed = { runsCount: 0, avgWaitTime: 0, carsPassed: 0, maxQueue: 0, throughput: 0, samples: [] };
    this.benchmarkData.adaptive = { runsCount: 0, avgWaitTime: 0, carsPassed: 0, maxQueue: 0, throughput: 0, samples: [] };
    this.updateComparisonTable();
    this.updateChart();
  }

  /**
   * Called every fixed-timestep
   * @param {number} dt Delta time in seconds
   * @param {Array<Vehicle>} allVehicles
   */
  update(dt, allVehicles) {
    this.elapsedSimulationSeconds += dt;

    // Compute instantaneous waiting vehicles & queues
    let waitingNow = 0;
    const queues = { NORTH: 0, SOUTH: 0, EAST: 0, WEST: 0 };

    for (let i = 0; i < allVehicles.length; i++) {
      const v = allVehicles[i];
      if (v.isWaiting) {
        waitingNow++;
        if (queues[v.direction] !== undefined) {
          queues[v.direction]++;
        }
      }
    }

    this.currentWaitingVehicles = waitingNow;
    this.queueLengths = queues;

    const totalQueueNow = queues.NORTH + queues.SOUTH + queues.EAST + queues.WEST;
    if (totalQueueNow > this.maxQueueObserved) {
      this.maxQueueObserved = totalQueueNow;
    }

    // Throughput: (Cars passed / minutes elapsed)
    if (this.elapsedSimulationSeconds > 2.0) {
      const minutes = this.elapsedSimulationSeconds / 60.0;
      this.throughputVehiclesPerMinute = Math.round((this.totalCarsPassed / minutes) * 10) / 10;
    } else {
      this.throughputVehiclesPerMinute = 0;
    }
  }

  /**
   * Record a vehicle successfully exiting the junction
   * @param {Vehicle} vehicle
   */
  recordVehicleExit(vehicle) {
    this.totalCarsPassed++;
    this.accumulatedWaitTimeTotal += vehicle.totalWaitTime;
  }

  getAverageWaitTime() {
    if (this.totalCarsPassed === 0) return 0;
    return Math.round((this.accumulatedWaitTimeTotal / this.totalCarsPassed) * 10) / 10;
  }

  /**
   * Archive the current run data into benchmark datasets
   * @param {string} mode 'FIXED' or 'ADAPTIVE'
   */
  archiveRun(mode) {
    const key = (mode === 'ADAPTIVE') ? 'adaptive' : 'fixed';
    const currentAvgWait = this.getAverageWaitTime();
    const currentPassed = this.totalCarsPassed;
    const currentMaxQ = this.maxQueueObserved;
    const currentThroughput = this.throughputVehiclesPerMinute;

    const dataset = this.benchmarkData[key];
    dataset.runsCount++;
    dataset.samples.push({
      avgWait: currentAvgWait,
      passed: currentPassed,
      maxQ: currentMaxQ,
      throughput: currentThroughput,
      duration: Math.round(this.elapsedSimulationSeconds)
    });

    // Compute aggregate averages
    const n = dataset.samples.length;
    dataset.avgWaitTime = Math.round((dataset.samples.reduce((a, b) => a + b.avgWait, 0) / n) * 10) / 10;
    dataset.carsPassed = Math.round(dataset.samples.reduce((a, b) => a + b.passed, 0) / n);
    dataset.maxQueue = Math.max(...dataset.samples.map(s => s.maxQ));
    dataset.throughput = Math.round((dataset.samples.reduce((a, b) => a + b.throughput, 0) / n) * 10) / 10;

    this.updateComparisonTable();
    this.updateChart();
  }

  /**
   * Update Live Telemetry DOM Elements
   */
  updateDOM() {
    // Time format MM:SS.s
    const mins = Math.floor(this.elapsedSimulationSeconds / 60);
    const secs = (this.elapsedSimulationSeconds % 60).toFixed(1);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(4, '0')}`;
    const timeEl = document.getElementById('simTimeDisplay');
    if (timeEl) timeEl.textContent = timeStr;

    // Stat Cards
    const passedEl = document.getElementById('statCarsPassed');
    if (passedEl) passedEl.textContent = this.totalCarsPassed;

    const waitEl = document.getElementById('statAvgWait');
    if (waitEl) waitEl.innerHTML = `${this.getAverageWaitTime()}<small>s</small>`;

    const waitingNowEl = document.getElementById('statWaitingNow');
    if (waitingNowEl) waitingNowEl.textContent = this.currentWaitingVehicles;

    const flowEl = document.getElementById('statThroughput');
    if (flowEl) flowEl.innerHTML = `${this.throughputVehiclesPerMinute}<small>/m</small>`;

    // Queue Visual Bars (Max scale ~ 15 vehicles)
    const maxBarScale = 15;
    this.updateQueueBar('North', this.queueLengths.NORTH, maxBarScale);
    this.updateQueueBar('South', this.queueLengths.SOUTH, maxBarScale);
    this.updateQueueBar('East',  this.queueLengths.EAST,  maxBarScale);
    this.updateQueueBar('West',  this.queueLengths.WEST,  maxBarScale);
  }

  updateQueueBar(dir, count, maxScale) {
    const bar = document.getElementById(`barQueue${dir}`);
    const val = document.getElementById(`valQueue${dir}`);
    if (bar) {
      const pct = Math.min(100, Math.round((count / maxScale) * 100));
      bar.style.width = `${pct}%`;
    }
    if (val) {
      val.textContent = `${count} veh`;
    }
  }

  /**
   * Update Side-by-Side Comparison Table & calculate efficiency deltas
   */
  updateComparisonTable() {
    const f = this.benchmarkData.fixed;
    const a = this.benchmarkData.adaptive;

    const fWait = f.runsCount > 0 ? `${f.avgWaitTime}s` : '--';
    const aWait = a.runsCount > 0 ? `${a.avgWaitTime}s` : '--';

    const fPassed = f.runsCount > 0 ? `${f.carsPassed}` : '--';
    const aPassed = a.runsCount > 0 ? `${a.carsPassed}` : '--';

    const fMaxQ = f.runsCount > 0 ? `${f.maxQueue} veh` : '--';
    const aMaxQ = a.runsCount > 0 ? `${a.maxQueue} veh` : '--';

    const fFlow = f.runsCount > 0 ? `${f.throughput}/m` : '--';
    const aFlow = a.runsCount > 0 ? `${a.throughput}/m` : '--';

    document.getElementById('compFixedWait').textContent = fWait;
    document.getElementById('compAdaptWait').textContent = aWait;
    document.getElementById('compFixedPassed').textContent = fPassed;
    document.getElementById('compAdaptPassed').textContent = aPassed;
    document.getElementById('compFixedMaxQ').textContent = fMaxQ;
    document.getElementById('compAdaptMaxQ').textContent = aMaxQ;
    document.getElementById('compFixedFlow').textContent = fFlow;
    document.getElementById('compAdaptFlow').textContent = aFlow;

    // Calculate Deltas if both have runs
    const waitDeltaEl = document.getElementById('compWaitDelta');
    const passedDeltaEl = document.getElementById('compPassedDelta');
    const queueDeltaEl = document.getElementById('compQueueDelta');
    const flowDeltaEl = document.getElementById('compFlowDelta');

    if (f.runsCount > 0 && a.runsCount > 0) {
      // Wait time delta (negative is good: less wait)
      const waitDiffPct = f.avgWaitTime > 0 ? Math.round(((a.avgWaitTime - f.avgWaitTime) / f.avgWaitTime) * 100) : 0;
      if (waitDiffPct < 0) {
        waitDeltaEl.innerHTML = `<span class="delta-good">${waitDiffPct}% (Faster)</span>`;
      } else {
        waitDeltaEl.innerHTML = `<span class="delta-bad">+${waitDiffPct}%</span>`;
      }

      // Passed vehicles delta (positive is good)
      const passedDiffPct = f.carsPassed > 0 ? Math.round(((a.carsPassed - f.carsPassed) / f.carsPassed) * 100) : 0;
      passedDeltaEl.innerHTML = passedDiffPct >= 0
        ? `<span class="delta-good">+${passedDiffPct}%</span>`
        : `<span class="delta-bad">${passedDiffPct}%</span>`;

      // Max queue delta (negative is good: shorter queues)
      const qDiffPct = f.maxQueue > 0 ? Math.round(((a.maxQueue - f.maxQueue) / f.maxQueue) * 100) : 0;
      queueDeltaEl.innerHTML = qDiffPct <= 0
        ? `<span class="delta-good">${qDiffPct}%</span>`
        : `<span class="delta-bad">+${qDiffPct}%</span>`;

      // Throughput delta (positive is good)
      const flowDiffPct = f.throughput > 0 ? Math.round(((a.throughput - f.throughput) / f.throughput) * 100) : 0;
      flowDeltaEl.innerHTML = flowDiffPct >= 0
        ? `<span class="delta-good">+${flowDiffPct}%</span>`
        : `<span class="delta-bad">${flowDiffPct}%</span>`;
    } else {
      waitDeltaEl.textContent = '--';
      passedDeltaEl.textContent = '--';
      queueDeltaEl.textContent = '--';
      flowDeltaEl.textContent = '--';
    }
  }

  /**
   * Initialize Chart.js comparison chart
   */
  initChart() {
    const canvas = document.getElementById('comparisonChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    this.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Avg Wait (s)', 'Max Queue', 'Flow (veh/m)'],
        datasets: [
          {
            label: 'Fixed-Time',
            data: [0, 0, 0],
            backgroundColor: 'rgba(56, 189, 248, 0.65)',
            borderColor: 'rgba(56, 189, 248, 1)',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Adaptive AI',
            data: [0, 0, 0],
            backgroundColor: 'rgba(168, 85, 247, 0.75)',
            borderColor: 'rgba(168, 85, 247, 1)',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#94a3b8',
              font: { size: 10, family: "'Inter', sans-serif" },
              boxWidth: 12
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#00f2fe',
            bodyColor: '#f1f5f9',
            borderColor: 'rgba(0, 242, 254, 0.25)',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            ticks: { color: '#64748b', font: { size: 9 } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#64748b', font: { size: 9 } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        }
      }
    });
  }

  updateChart() {
    if (!this.chartInstance) return;
    const f = this.benchmarkData.fixed;
    const a = this.benchmarkData.adaptive;

    this.chartInstance.data.datasets[0].data = [f.avgWaitTime, f.maxQueue, f.throughput];
    this.chartInstance.data.datasets[1].data = [a.avgWaitTime, a.maxQueue, a.throughput];
    this.chartInstance.update();
  }
}

window.StatisticsEngine = StatisticsEngine;
