/**
 * TrafficSignalController - 4-Phase Single Direction System (Indian Standard)
 * In Indian junctions, only ONE single direction (arm) has GREEN at a time:
 * NORTH ONLY -> EAST ONLY -> SOUTH ONLY -> WEST ONLY.
 * All other 3 directions are strictly RED, ensuring completely conflict-free
 * movements for straight, left, and right turns.
 */

// Signal light states
const SignalColor = {
  RED: 'RED',
  AMBER: 'AMBER',
  GREEN: 'GREEN'
};

// Intersection movement phases - 4 distinct directional phases
const Phase = {
  NORTH: 'NORTH',
  EAST: 'EAST',
  SOUTH: 'SOUTH',
  WEST: 'WEST',
  EMERGENCY_OVERRIDE: 'EMERGENCY_OVERRIDE'
};

// Clockwise Indian sequence
const PhaseSequence = [Phase.NORTH, Phase.EAST, Phase.SOUTH, Phase.WEST];

class TrafficSignalController {
  constructor() {
    // Current phase & sub-state
    this.phaseIndex = 0;
    this.activePhase = PhaseSequence[this.phaseIndex]; // Starts with NORTH
    this.phaseState = SignalColor.GREEN; // GREEN, AMBER, or ALL_RED

    // Timing parameters (in seconds)
    this.fixedGreenDuration = 14.0;
    this.amberDuration = 3.0;
    this.allRedClearanceDuration = 2.0;

    // Active timer tracking
    this.currentPhaseTargetTime = this.fixedGreenDuration;
    this.phaseElapsedTime = 0;
    this.isAllRedClearance = false;

    // Safety Interlock - Tracks which directions have GREEN
    // Rule: Exactly ONE direction can have GREEN/AMBER. Other 3 MUST be RED!
    this.signals = {
      NORTH: SignalColor.GREEN,
      SOUTH: SignalColor.RED,
      EAST: SignalColor.RED,
      WEST: SignalColor.RED
    };

    // Emergency Green Corridor Request
    this.emergencyRequest = null; // { direction, requestedAt, active }
    this.emergencyActive = false;

    // Next scheduled phase after clearance
    this.nextPhase = Phase.EAST;

    // Interlock integrity check
    this.verifySafetyInterlock();
  }

  reset() {
    this.phaseIndex = 0;
    this.activePhase = PhaseSequence[this.phaseIndex];
    this.phaseState = SignalColor.GREEN;
    this.currentPhaseTargetTime = this.fixedGreenDuration;
    this.phaseElapsedTime = 0;
    this.isAllRedClearance = false;
    this.emergencyRequest = null;
    this.emergencyActive = false;
    this.nextPhase = Phase.EAST;
    this.updateSignalOutputs();
  }

  /**
   * Request an emergency vehicle green corridor
   * @param {string} direction 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'
   */
  requestEmergencyCorridor(direction) {
    console.log(`[SignalController] Emergency corridor requested for: ${direction}`);
    this.emergencyRequest = {
      direction: direction,
      requestedAt: Date.now(),
      active: true
    };

    // Check if the requested direction is ALREADY in green
    if (this.activePhase === direction && this.phaseState === SignalColor.GREEN) {
      // Already green! Hold phase for ambulance
      this.emergencyActive = true;
      this.currentPhaseTargetTime = Math.max(this.currentPhaseTargetTime, 20.0);
    } else {
      // Another direction is currently green! Fast-track clearance
      if (this.phaseState === SignalColor.GREEN) {
        this.triggerAmber();
      }
    }
  }

  releaseEmergencyCorridor() {
    if (this.emergencyActive || this.emergencyRequest) {
      console.log('[SignalController] Emergency vehicle exited. Resuming normal single-arm cycle.');
      this.emergencyRequest = null;
      this.emergencyActive = false;

      // Begin standard amber -> clearance -> next phase
      this.triggerAmber();
    }
  }

  /**
   * Update signal timing in fixed-timestep
   * @param {number} dt Delta time in seconds
   * @param {boolean} isIntersectionClear True if no vehicles are occupying the central box
   * @param {Object} adaptiveTiming Optional adaptive recommendations
   */
  update(dt, isIntersectionClear = true, adaptiveTiming = null) {
    this.phaseElapsedTime += dt;

    // Handle Active Emergency Override
    if (this.emergencyRequest && !this.emergencyActive) {
      // Waiting to clear intersection for emergency direction
      if (this.isAllRedClearance && isIntersectionClear) {
        this.startEmergencyGreen(this.emergencyRequest.direction);
        return;
      }
    }

    // State machine for current phase
    switch (this.phaseState) {
      case SignalColor.GREEN:
        let targetDuration = this.fixedGreenDuration;
        if (adaptiveTiming && adaptiveTiming.recommendedGreenDuration) {
          targetDuration = adaptiveTiming.recommendedGreenDuration;
        }

        // Adaptive early cutoff: if queue is empty and min-green elapsed
        if (adaptiveTiming && adaptiveTiming.requestEarlyCutoff && this.phaseElapsedTime >= adaptiveTiming.minGreen) {
          this.triggerAmber();
          break;
        }

        if (this.phaseElapsedTime >= targetDuration && !this.emergencyActive) {
          this.triggerAmber();
        }
        break;

      case SignalColor.AMBER:
        if (this.phaseElapsedTime >= this.amberDuration) {
          this.triggerAllRedClearance();
        }
        break;

      case SignalColor.ALL_RED:
        // Must wait minimum all-red duration AND confirm intersection is completely physically clear
        if (this.phaseElapsedTime >= this.allRedClearanceDuration && isIntersectionClear) {
          this.transitionToNextPhase(adaptiveTiming);
        }
        break;
    }

    this.updateSignalOutputs();
    this.verifySafetyInterlock();
  }

