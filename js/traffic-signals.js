/**
 * TrafficSignalController
 * Safe phase transitions, fail-safe interlocks, all-red clearance,
 * countdown timers, and emergency corridor overrides.
 */

// Signal light states
const SignalColor = {
  RED: 'RED',
  AMBER: 'AMBER',
  GREEN: 'GREEN'
};

// Intersection movement phases
const Phase = {
  NORTH_SOUTH: 'NORTH_SOUTH',
  EAST_WEST: 'EAST_WEST',
  EMERGENCY_OVERRIDE: 'EMERGENCY_OVERRIDE'
};

class TrafficSignalController {
  constructor() {
    // Current phase & sub-state
    this.activePhase = Phase.NORTH_SOUTH;
    this.phaseState = SignalColor.GREEN; // Current sub-state of active phase: GREEN, AMBER, or ALL_RED

    // Timing parameters (in seconds)
    this.fixedGreenDuration = 18.0;
    this.amberDuration = 3.5;
    this.allRedClearanceDuration = 2.5;

    // Active timer tracking
    this.currentPhaseTargetTime = this.fixedGreenDuration;
    this.phaseElapsedTime = 0;
    this.isAllRedClearance = false;

    // Safety Interlock - Tracks which directions have GREEN
    // Rule: Conflicting pairs can NEVER be green simultaneously
    this.signals = {
      NORTH: SignalColor.GREEN,
      SOUTH: SignalColor.GREEN,
      EAST: SignalColor.RED,
      WEST: SignalColor.RED
    };

    // Emergency Green Corridor Request
    this.emergencyRequest = null; // { direction, requestedAt, active }
    this.emergencyActive = false;
    this.originalPhaseBeforeEmergency = null;

    // Next scheduled phase after clearance
    this.nextPhase = Phase.EAST_WEST;

    // Interlock integrity check
    this.verifySafetyInterlock();
  }

  reset() {
    this.activePhase = Phase.NORTH_SOUTH;
    this.phaseState = SignalColor.GREEN;
    this.currentPhaseTargetTime = this.fixedGreenDuration;
    this.phaseElapsedTime = 0;
    this.isAllRedClearance = false;
    this.emergencyRequest = null;
    this.emergencyActive = false;
    this.nextPhase = Phase.EAST_WEST;
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
    const isNs = (direction === 'NORTH' || direction === 'SOUTH');
    const isCurrentNs = (this.activePhase === Phase.NORTH_SOUTH);

    if (isCurrentNs === isNs && this.phaseState === SignalColor.GREEN) {
      // Already green! Keep green and hold phase for ambulance
      this.emergencyActive = true;
      this.currentPhaseTargetTime = Math.max(this.currentPhaseTargetTime, 20.0);
    } else {
      // Conflicting phase is active! Fast-track clearance
      if (this.phaseState === SignalColor.GREEN) {
        // Immediately switch to amber to begin safe clearance
        this.phaseState = SignalColor.AMBER;
        this.phaseElapsedTime = 0;
        this.currentPhaseTargetTime = this.amberDuration;
        this.updateSignalOutputs();
      }
    }
  }

  releaseEmergencyCorridor() {
    if (this.emergencyActive || this.emergencyRequest) {
      console.log('[SignalController] Emergency vehicle exited. Resuming standard signal cycle.');
      this.emergencyRequest = null;
      this.emergencyActive = false;

      // Begin standard amber -> clearance -> alternate phase
      this.phaseState = SignalColor.AMBER;
      this.phaseElapsedTime = 0;
      this.currentPhaseTargetTime = this.amberDuration;
      this.updateSignalOutputs();
    }
  }

