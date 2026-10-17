/**
 * SimulationEngine - HTML5 Canvas Traffic Simulator
 * Realistic 4-way Indian junction with Left-Hand Traffic (LHT),
 * fixed-timestep physics loop, deterministic collision prevention,
 * reservation interlocks, and dynamic day/night rendering.
 */

class SimulationEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Canvas internal logical resolution
    this.width = 900;
    this.height = 900;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Road Geometry (Center & widths)
    this.cx = 450;
    this.cy = 450;
    this.roadHalfWidth = 100; // Total road width is 200px
    this.laneWidth = 46;      // 2 incoming lanes (46 * 2 = 92px + 8px median)
    this.stopDistance = 100;   // Distance of stop line from center

    // Simulation State
    this.isRunning = false;
    this.isPaused = false;
    this.simSpeed = 1.0;
    this.spawnRatePerMinute = 35; // default 35 veh/min
    this.simMode = 'FIXED';       // 'FIXED' or 'ADAPTIVE'
    this.freeLeftTurnEnabled = true;
    this.isNightMode = true;

    // Fixed-timestep simulation timing
    this.fixedDelta = 1 / 60; // 60 updates per second
    this.accumulator = 0;
    this.lastFrameTime = performance.now();
    this.animFrameId = null;

    // Active entities
    this.vehicles = [];
    this.signalController = new TrafficSignalController();
    this.adaptiveAI = new AdaptiveSignalAI();
    this.stats = new StatisticsEngine();

    // Spawning timers per direction
    this.spawnTimers = {
      NORTH: 0,
      SOUTH: 0,
      EAST: 0,
      WEST: 0
    };

    // Intersection spatial occupancy grid (3x3 conflict cells)
    this.occupancyGrid = Array(9).fill(null);

    // Stop line coordinates
    this.stopLines = {
      NORTH: { x1: this.cx, y1: this.cy - this.stopDistance, x2: this.cx + this.roadHalfWidth, y2: this.cy - this.stopDistance },
      SOUTH: { x1: this.cx - this.roadHalfWidth, y1: this.cy + this.stopDistance, x2: this.cx, y2: this.cy + this.stopDistance },
      EAST:  { x1: this.cx + this.stopDistance, y1: this.cy, x2: this.cx + this.stopDistance, y2: this.cy + this.roadHalfWidth },
      WEST:  { x1: this.cx - this.stopDistance, y1: this.cy - this.roadHalfWidth, x2: this.cx - this.stopDistance, y2: this.cy }
    };

    // AI Red-Light Camera & E-Challan State
    this.violations = [];
    this.cameraFlashTick = 0;
    this.cameraFlashPos = null;
    this.onViolationListeners = [];
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    this.accumulator = 0;
    this.loop(this.lastFrameTime);
  }

  pause() {
    this.isPaused = true;
    if (window.soundFX) window.soundFX.stopSiren();
  }

  resume() {
    if (!this.isRunning) {
      this.start();
      return;
    }
    this.isPaused = false;
    this.lastFrameTime = performance.now();
  }

  reset() {
    this.isRunning = false;
    this.isPaused = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.vehicles = [];
    this.occupancyGrid = Array(9).fill(null);
    this.signalController.reset();
    this.adaptiveAI.reset();
    this.stats.resetCurrentRun();
    this.violations = [];
    this.cameraFlashTick = 0;

    this.spawnTimers = { NORTH: 0, SOUTH: 0, EAST: 0, WEST: 0 };
    if (window.soundFX) window.soundFX.stopSiren();

    // Render clean initial state
    this.render();
  }

  setSpeed(multiplier) {
    this.simSpeed = Math.max(0.25, Math.min(4.0, multiplier));
  }

  setSpawnRate(rate) {
    this.spawnRatePerMinute = Math.max(5, Math.min(100, rate));
  }

  setMode(mode) {
    this.simMode = mode;
    this.signalController.reset();
    this.adaptiveAI.reset();
  }

  setFreeLeftTurn(enabled) {
    this.freeLeftTurnEnabled = enabled;
  }

  toggleNightMode() {
    this.isNightMode = !this.isNightMode;
    return this.isNightMode;
  }

  /**
   * Dispatch an Emergency Ambulance on a selected direction
   */
  spawnEmergencyVehicle(direction) {
    const lane = 0; // Emergency approaches on left/primary lane
    const spawnPos = this.getSpawnCoordinates(direction, lane);

    const ambulance = new Vehicle({
      type: VehicleType.AMBULANCE,
      direction: direction,
      lane: lane,
      route: RouteType.STRAIGHT,
      x: spawnPos.x,
      y: spawnPos.y,
      angle: spawnPos.angle,
      color: '#ffffff'
    });

    this.vehicles.push(ambulance);
    this.signalController.requestEmergencyCorridor(direction);
    if (window.soundFX) window.soundFX.startSiren();
  }

  /**
   * Core requestAnimationFrame loop with fixed-timestep physics
   */
  loop(currentTime) {
    if (!this.isRunning) return;

    const frameDelta = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;

    // Clamp huge frame drops (e.g. background tab) to 0.1s
    const clampedDelta = Math.min(frameDelta, 0.1);

    if (!this.isPaused) {
      this.accumulator += clampedDelta * this.simSpeed;
      while (this.accumulator >= this.fixedDelta) {
        this.updateSimulation(this.fixedDelta);
        this.accumulator -= this.fixedDelta;
      }
    }

    this.render();
    this.animFrameId = requestAnimationFrame((time) => this.loop(time));
  }

  /**
   * Fixed-timestep Simulation Physics Update
   */
  updateSimulation(dt) {
    // 1. Spawning Logic
    this.updateSpawning(dt);

    // 2. Identify Queued Vehicles per Direction
    const queueData = this.groupVehiclesByDirection();

    // 3. Adaptive AI Signals Update
    let adaptiveInfo = null;
    if (this.simMode === 'ADAPTIVE') {
      adaptiveInfo = this.adaptiveAI.evaluate(queueData, this.signalController, dt);
    }

    // 4. Update Signal Controller
    const isBoxEmpty = this.isIntersectionPhysicallyClear();
    this.signalController.update(dt, isBoxEmpty, adaptiveInfo);

    // 5. Update Vehicles Physics & Queuing
    this.updateVehicles(dt);

    // 6. Update Statistics Telemetry
    this.stats.update(dt, this.vehicles);

    // Check emergency clearance
    if (this.signalController.emergencyActive) {
      const activeEmergency = this.vehicles.find(v => v.isEmergency);
      if (!activeEmergency || activeEmergency.hasClearedIntersection) {
        this.signalController.releaseEmergencyCorridor();
        if (window.soundFX) window.soundFX.stopSiren();
      }
    }
  }

  /**
   * Spawning Engine:
   * Uses Poisson-like interval arrival per arm, with strict entry lane spacing guards.
   */
  updateSpawning(dt) {
    const directions = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
    // Target interval per direction: (60s / (spawnRatePerMinute / 4))
    const intervalPerArm = 60 / (this.spawnRatePerMinute / 4);

    directions.forEach(dir => {
      this.spawnTimers[dir] += dt;
      if (this.spawnTimers[dir] >= intervalPerArm) {
        // Attempt spawn
        if (this.canSpawnVehicle(dir)) {
          this.spawnRandomVehicle(dir);
          this.spawnTimers[dir] = 0;
        }
      }
    });
  }

  canSpawnVehicle(direction) {
    // Check if there is an existing vehicle too close to spawn threshold (< 70px)
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.direction === direction) {
        if (direction === 'NORTH' && v.y < 70) return false;
        if (direction === 'SOUTH' && v.y > this.height - 70) return false;
        if (direction === 'WEST'  && v.x < 70) return false;
        if (direction === 'EAST'  && v.x > this.width - 70) return false;
      }
    }
    return true;
  }

  spawnRandomVehicle(direction) {
    // Indian vehicle fleet distribution
    const rand = Math.random();
    let type = VehicleType.CAR;
    if (rand < 0.45) {
      type = VehicleType.CAR;
    } else if (rand < 0.70) {
      type = VehicleType.AUTO;
    } else if (rand < 0.90) {
      type = VehicleType.BIKE;
    } else {
      type = VehicleType.BUS;
    }

    // Lane selection (0: Left lane, 1: Right lane)
    // Left lane handles Free Left Turn (if enabled) & Straight
    // Right lane handles Straight & Right turn
    const lane = (Math.random() < 0.55) ? 0 : 1;

    let route = RouteType.STRAIGHT;
    if (lane === 0 && Math.random() < 0.45) {
      route = RouteType.LEFT; // Left turn from left lane
    } else if (lane === 1 && Math.random() < 0.25) {
      route = RouteType.RIGHT; // Right turn from right lane
    }

    const pos = this.getSpawnCoordinates(direction, lane);
    const vehicle = new Vehicle({
      type: type,
      direction: direction,
      lane: lane,
      route: route,
      x: pos.x,
      y: pos.y,
      angle: pos.angle
    });

    this.vehicles.push(vehicle);
  }

  /**
   * Calculate precise spawn coordinates for Indian Left-Hand Traffic (LHT)
   * On North-South road: Southbound (from North) keeps to left of median -> x in [cx, cx + roadHalfWidth]
   * Northbound (from South) keeps to left of median -> x in [cx - roadHalfWidth, cx]
   * East-West road: Eastbound (from West) keeps to left of median -> y in [cy - roadHalfWidth, cy]
   * Westbound (from East) keeps to left of median -> y in [cy, cy + roadHalfWidth]
   */
  getSpawnCoordinates(direction, lane) {
    const laneOffset = (lane === 0) ? (this.laneWidth * 0.5) : (this.laneWidth * 1.5);

    switch (direction) {
      case 'NORTH':
        // Heading South (+Y). Left-Hand Drive: Left lane is towards outside (East side = cx + 8 + offset)
        return {
          x: this.cx + 6 + (lane === 0 ? 68 : 22),
          y: -40,
          angle: Math.PI / 2
        };
      case 'SOUTH':
        // Heading North (-Y). Left-Hand Drive: Left lane is towards outside (West side = cx - 8 - offset)
        return {
          x: this.cx - 6 - (lane === 0 ? 68 : 22),
          y: this.height + 40,
          angle: -Math.PI / 2
        };
      case 'WEST':
        // Heading East (+X). Left-Hand Drive: Left lane is towards outside (North side = cy - 8 - offset)
        return {
          x: -40,
          y: this.cy - 6 - (lane === 0 ? 68 : 22),
          angle: 0
        };
      case 'EAST':
        // Heading West (-X). Left-Hand Drive: Left lane is towards outside (South side = cy + 8 + offset)
        return {
          x: this.width + 40,
          y: this.cy + 6 + (lane === 0 ? 68 : 22),
          angle: Math.PI
        };
    }
  }

  /**
   * Group approaching vehicles by incoming direction for queue sensors
   */
  groupVehiclesByDirection() {
    const groups = { NORTH: [], SOUTH: [], EAST: [], WEST: [] };
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (!v.isCommittedToIntersection && groups[v.direction]) {
        groups[v.direction].push(v);
      }
    }
    return groups;
  }

  /**
   * Update all vehicles with safe collision avoidance, queuing, and intersection reservations
   */
  updateVehicles(dt) {
    const geom = { cx: this.cx, cy: this.cy, rw: this.roadHalfWidth };
    const remainingVehicles = [];

    // Sort vehicles by distance along path so leading vehicles update first
    this.vehicles.sort((a, b) => this.getDistanceToStopLine(a) - this.getDistanceToStopLine(b));

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];

      // 1. Determine vehicle's desired target speed
      const targetSpeed = this.calculateTargetSpeed(v);

      // Track if entering intersection on this frame
      const wasCommitted = v.isCommittedToIntersection;

      // 2. Physics & path integration
      v.update(dt, targetSpeed, geom);

      // 3. AI Speed & Red-Light Camera Detection: Check if vehicle breached stop line on RED!
      if (!wasCommitted && v.isCommittedToIntersection) {
        const signal = this.signalController.getSignalForDirection(v.direction);
        const isFreeLeftTurn = (
          this.freeLeftTurnEnabled &&
          v.route === RouteType.LEFT &&
          v.lane === 0
        );

        if ((signal === SignalColor.RED || signal === SignalColor.AMBER) && !isFreeLeftTurn && !v.isEmergency) {
          v.hasViolatedRedLight = true;
          this.recordViolation(v);
        }
      }

      // 4. Check if out of bounds (completed route)
      if (v.isOutOfBounds(this.width, this.height)) {
        this.stats.recordVehicleExit(v);
      } else {
        remainingVehicles.push(v);
      }
    }

    this.vehicles = remainingVehicles;
  }

  /**
   * Compute safe driving speed for vehicle based on:
   * - Leading vehicle ahead in same lane (bumper gap)
   * - Traffic signal state & stop line
   * - Intersection clearance & free left turn
   */
  calculateTargetSpeed(v) {
    let desiredSpeed = v.maxSpeed;

    // 1. Check distance to leading vehicle in the same lane & direction
    const leader = this.getLeadingVehicle(v);
    if (leader) {
      const gap = this.getDistanceBetween(v, leader) - (v.length / 2 + leader.length / 2);
      const safeFollowingGap = 16 + v.currentSpeed * 10;

      if (gap <= 8) {
        // Emergency stop if bumper touching
        return 0;
      } else if (gap < safeFollowingGap) {
        // Match speed with smooth deceleration
        const speedRatio = Math.max(0, (gap - 8) / (safeFollowingGap - 8));
        desiredSpeed = Math.min(desiredSpeed, leader.currentSpeed * speedRatio);
      }
    }

    // 2. Traffic Signal & Stop Line Check (if not already past the stop line)
    if (!v.isCommittedToIntersection) {
      const distToStop = this.getDistanceToStopLine(v);

      // Free Left Turn Check (Indian Traffic Rule)
      const isFreeLeftTurn = (
        this.freeLeftTurnEnabled &&
        v.route === RouteType.LEFT &&
        v.lane === 0
      );

      const signal = this.signalController.getSignalForDirection(v.direction);

      if (isFreeLeftTurn) {
        // Left-turning vehicles can proceed on Red if merging path is clear!
        // Slow down to caution speed (1.0) when approaching stop line
        if (distToStop > 0 && distToStop < 40) {
          desiredSpeed = Math.min(desiredSpeed, 1.2);
        }
      } else {
        // Standard signal compliance
        if (signal === SignalColor.RED || signal === SignalColor.AMBER) {
          if (v.isForcedViolator) {
            // Aggressive driver jumps red light!
            desiredSpeed = v.maxSpeed * 1.15;
          } else {
            // Must stop before the stop line
            if (distToStop > 0 && distToStop < 90) {
              if (distToStop <= 10) {
                return 0; // Stop firmly behind line
              }
              // Decelerate smoothly to stop line
              const brakingFactor = (distToStop - 10) / 80;
              desiredSpeed = Math.min(desiredSpeed, v.maxSpeed * brakingFactor * 0.7);
            }
          }
        }
      }
    }

    // 3. Central Intersection Collision Interlock ("Don't block the box")
    if (v.isCommittedToIntersection && !v.hasClearedIntersection) {
      // Check if conflicting trajectory is crossing immediately in front
      const conflictingVehicle = this.getConflictingVehicleInBox(v);
      if (conflictingVehicle) {
        desiredSpeed = Math.min(desiredSpeed, 0.4);
      }
    }

    return Math.max(0, desiredSpeed);
  }

  getLeadingVehicle(vehicle) {
    let closestLeader = null;
    let minDistance = Infinity;

    for (let i = 0; i < this.vehicles.length; i++) {
      const other = this.vehicles[i];
      if (other.id === vehicle.id) continue;

      // Must be same incoming approach & lane (if approaching)
      if (!vehicle.isCommittedToIntersection) {
        if (other.direction === vehicle.direction && other.lane === vehicle.lane) {
          const dist = this.getDistanceAlongLane(vehicle, other);
          if (dist > 0 && dist < minDistance) {
            minDistance = dist;
            closestLeader = other;
          }
        }
      }
    }
    return closestLeader;
  }

  getDistanceAlongLane(vA, vB) {
    switch (vA.direction) {
      case 'NORTH': return vB.y - vA.y;
      case 'SOUTH': return vA.y - vB.y;
      case 'WEST':  return vB.x - vA.x;
      case 'EAST':  return vA.x - vB.x;
      default: return Infinity;
    }
  }

  getDistanceBetween(vA, vB) {
    const dx = vA.x - vB.x;
    const dy = vA.y - vB.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getDistanceToStopLine(v) {
    const buffer = v.length / 2; // Front bumper offset based on vehicle heading length
    switch (v.direction) {
      case 'NORTH': return (this.cy - this.stopDistance) - (v.y + buffer);
      case 'SOUTH': return (v.y - buffer) - (this.cy + this.stopDistance);
      case 'WEST':  return (this.cx - this.stopDistance) - (v.x + buffer);
      case 'EAST':  return (v.x - buffer) - (this.cx + this.stopDistance);
      default: return 999;
    }
  }

  /**
   * Check if any vehicle is currently inside the central box
   */
  isIntersectionPhysicallyClear() {
    const margin = 20;
    const minX = this.cx - this.roadHalfWidth - margin;
    const maxX = this.cx + this.roadHalfWidth + margin;
    const minY = this.cy - this.roadHalfWidth - margin;
    const maxY = this.cy + this.roadHalfWidth + margin;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.isCommittedToIntersection && !v.hasClearedIntersection) {
        if (v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY) {
          return false;
        }
      }
    }
    return true;
  }

  getConflictingVehicleInBox(v) {
    for (let i = 0; i < this.vehicles.length; i++) {
      const other = this.vehicles[i];
      if (other.id === v.id) continue;
      if (other.isCommittedToIntersection && !other.hasClearedIntersection) {
        // Cross directions
        const isCross = (
          (v.direction === 'NORTH' || v.direction === 'SOUTH') &&
          (other.direction === 'EAST' || other.direction === 'WEST')
        );
        if (isCross) {
          const dist = this.getDistanceBetween(v, other);
          if (dist < 55) {
            return other;
          }
        }
      }
    }
    return null;
  }

  /**
   * Canvas Rendering: Rich Dark Navy Junction Graphics
   */
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Ground & Grass/Sidewalk Background
    this.renderGround(ctx);

    // 2. Asphalt Roadways
    this.renderRoads(ctx);

    // 3. Road Markings (Zebra crossings, stop lines, lane dividers, directional arrows)
    this.renderMarkings(ctx);

    // 4. Yellow Box Junction ("Do Not Block The Box" - Indian Smart Junction standard)
    this.renderYellowBox(ctx);

    // 5. Vehicles (drawn with shadows, headlights, and fleet details)
    for (let i = 0; i < this.vehicles.length; i++) {
      this.vehicles[i].render(ctx, this.isNightMode);
    }

    // 6. Overhead Traffic Signal Gantries & Countdown Displays
    this.renderSignalGantries(ctx);

    // 7. Ambient Lighting (Night Mode Dark Vignette & Streetlights)
    if (this.isNightMode) {
      this.renderNightAmbient(ctx);
    }

    // 8. AI Red-Light Camera Flash FX & Crosshair
    if (this.cameraFlashTick > 0 && this.cameraFlashPos) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${this.cameraFlashTick * 2.2})`;
      ctx.beginPath();
      ctx.arc(this.cameraFlashPos.x, this.cameraFlashPos.y, 85, 0, Math.PI * 2);
      ctx.fill();

      // Red laser targeting crosshair
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 14;
      ctx.strokeRect(this.cameraFlashPos.x - 32, this.cameraFlashPos.y - 32, 64, 64);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ E-CHALLAN CAPTURED', this.cameraFlashPos.x, this.cameraFlashPos.y - 40);
      ctx.restore();

      this.cameraFlashTick -= 0.04;
    }
  }

  recordViolation(v) {
    const violation = {
      id: `ECH-${Math.floor(1000 + Math.random() * 9000)}`,
      plateNumber: v.plateNumber,
      vehicleType: v.type.name,
      direction: v.direction,
      speedKmph: Math.round(v.maxSpeed * 22),
      fineAmount: 1000, // ₹1,000 for signal jump under Indian MV Act
      timestamp: Date.now(),
      timeStr: new Date().toLocaleTimeString()
    };

    this.violations.unshift(violation);
    if (this.violations.length > 25) this.violations.pop();

    this.cameraFlashTick = 0.45;
    this.cameraFlashPos = { x: v.x, y: v.y };

    if (window.soundFX) window.soundFX.playCameraShutter();
    if (window.firebaseManager) window.firebaseManager.saveViolation(violation);

    this.onViolationListeners.forEach(cb => {
      try { cb(violation, this.violations); } catch (e) {}
    });
  }

  onViolation(callback) {
    this.onViolationListeners.push(callback);
  }

  simulateRedLightJump(direction) {
    if (!direction) {
      const redDirs = ['NORTH', 'EAST', 'SOUTH', 'WEST'].filter(
        d => this.signalController.getSignalForDirection(d) === SignalColor.RED
      );
      direction = redDirs[Math.floor(Math.random() * redDirs.length)] || 'NORTH';
    }

    // Find approaching vehicle on that direction or spawn one
    const candidate = this.vehicles.find(
      v => v.direction === direction && !v.isCommittedToIntersection && !v.isEmergency
    );

    if (candidate) {
      candidate.isForcedViolator = true;
      candidate.route = RouteType.STRAIGHT;
    } else {
      const spawnPos = this.getSpawnCoordinates(direction, 0);
      const violator = new Vehicle({
        type: VehicleType.CAR,
        direction: direction,
        lane: 0,
        route: RouteType.STRAIGHT,
        x: spawnPos.x,
        y: spawnPos.y,
        angle: spawnPos.angle,
        isForcedViolator: true
      });
      this.vehicles.push(violator);
    }
  }

  renderGround(ctx) {
    // Sidewalk/Urban ground color
    ctx.fillStyle = this.isNightMode ? '#0a101d' : '#1e293b';
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle corner landscaping / pedestrian pavements
    ctx.fillStyle = this.isNightMode ? '#0d1628' : '#334155';
    // NW Pavement
    ctx.fillRect(0, 0, this.cx - this.roadHalfWidth, this.cy - this.roadHalfWidth);
    // NE Pavement
    ctx.fillRect(this.cx + this.roadHalfWidth, 0, this.width, this.cy - this.roadHalfWidth);
    // SW Pavement
    ctx.fillRect(0, this.cy + this.roadHalfWidth, this.cx - this.roadHalfWidth, this.height);
    // SE Pavement
    ctx.fillRect(this.cx + this.roadHalfWidth, this.cy + this.roadHalfWidth, this.width, this.height);
  }

  renderRoads(ctx) {
    ctx.fillStyle = this.isNightMode ? '#101726' : '#1e2638';

    // North-South Vertical Road
    ctx.fillRect(this.cx - this.roadHalfWidth, 0, this.roadHalfWidth * 2, this.height);

    // East-West Horizontal Road
    ctx.fillRect(0, this.cy - this.roadHalfWidth, this.width, this.roadHalfWidth * 2);

    // Realistic Indian Alternating Yellow & Black Safety Curbs along corners
    this.renderIndianKerbstones(ctx);
  }

  renderIndianKerbstones(ctx) {
    const rL = this.cx - this.roadHalfWidth;
    const rR = this.cx + this.roadHalfWidth;
    const rT = this.cy - this.roadHalfWidth;
    const rB = this.cy + this.roadHalfWidth;
    const kerbSize = 8;
    const segLen = 16;

    // Corner kerb drawing helper
    const drawKerbStrip = (x1, y1, x2, y2, isVert) => {
      const len = isVert ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
      const steps = Math.floor(len / segLen);
      for (let i = 0; i < steps; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#eab308' : '#0f172a'; // Yellow & Black
        if (isVert) {
          const sy = Math.min(y1, y2) + i * segLen;
          ctx.fillRect(x1 - (x1 < this.cx ? kerbSize : 0), sy, kerbSize, segLen);
        } else {
          const sx = Math.min(x1, x2) + i * segLen;
          ctx.fillRect(sx, y1 - (y1 < this.cy ? kerbSize : 0), segLen, kerbSize);
        }
      }
    };

    // NW Kerbs
    drawKerbStrip(0, rT, rL, rT, false);
    drawKerbStrip(rL, 0, rL, rT, true);

    // NE Kerbs
    drawKerbStrip(rR, rT, this.width, rT, false);
    drawKerbStrip(rR, 0, rR, rT, true);

    // SW Kerbs
    drawKerbStrip(0, rB, rL, rB, false);
    drawKerbStrip(rL, rB, rL, this.height, true);

    // SE Kerbs
    drawKerbStrip(rR, rB, this.width, rB, false);
    drawKerbStrip(rR, rB, rR, this.height, true);
  }

  renderMarkings(ctx) {
    const rw = this.roadHalfWidth;
    const cx = this.cx;
    const cy = this.cy;

    // 1. Center Medians (Solid double yellow lines dividing oncoming traffic)
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 3;

    // North median
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, cy - rw);
    ctx.stroke();

    // South median
    ctx.beginPath();
    ctx.moveTo(cx, cy + rw);
    ctx.lineTo(cx, this.height);
    ctx.stroke();

    // West median
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(cx - rw, cy);
    ctx.stroke();

    // East median
    ctx.beginPath();
    ctx.moveTo(cx + rw, cy);
    ctx.lineTo(this.width, cy);
    ctx.stroke();

    // 2. Broken White Lane Dividers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 14]);

    // North incoming lane divider (LHD Southbound on East side: x = cx + 46)
    ctx.beginPath(); ctx.moveTo(cx + 46, 0); ctx.lineTo(cx + 46, cy - rw); ctx.stroke();
    // North outgoing lane divider (LHD Northbound on West side: x = cx - 46)
    ctx.beginPath(); ctx.moveTo(cx - 46, 0); ctx.lineTo(cx - 46, cy - rw); ctx.stroke();

    // South incoming lane divider (LHD Northbound on West side: x = cx - 46)
    ctx.beginPath(); ctx.moveTo(cx - 46, cy + rw); ctx.lineTo(cx - 46, this.height); ctx.stroke();
    // South outgoing lane divider (LHD Southbound on East side: x = cx + 46)
    ctx.beginPath(); ctx.moveTo(cx + 46, cy + rw); ctx.lineTo(cx + 46, this.height); ctx.stroke();

    // West incoming lane divider (LHD Eastbound on North side: y = cy - 46)
    ctx.beginPath(); ctx.moveTo(0, cy - 46); ctx.lineTo(cx - rw, cy - 46); ctx.stroke();
    // West outgoing lane divider (LHD Westbound on South side: y = cy + 46)
    ctx.beginPath(); ctx.moveTo(0, cy + 46); ctx.lineTo(cx - rw, cy + 46); ctx.stroke();

    // East incoming lane divider (LHD Westbound on South side: y = cy + 46)
    ctx.beginPath(); ctx.moveTo(cx + rw, cy + 46); ctx.lineTo(this.width, cy + 46); ctx.stroke();
    // East outgoing lane divider (LHD Eastbound on North side: y = cy - 46)
    ctx.beginPath(); ctx.moveTo(cx + rw, cy - 46); ctx.lineTo(this.width, cy - 46); ctx.stroke();

    ctx.setLineDash([]); // Reset line dash

    // 3. Stop Lines with Dynamic Signal Glow
    ctx.lineWidth = 5;

    // Helper to draw stop line with signal status color
    const drawStopLine = (x1, y1, x2, y2, dir) => {
      const sig = this.signalController.getSignalForDirection(dir);
      const isRed = (sig === SignalColor.RED || sig === SignalColor.AMBER);
      ctx.strokeStyle = isRed ? '#ff4d6d' : '#00e676';
      ctx.shadowColor = isRed ? '#ff4d6d' : '#00e676';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    // North Stop Line
    drawStopLine(cx, cy - rw, cx + rw, cy - rw, 'NORTH');
    // South Stop Line
    drawStopLine(cx - rw, cy + rw, cx, cy + rw, 'SOUTH');
    // West Stop Line
    drawStopLine(cx - rw, cy - rw, cx - rw, cy, 'WEST');
    // East Stop Line
    drawStopLine(cx + rw, cy, cx + rw, cy + rw, 'EAST');

    // 4. Zebra Crossings (Pedestrian Walkways)
    this.renderZebraCrossings(ctx);

    // 5. Directional Arrow Markings on Incoming Lanes
    this.renderRoadArrows(ctx);
  }

  renderZebraCrossings(ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    const stripeW = 8;
    const stripeGap = 6;
    const crossDepth = 18;
    const rw = this.roadHalfWidth;

    // North Zebra (y: cy - rw - 22 to cy - rw - 4)
    for (let x = this.cx - rw + 6; x < this.cx + rw - 6; x += stripeW + stripeGap) {
      ctx.fillRect(x, this.cy - rw - crossDepth - 4, stripeW, crossDepth);
    }
    // South Zebra
    for (let x = this.cx - rw + 6; x < this.cx + rw - 6; x += stripeW + stripeGap) {
      ctx.fillRect(x, this.cy + rw + 4, stripeW, crossDepth);
    }
    // West Zebra
    for (let y = this.cy - rw + 6; y < this.cy + rw - 6; y += stripeW + stripeGap) {
      ctx.fillRect(this.cx - rw - crossDepth - 4, y, crossDepth, stripeW);
    }
    // East Zebra
    for (let y = this.cy - rw + 6; y < this.cy + rw - 6; y += stripeW + stripeGap) {
      ctx.fillRect(this.cx + rw + 4, y, crossDepth, stripeW);
    }
  }

  renderRoadArrows(ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = 'bold 10px Inter, sans-serif';

    // North Approach Text (Southbound traffic moving downwards)
    ctx.fillText('FREE LEFT ↳', this.cx + 48, this.cy - this.roadHalfWidth - 45);
    ctx.fillText('STRAIGHT ↓', this.cx + 6, this.cy - this.roadHalfWidth - 45);

    // South Approach Text (Northbound traffic moving upwards)
    ctx.fillText('FREE LEFT ↵', this.cx - 88, this.cy + this.roadHalfWidth + 55);
    ctx.fillText('STRAIGHT ↑', this.cx - 40, this.cy + this.roadHalfWidth + 55);

    // Direction Cardinal Labels on Pavement
    ctx.fillStyle = 'rgba(0, 242, 254, 0.45)';
    ctx.font = 'bold 16px Outfit, sans-serif';
    ctx.fillText('NORTH', this.cx + 120, 40);
    ctx.fillText('SOUTH', this.cx - 190, this.height - 30);
    ctx.fillText('EAST', this.width - 60, this.cy + 130);
    ctx.fillText('WEST', 20, this.cy - 120);
  }

  renderYellowBox(ctx) {
    // Yellow criss-cross box junction marking in center intersection
    const rw = this.roadHalfWidth;
    const x = this.cx - rw;
    const y = this.cy - rw;
    const size = rw * 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.35)';
    ctx.lineWidth = 1.5;

    ctx.strokeRect(x, y, size, size);

    ctx.beginPath();
    // Diagonal lines across the box
    for (let offset = 20; offset < size * 2; offset += 30) {
      // First diagonal set
      ctx.moveTo(x + offset, y);
      ctx.lineTo(x, y + offset);
      // Second diagonal set
      ctx.moveTo(x + size - offset, y);
      ctx.lineTo(x + size, y + offset);
    }
    ctx.clip(new Path2D(`M${x} ${y} h${size} v${size} h${-size} Z`));
    ctx.stroke();
    ctx.restore();
  }

  renderSignalGantries(ctx) {
    const rw = this.roadHalfWidth;
    const cx = this.cx;
    const cy = this.cy;
    const remSeconds = this.signalController.getRemainingSeconds();

    // North Signal Gantry (controls Southbound traffic)
    this.drawSignalHead(ctx, cx + rw + 15, cy - rw - 15, this.signalController.getSignalForDirection('NORTH'), remSeconds, 'NORTH');

    // South Signal Gantry (controls Northbound traffic)
    this.drawSignalHead(ctx, cx - rw - 45, cy + rw + 15, this.signalController.getSignalForDirection('SOUTH'), remSeconds, 'SOUTH');

    // East Signal Gantry (controls Westbound traffic)
    this.drawSignalHead(ctx, cx + rw + 15, cy + rw + 15, this.signalController.getSignalForDirection('EAST'), remSeconds, 'EAST');

    // West Signal Gantry (controls Eastbound traffic)
    this.drawSignalHead(ctx, cx - rw - 45, cy - rw - 45, this.signalController.getSignalForDirection('WEST'), remSeconds, 'WEST');
  }

  drawSignalHead(ctx, x, y, signalColor, seconds, label) {
    const boxW = 34;
    const boxH = 74;

    // Signal Housing Box
    ctx.fillStyle = '#0a0f1d';
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const lampRadius = 7;
    const lampX = x + boxW / 2;

    // 1. RED LAMP (with shape symbol 'X' for colorblind readability)
    const isRed = (signalColor === SignalColor.RED);
    ctx.fillStyle = isRed ? '#ef4444' : '#331015';
    if (isRed) { ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.arc(lampX, y + 16, lampRadius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // 2. AMBER LAMP (Diamond symbol)
    const isAmber = (signalColor === SignalColor.AMBER);
    ctx.fillStyle = isAmber ? '#ffb300' : '#332408';
    if (isAmber) { ctx.shadowColor = '#ffb300'; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.arc(lampX, y + 36, lampRadius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // 3. GREEN LAMP (Circle symbol)
    const isGreen = (signalColor === SignalColor.GREEN);
    ctx.fillStyle = isGreen ? '#00e676' : '#052b17';
    if (isGreen) { ctx.shadowColor = '#00e676'; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.arc(lampX, y + 56, lampRadius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Countdown Timer Bubble attached to Signal
    ctx.fillStyle = 'rgba(14, 23, 42, 0.9)';
    ctx.beginPath();
    ctx.roundRect(x - 2, y + boxH + 4, boxW + 4, 18, 4);
    ctx.fill();
    ctx.strokeStyle = isGreen ? '#00e676' : (isAmber ? '#ffb300' : '#ef4444');
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${seconds}s`, lampX, y + boxH + 17);
    ctx.textAlign = 'left';
  }

  renderNightAmbient(ctx) {
    // Soft dark gradient overlay for night realism
    const radial = ctx.createRadialGradient(this.cx, this.cy, 180, this.cx, this.cy, 520);
    radial.addColorStop(0, 'rgba(0, 0, 0, 0)');
    radial.addColorStop(1, 'rgba(4, 7, 14, 0.45)');

    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, this.width, this.height);

    // Warm Halos for 4 Corner Streetlights
    const rw = this.roadHalfWidth;
    const corners = [
      { x: this.cx - rw - 18, y: this.cy - rw - 18 },
      { x: this.cx + rw + 18, y: this.cy - rw - 18 },
      { x: this.cx - rw - 18, y: this.cy + rw + 18 },
      { x: this.cx + rw + 18, y: this.cy + rw + 18 }
    ];

    corners.forEach(c => {
      // Light pole
      ctx.fillStyle = '#64748b';
      ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2); ctx.fill();

      // Soft warm amber streetlight halo
      const lightHalo = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 55);
      lightHalo.addColorStop(0, 'rgba(253, 224, 71, 0.4)');
      lightHalo.addColorStop(0.5, 'rgba(253, 224, 71, 0.12)');
      lightHalo.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = lightHalo;
      ctx.beginPath(); ctx.arc(c.x, c.y, 55, 0, Math.PI * 2); ctx.fill();
    });
  }
}

window.SimulationEngine = SimulationEngine;