  triggerAmber() {
    this.phaseState = SignalColor.AMBER;
    this.phaseElapsedTime = 0;
    this.currentPhaseTargetTime = this.amberDuration;
    this.isAllRedClearance = false;
  }

  triggerAllRedClearance() {
    this.phaseState = SignalColor.ALL_RED;
    this.isAllRedClearance = true;
    this.phaseElapsedTime = 0;
    this.currentPhaseTargetTime = this.allRedClearanceDuration;

    // Set ALL 4 signals strictly to RED
    this.signals.NORTH = SignalColor.RED;
    this.signals.SOUTH = SignalColor.RED;
    this.signals.EAST = SignalColor.RED;
    this.signals.WEST = SignalColor.RED;
  }

  startEmergencyGreen(direction) {
    this.emergencyActive = true;
    this.activePhase = direction;
    this.phaseState = SignalColor.GREEN;
    this.isAllRedClearance = false;
    this.phaseElapsedTime = 0;
    this.currentPhaseTargetTime = 22.0; // Dedicated green corridor

    // Release ONLY the emergency direction. Other 3 directions are RED!
    this.signals.NORTH = SignalColor.RED;
    this.signals.SOUTH = SignalColor.RED;
    this.signals.EAST = SignalColor.RED;
    this.signals.WEST = SignalColor.RED;
    this.signals[direction] = SignalColor.GREEN;

    if (window.soundFX) window.soundFX.playSignalChime();
  }

  transitionToNextPhase(adaptiveTiming = null) {
    this.isAllRedClearance = false;
    this.phaseElapsedTime = 0;
    this.phaseState = SignalColor.GREEN;

    if (adaptiveTiming && adaptiveTiming.nextRecommendedPhase) {
      // Adaptive AI picked the next direction based on highest queue
      this.activePhase = adaptiveTiming.nextRecommendedPhase;
      this.phaseIndex = PhaseSequence.indexOf(this.activePhase);
    } else {
      // Standard sequential progression: NORTH -> EAST -> SOUTH -> WEST
      this.phaseIndex = (this.phaseIndex + 1) % PhaseSequence.length;
      this.activePhase = PhaseSequence[this.phaseIndex];
    }

    // Set duration
    if (adaptiveTiming && adaptiveTiming.calculatedDuration) {
      this.currentPhaseTargetTime = adaptiveTiming.calculatedDuration;
    } else {
      this.currentPhaseTargetTime = this.fixedGreenDuration;
    }

    this.updateSignalOutputs();
    if (window.soundFX) window.soundFX.playSignalChime();
  }

  /**
   * Hardware-grade interlock update to guarantee exactly ONE direction has green/amber!
   */
  updateSignalOutputs() {
    // If All-Red Clearance is active, everything is RED
    if (this.isAllRedClearance || this.phaseState === SignalColor.ALL_RED) {
      this.signals.NORTH = SignalColor.RED;
      this.signals.SOUTH = SignalColor.RED;
      this.signals.EAST = SignalColor.RED;
      this.signals.WEST = SignalColor.RED;
      return;
    }

    const activeColor = (this.phaseState === SignalColor.AMBER) ? SignalColor.AMBER : SignalColor.GREEN;

    // Reset all to RED
    this.signals.NORTH = SignalColor.RED;
    this.signals.SOUTH = SignalColor.RED;
    this.signals.EAST = SignalColor.RED;
    this.signals.WEST = SignalColor.RED;

    // ONLY the active direction receives Green or Amber
    if (this.signals[this.activePhase] !== undefined) {
      this.signals[this.activePhase] = activeColor;
    }
  }

  /**
   * Deterministic fail-safe verification.
   * In 1-way single-arm control, at most ONE direction may be non-RED!
   */
  verifySafetyInterlock() {
    let nonRedCount = 0;
    if (this.signals.NORTH !== SignalColor.RED) nonRedCount++;
    if (this.signals.SOUTH !== SignalColor.RED) nonRedCount++;
    if (this.signals.EAST  !== SignalColor.RED) nonRedCount++;
    if (this.signals.WEST  !== SignalColor.RED) nonRedCount++;

    if (nonRedCount > 1) {
      console.error('CRITICAL SAFETY INTERLOCK FAULT: Multiple directions green/amber! Forcing all-red.');
      this.triggerAllRedClearance();
      return false;
    }
    return true;
  }

  getSignalForDirection(direction) {
    return this.signals[direction] || SignalColor.RED;
  }

  getRemainingSeconds() {
    const rem = Math.max(0, this.currentPhaseTargetTime - this.phaseElapsedTime);
    return Math.ceil(rem);
  }

  getActivePhaseDisplayName() {
    if (this.emergencyActive) return 'EMERGENCY CORRIDOR';
    if (this.isAllRedClearance) return 'CLEARANCE (ALL RED)';
    return `${this.activePhase} ONLY`;
  }
}

window.TrafficSignalController = TrafficSignalController;
window.SignalColor = SignalColor;
window.Phase = Phase;