  /**
   * Update signal timing in fixed-timestep
   * @param {number} dt Delta time in seconds
   * @param {boolean} isIntersectionClear True if no vehicles are occupying the central box
   * @param {Object} adaptiveTiming Optional adaptive green duration override
   */
  update(dt, isIntersectionClear = true, adaptiveTiming = null) {
    this.phaseElapsedTime += dt;

    // Handle Active Emergency Override
    if (this.emergencyRequest && !this.emergencyActive) {
      // We are waiting to clear the intersection for emergency direction
      if (this.isAllRedClearance && isIntersectionClear) {
        this.startEmergencyGreen(this.emergencyRequest.direction);
        return;
      }
    }

    // State machine for current phase
    switch (this.phaseState) {
      case SignalColor.GREEN:
        // Check if green time elapsed or adaptive early cutoff requested
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
          // Transition to ALL-RED Clearance
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
    // Set all signals strictly to RED
    this.signals.NORTH = SignalColor.RED;
    this.signals.SOUTH = SignalColor.RED;
    this.signals.EAST = SignalColor.RED;
    this.signals.WEST = SignalColor.RED;
  }

  startEmergencyGreen(direction) {
    this.emergencyActive = true;
    this.activePhase = Phase.EMERGENCY_OVERRIDE;
    this.phaseState = SignalColor.GREEN;
    this.isAllRedClearance = false;
    this.phaseElapsedTime = 0;
    this.currentPhaseTargetTime = 25.0; // Ample green corridor

    // Release only the emergency direction and its parallel non-conflicting direction
    if (direction === 'NORTH' || direction === 'SOUTH') {
      this.signals.NORTH = SignalColor.GREEN;
      this.signals.SOUTH = SignalColor.GREEN;
      this.signals.EAST = SignalColor.RED;
      this.signals.WEST = SignalColor.RED;
    } else {
      this.signals.NORTH = SignalColor.RED;
      this.signals.SOUTH = SignalColor.RED;
      this.signals.EAST = SignalColor.GREEN;
      this.signals.WEST = SignalColor.GREEN;
    }

    if (window.soundFX) window.soundFX.playSignalChime();
  }

  transitionToNextPhase(adaptiveTiming = null) {
    this.isAllRedClearance = false;
    this.phaseElapsedTime = 0;
    this.phaseState = SignalColor.GREEN;

    // Alternate phases or set according to nextPhase
    if (this.activePhase === Phase.NORTH_SOUTH) {
      this.activePhase = Phase.EAST_WEST;
      this.nextPhase = Phase.NORTH_SOUTH;
    } else {
      this.activePhase = Phase.NORTH_SOUTH;
      this.nextPhase = Phase.EAST_WEST;
    }

    if (adaptiveTiming && adaptiveTiming.calculatedDuration) {
      this.currentPhaseTargetTime = adaptiveTiming.calculatedDuration;
    } else {
      this.currentPhaseTargetTime = this.fixedGreenDuration;
    }

    this.updateSignalOutputs();
    if (window.soundFX) window.soundFX.playSignalChime();
  }

  /**
   * Hardware-grade interlock update to guarantee no cross-conflicts
   */
  updateSignalOutputs() {
    if (this.isAllRedClearance || this.phaseState === SignalColor.ALL_RED) {
      this.signals.NORTH = SignalColor.RED;
      this.signals.SOUTH = SignalColor.RED;
      this.signals.EAST = SignalColor.RED;
      this.signals.WEST = SignalColor.RED;
      return;
    }

    if (this.activePhase === Phase.NORTH_SOUTH) {
      const activeColor = (this.phaseState === SignalColor.AMBER) ? SignalColor.AMBER : SignalColor.GREEN;
      this.signals.NORTH = activeColor;
      this.signals.SOUTH = activeColor;
      // Conflicting cross street must be RED
      this.signals.EAST = SignalColor.RED;
      this.signals.WEST = SignalColor.RED;
    } else if (this.activePhase === Phase.EAST_WEST) {
      const activeColor = (this.phaseState === SignalColor.AMBER) ? SignalColor.AMBER : SignalColor.GREEN;
      this.signals.EAST = activeColor;
      this.signals.WEST = activeColor;
      // Conflicting cross street must be RED
      this.signals.NORTH = SignalColor.RED;
      this.signals.SOUTH = SignalColor.RED;
    }
  }

  /**
   * Deterministic fail-safe verification.
   * Throws or overrides to all-red if a conflicting state is ever detected.
   */
  verifySafetyInterlock() {
    const isNsGreenOrAmber = (this.signals.NORTH !== SignalColor.RED || this.signals.SOUTH !== SignalColor.RED);
    const isEwGreenOrAmber = (this.signals.EAST !== SignalColor.RED || this.signals.WEST !== SignalColor.RED);

    if (isNsGreenOrAmber && isEwGreenOrAmber) {
      console.error('CRITICAL SAFETY INTERLOCK FAULT: Conflicting green/amber detected! Activating emergency all-red.');
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
    if (this.activePhase === Phase.NORTH_SOUTH) return 'NORTH - SOUTH';
    if (this.activePhase === Phase.EAST_WEST) return 'EAST - WEST';
    return 'STANDBY';
  }
}

window.TrafficSignalController = TrafficSignalController;
window.SignalColor = SignalColor;
window.Phase = Phase;
