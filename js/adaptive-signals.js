/**
 * AdaptiveSignalAI - 4-Way Single-Arm Traffic Controller
 * Individually evaluates queue demand, waiting times, and starvation for all 4 arms
 * (NORTH, SOUTH, EAST, WEST), dynamically sizing green times and picking the best next phase.
 */

class AdaptiveSignalAI {
  constructor() {
    this.minGreen = 6.0;       // Minimum green safety threshold (seconds)
    this.maxGreen = 24.0;      // Maximum green extension ceiling (seconds)
    this.baseGreen = 12.0;     // Standard baseline green duration

    // Anti-starvation safeguards (seconds)
    this.starvationLimit = 38.0;
    this.timeSinceGreen = {
      NORTH: 0,
      EAST: 0,
      SOUTH: 0,
      WEST: 0
    };

    // Approach Demand Metrics
    this.demands = {
      NORTH: 0,
      EAST: 0,
      SOUTH: 0,
      WEST: 0
    };

    this.lastDecisionText = 'AI Engine: Single-Arm Evaluation active. Monitoring directional queues.';
  }

  reset() {
    this.timeSinceGreen = { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 };
    this.demands = { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 };
    this.lastDecisionText = 'AI Engine reset. Evaluating all 4 approaches independently.';
  }

  /**
   * Evaluate intersection state and generate adaptive timing recommendations
   * @param {Object} queueData { NORTH: [...], SOUTH: [...], EAST: [...], WEST: [...] }
   * @param {TrafficSignalController} signalController
   * @param {number} dt Delta time
   */
  evaluate(queueData, signalController, dt) {
    const directions = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const activeDir = signalController.activePhase;

    // 1. Accumulate starvation timers for inactive directions
    directions.forEach(dir => {
      if (dir === activeDir && signalController.phaseState === SignalColor.GREEN) {
        this.timeSinceGreen[dir] = 0;
      } else {
        this.timeSinceGreen[dir] += dt;
      }
    });

    // 2. Calculate approach demand metrics for each arm
    const metrics = {};
    directions.forEach(dir => {
      const approachData = this.calculateApproachDemand(queueData[dir] || []);
      metrics[dir] = approachData;
      this.demands[dir] = Math.round(approachData.demand * 10) / 10;
    });

    const activeMetrics = metrics[activeDir] || { count: 0, demand: 0, avgWait: 0 };
    const currentElapsedTime = signalController.phaseElapsedTime;
    const isGreen = (signalController.phaseState === SignalColor.GREEN);

    let recommendedGreenDuration = this.baseGreen;
    let requestEarlyCutoff = false;
    let reasoning = '';

    // Calculate dynamic green target for the active direction
    recommendedGreenDuration = Math.min(
      this.maxGreen,
      Math.max(this.minGreen, this.baseGreen + (activeMetrics.count * 1.5))
    );

    // Check if any other direction is starving
    let starvingDir = null;
    let maxWaitObserved = 0;
    directions.forEach(dir => {
      if (dir !== activeDir && this.timeSinceGreen[dir] >= this.starvationLimit && this.demands[dir] > 0) {
        if (this.timeSinceGreen[dir] > maxWaitObserved) {
          maxWaitObserved = this.timeSinceGreen[dir];
          starvingDir = dir;
        }
      }
    });

    // Determine the next recommended phase (arm with highest demand or starving)
    let nextRecommendedPhase = null;
    if (starvingDir) {
      nextRecommendedPhase = starvingDir;
    } else {
      // Pick the non-active direction with highest demand
      let highestDemand = -1;
      directions.forEach(dir => {
        if (dir !== activeDir && this.demands[dir] > highestDemand) {
          highestDemand = this.demands[dir];
          nextRecommendedPhase = dir;
        }
      });
    }

    if (isGreen) {
      if (starvingDir && currentElapsedTime >= this.minGreen) {
        requestEarlyCutoff = true;
        reasoning = `Anti-Starvation Trigger: ${starvingDir} has waited ${Math.round(maxWaitObserved)}s. Transitioning green to ${starvingDir}.`;
      } else if (activeMetrics.count === 0 && currentElapsedTime >= this.minGreen && nextRecommendedPhase && this.demands[nextRecommendedPhase] > 0) {
        requestEarlyCutoff = true;
        const savedTime = Math.max(0, Math.round(recommendedGreenDuration - currentElapsedTime));
        reasoning = `Early Cutoff: ${activeDir} queue empty. Diverting green to ${nextRecommendedPhase} (Saved ~${savedTime}s idle time).`;
      } else if (activeMetrics.count > 4 && currentElapsedTime < this.maxGreen) {
        reasoning = `High Traffic on ${activeDir}: ${activeMetrics.count} vehicles in queue. Extending Green to ${Math.round(recommendedGreenDuration)}s.`;
      } else {
        reasoning = `Optimizing ${activeDir} approach: ${activeMetrics.count} queued. Target Green: ${Math.round(recommendedGreenDuration)}s.`;
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
      calculatedDuration: recommendedGreenDuration,
      nextRecommendedPhase: nextRecommendedPhase,
      reasoningText: this.lastDecisionText,
      demands: this.demands
    };
  }

  /**
   * Multi-factor heuristic score:
   * Score = (VehicleCount * 1.8) + (AvgWaitSeconds * 0.4) + (ApproachingCount * 0.5)
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
    const demand = (queuedCount * 1.8) + (avgWait * 0.4) + (approachingCount * 0.5);

    return {
      count: queuedCount,
      demand: demand,
      avgWait: avgWait
    };
  }
}

window.AdaptiveSignalAI = AdaptiveSignalAI;
