/**
 * AdaptiveSignalAI - Smart Dynamic Traffic Signal Controller
 * Uses computer-vision queue metrics, vehicle waiting delays, and arrival sensors
 * to dynamically optimize green phase durations, prevent starvation, and eliminate idle red times.
 */

class AdaptiveSignalAI {
  constructor() {
    this.minGreen = 7.0;       // Minimum green safety threshold (seconds)
    this.maxGreen = 32.0;      // Maximum green extension ceiling (seconds)
    this.baseGreen = 16.0;     // Standard baseline green duration

    // Anti-starvation safeguards (seconds)
    this.starvationLimit = 36.0;
    this.timeSinceNsGreen = 0;
    this.timeSinceEwGreen = 0;

    // AI Telemetry State
    this.lastDecisionText = 'AI Engine initialized. Evaluating queue pressure.';
    this.nsDemandScore = 0;
    this.ewDemandScore = 0;
    this.lastDecisionTime = 0;
  }

  reset() {
    this.timeSinceNsGreen = 0;
    this.timeSinceEwGreen = 0;
    this.nsDemandScore = 0;
    this.ewDemandScore = 0;
    this.lastDecisionText = 'AI Engine reset. Monitoring junction arrival rates.';
  }

  /**
   * Evaluate intersection state and generate adaptive timing recommendations
   * @param {Object} queueData { NORTH: [...], SOUTH: [...], EAST: [...], WEST: [...] }
   * @param {TrafficSignalController} signalController
   * @param {number} dt Delta time
   */
  evaluate(queueData, signalController, dt) {
    // Accumulate starvation timers
    if (signalController.activePhase === Phase.NORTH_SOUTH) {
      this.timeSinceEwGreen += dt;
      this.timeSinceNsGreen = 0;
    } else if (signalController.activePhase === Phase.EAST_WEST) {
      this.timeSinceNsGreen += dt;
      this.timeSinceEwGreen = 0;
    }

    // 1. Calculate approach demand metrics
    const northMetrics = this.calculateApproachDemand(queueData.NORTH || []);
    const southMetrics = this.calculateApproachDemand(queueData.SOUTH || []);
    const eastMetrics  = this.calculateApproachDemand(queueData.EAST || []);
    const westMetrics  = this.calculateApproachDemand(queueData.WEST || []);

    const nsCombinedDemand = northMetrics.demand + southMetrics.demand;
    const ewCombinedDemand = eastMetrics.demand + westMetrics.demand;

    this.nsDemandScore = Math.round(nsCombinedDemand * 10) / 10;
    this.ewDemandScore = Math.round(ewCombinedDemand * 10) / 10;

    const currentPhase = signalController.activePhase;
    const currentElapsedTime = signalController.phaseElapsedTime;
    const isGreen = (signalController.phaseState === SignalColor.GREEN);

    let recommendedGreenDuration = this.baseGreen;
    let requestEarlyCutoff = false;
    let reasoning = '';

    // 2. Active Phase Logic
    if (currentPhase === Phase.NORTH_SOUTH) {
      // Calculate dynamic green target based on NS queue demand
      const queueCount = northMetrics.count + southMetrics.count;
      recommendedGreenDuration = Math.min(this.maxGreen, Math.max(this.minGreen, this.baseGreen + (queueCount * 1.8)));

      if (isGreen) {
        // Starvation safeguard for EW
        if (this.timeSinceEwGreen >= this.starvationLimit && ewCombinedDemand > 0) {
          requestEarlyCutoff = true;
          reasoning = `Anti-Starvation Trigger: East-West waiting for ${Math.round(this.timeSinceEwGreen)}s. Switching phase.`;
        }
        // Early cutoff if NS queue is cleared and EW has queued vehicles
        else if (queueCount === 0 && currentElapsedTime >= this.minGreen && ewCombinedDemand > 1.0) {
          requestEarlyCutoff = true;
          const savedTime = Math.max(0, Math.round(recommendedGreenDuration - currentElapsedTime));
          reasoning = `Early Cutoff: North-South queue depleted. Diverting to East-West (Saved ~${savedTime}s idle time).`;
        }
        // Heavy traffic extension
        else if (queueCount > 6 && currentElapsedTime < this.maxGreen) {
          reasoning = `High Demand Detected: ${queueCount} vehicles queued on N-S. Extending Green to ${Math.round(recommendedGreenDuration)}s.`;
        } else {
          reasoning = `Optimizing N-S: ${queueCount} in queue. Target Green: ${Math.round(recommendedGreenDuration)}s.`;
        }
      }
    } else if (currentPhase === Phase.EAST_WEST) {
      const queueCount = eastMetrics.count + westMetrics.count;
      recommendedGreenDuration = Math.min(this.maxGreen, Math.max(this.minGreen, this.baseGreen + (queueCount * 1.8)));

      if (isGreen) {
        // Starvation safeguard for NS
        if (this.timeSinceNsGreen >= this.starvationLimit && nsCombinedDemand > 0) {
          requestEarlyCutoff = true;
          reasoning = `Anti-Starvation Trigger: North-South waiting for ${Math.round(this.timeSinceNsGreen)}s. Switching phase.`;
        }
        // Early cutoff if EW queue is cleared and NS has queued vehicles
        else if (queueCount === 0 && currentElapsedTime >= this.minGreen && nsCombinedDemand > 1.0) {
          requestEarlyCutoff = true;
          const savedTime = Math.max(0, Math.round(recommendedGreenDuration - currentElapsedTime));
          reasoning = `Early Cutoff: East-West queue depleted. Diverting to North-South (Saved ~${savedTime}s idle time).`;
        }
        // Heavy traffic extension
        else if (queueCount > 6 && currentElapsedTime < this.maxGreen) {
          reasoning = `High Demand Detected: ${queueCount} vehicles queued on E-W. Extending Green to ${Math.round(recommendedGreenDuration)}s.`;
        } else {
          reasoning = `Optimizing E-W: ${queueCount} in queue. Target Green: ${Math.round(recommendedGreenDuration)}s.`;
        }
      }
    }

    if (reasoning && reasoning !== this.lastDecisionText) {
      this.lastDecisionText = reasoning;
    }

    return {
      recommendedGreenDuration,
      requestEarlyCutoff,
      minGreen: this.minGreen,
      maxGreen: this.maxGreen,
      reasoningText: this.lastDecisionText,
      nsDemand: this.nsDemandScore,
      ewDemand: this.ewDemandScore
    };
  }

  /**
   * Multi-factor heuristic score:
   * Score = (VehicleCount * 1.8) + (AvgWaitSeconds * 0.4) + (ApproachingWithin150px * 0.6)
   */
  calculateApproachDemand(vehicles) {
    if (!vehicles || vehicles.length === 0) {
      return { count: 0, demand: 0, avgWait: 0 };
    }

    let queuedCount = 0;
    let totalWaitTime = 0;
    let approachingCount = 0;

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (v.isWaiting) {
        queuedCount++;
        totalWaitTime += v.waitingTime;
      } else {
        approachingCount++;
      }
    }

    const avgWait = queuedCount > 0 ? (totalWaitTime / queuedCount) : 0;
    const demand = (queuedCount * 1.8) + (avgWait * 0.4) + (approachingCount * 0.6);

    return {
      count: queuedCount,
      demand: demand,
      avgWait: avgWait
    };
  }
}

window.AdaptiveSignalAI = AdaptiveSignalAI;
