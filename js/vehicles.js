/**
 * Vehicle Simulation Model & Indian Fleet
 * Implements Left-Hand Drive (LHD) Indian lane geometry, safe queuing,
 * smooth acceleration/braking, trajectory paths, and visual vehicle rendering.
 */

const VehicleType = {
  CAR: { name: 'Car', width: 22, length: 42, maxSpeed: 2.2, accel: 1.6, decel: 3.2, weight: 0.45 },
  AUTO: { name: 'Auto-Rickshaw', width: 20, length: 30, maxSpeed: 1.8, accel: 1.4, decel: 3.0, weight: 0.25 },
  BIKE: { name: 'Two-Wheeler', width: 12, length: 24, maxSpeed: 2.5, accel: 2.2, decel: 3.8, weight: 0.20 },
  BUS: { name: 'Bus/Heavy', width: 26, length: 62, maxSpeed: 1.5, accel: 1.0, decel: 2.4, weight: 0.10 },
  AMBULANCE: { name: 'Ambulance', width: 24, length: 48, maxSpeed: 3.0, accel: 2.6, decel: 4.2, weight: 0.0 }
};

// Route movements
const RouteType = {
  STRAIGHT: 'STRAIGHT',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT'
};

let vehicleIdCounter = 1;

class Vehicle {
  constructor(config) {
    this.id = vehicleIdCounter++;
    this.type = config.type || VehicleType.CAR;
    this.direction = config.direction; // 'NORTH', 'SOUTH', 'EAST', 'WEST'
    this.lane = config.lane || 0; // 0: Left lane (Outer), 1: Right lane (Inner)
    this.route = config.route || RouteType.STRAIGHT;
    this.color = config.color || this.pickRandomColor();

    this.width = this.type.width;
    this.length = this.type.length;
    this.maxSpeed = this.type.maxSpeed * (0.9 + Math.random() * 0.2); // natural variation
    this.currentSpeed = this.maxSpeed * 0.8;
    this.accel = this.type.accel;
    this.decel = this.type.decel;

    // Spatial coordinates & orientation
    this.x = config.x;
    this.y = config.y;
    this.angle = config.angle; // Heading angle in radians

    // State flags
    this.isCommittedToIntersection = false;
    this.hasClearedIntersection = false;
    this.isEmergency = (this.type.name === 'Ambulance');
    this.isWaiting = false;
    this.waitingTime = 0;
    this.totalWaitTime = 0;
    this.spawnTime = performance.now();

    // Turn tracking
    this.turnProgress = 0;
    this.originalDirection = this.direction;

    // Siren strobe phase for emergency
    this.strobeTick = 0;
  }

  pickRandomColor() {
    if (this.type === VehicleType.AUTO) {
      return '#eab308'; // Auto-Rickshaw iconic yellow
    }
    if (this.type === VehicleType.AMBULANCE) {
      return '#ffffff';
    }
    if (this.type === VehicleType.BUS) {
      const busColors = ['#dc2626', '#2563eb', '#16a34a', '#d97706'];
      return busColors[Math.floor(Math.random() * busColors.length)];
    }
    const colors = [
      '#38bdf8', '#60a5fa', '#f87171', '#34d399',
      '#facc15', '#a78bfa', '#f43f5e', '#e2e8f0', '#94a3b8'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Update vehicle physics and progress along path
   * @param {number} dt delta time in seconds
   * @param {number} targetSpeed determined by leading vehicle & signal
   * @param {Object} intersectionGeometry bounds and centers
   */
  update(dt, targetSpeed, intersectionGeometry) {
    // Smooth acceleration & deceleration
    if (this.currentSpeed < targetSpeed) {
      this.currentSpeed = Math.min(targetSpeed, this.currentSpeed + this.accel * dt * 2.5);
    } else if (this.currentSpeed > targetSpeed) {
      this.currentSpeed = Math.max(targetSpeed, this.currentSpeed - this.decel * dt * 3.0);
    }

    // Accumulate waiting time if vehicle is stopped (< 0.15 px/frame)
    if (this.currentSpeed < 0.15) {
      this.isWaiting = true;
      this.waitingTime += dt;
      this.totalWaitTime += dt;
    } else {
      this.isWaiting = false;
    }

    // Advance position based on heading
    const distance = this.currentSpeed * dt * 60; // scale to 60fps base
    this.advanceAlongRoute(distance, intersectionGeometry);

    if (this.isEmergency) {
      this.strobeTick += dt * 8;
    }
  }

  /**
   * Move vehicle straight or through turn curves
   */
  advanceAlongRoute(distance, geom) {
    const { cx, cy, rw } = geom;

    // Check if entering intersection
    if (!this.isCommittedToIntersection) {
      const inBox = (
        this.x >= cx - rw && this.x <= cx + rw &&
        this.y >= cy - rw && this.y <= cy + rw
      );
      if (inBox) {
        this.isCommittedToIntersection = true;
      }
    }

    // Check if cleared intersection
    if (this.isCommittedToIntersection && !this.hasClearedIntersection) {
      let cleared = false;
      if (this.direction === 'NORTH' && this.y > cy + rw) cleared = true;
      if (this.direction === 'SOUTH' && this.y < cy - rw) cleared = true;
      if (this.direction === 'WEST'  && this.x > cx + rw) cleared = true;
      if (this.direction === 'EAST'  && this.x < cx - rw) cleared = true;

      // Also account for completed turns
      if (this.route === RouteType.LEFT && this.turnProgress >= 1.0) cleared = true;
      if (this.route === RouteType.RIGHT && this.turnProgress >= 1.0) cleared = true;

      if (cleared) {
        this.hasClearedIntersection = true;
      }
    }

    // Handling Turning Movement (Left Turn in LHD is inside curve; Right Turn is across traffic)
    if (this.isCommittedToIntersection && this.route === RouteType.LEFT && this.turnProgress < 1.0) {
      this.executeLeftTurn(distance, geom);
      return;
    }

    if (this.isCommittedToIntersection && this.route === RouteType.RIGHT && this.turnProgress < 1.0) {
      this.executeRightTurn(distance, geom);
      return;
    }

    // Standard Straight Movement
    this.x += Math.cos(this.angle) * distance;
    this.y += Math.sin(this.angle) * distance;
  }

  /**
   * Execute smooth 90-degree Left Turn (LHD Indian Rule)
   * Left turn is a compact inside arc
   */
  executeLeftTurn(distance, geom) {
    const turnRadius = 45;
    const arcLength = (Math.PI / 2) * turnRadius;
    const progressDelta = distance / arcLength;

    this.turnProgress = Math.min(1.0, this.turnProgress + progressDelta);

    const baseAngle = this.getDirectionBaseAngle(this.originalDirection);
    // Left turn in LHD is turning counter-clockwise (angle decreases by PI/2)
    this.angle = baseAngle - (this.turnProgress * Math.PI / 2);

    // Advance along the arc
    this.x += Math.cos(this.angle) * distance;
    this.y += Math.sin(this.angle) * distance;
  }

  /**
   * Execute smooth 90-degree Right Turn
   * Right turn in LHD crosses center to far lane (clockwise, angle increases by PI/2)
   */
  executeRightTurn(distance, geom) {
    const turnRadius = 75;
    const arcLength = (Math.PI / 2) * turnRadius;
    const progressDelta = distance / arcLength;

    this.turnProgress = Math.min(1.0, this.turnProgress + progressDelta);

    const baseAngle = this.getDirectionBaseAngle(this.originalDirection);
    this.angle = baseAngle + (this.turnProgress * Math.PI / 2);

    this.x += Math.cos(this.angle) * distance;
    this.y += Math.sin(this.angle) * distance;
  }

  getDirectionBaseAngle(dir) {
    switch (dir) {
      case 'NORTH': return Math.PI / 2;     // Heading South (down)
      case 'SOUTH': return -Math.PI / 2;    // Heading North (up)
      case 'WEST':  return 0;               // Heading East (right)
      case 'EAST':  return Math.PI;         // Heading West (left)
      default: return 0;
    }
  }

  /**
   * Check if vehicle is off-screen (completed its route)
   */
  isOutOfBounds(canvasWidth, canvasHeight) {
    const margin = 80;
    return (
      this.x < -margin ||
      this.x > canvasWidth + margin ||
      this.y < -margin ||
      this.y > canvasHeight + margin
    );
  }

  /**
   * Render vehicle on HTML5 Canvas with rich detailing
   */
  render(ctx, isNightMode = false) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const halfW = this.width / 2;
    const halfL = this.length / 2;

    // 1. Drop shadow for elevation
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.roundRect(-halfW + 2, -halfL + 3, this.width, this.length, 4);
    ctx.fill();

    // 2. Headlight Beams (Night Mode / Dark Navy theme)
    if (isNightMode || true) {
      this.drawHeadlightBeams(ctx, halfW, halfL);
    }

    // 3. Render Vehicle Body based on Fleet Type
    switch (this.type) {
      case VehicleType.AUTO:
        this.renderAutoRickshaw(ctx, halfW, halfL);
        break;
      case VehicleType.BIKE:
        this.renderTwoWheeler(ctx, halfW, halfL);
        break;
      case VehicleType.BUS:
        this.renderBus(ctx, halfW, halfL);
        break;
      case VehicleType.AMBULANCE:
        this.renderAmbulance(ctx, halfW, halfL);
        break;
      default:
        this.renderStandardCar(ctx, halfW, halfL);
        break;
    }

    // 4. Brakelight / Taillight Glow when slowing or stopped
    if (this.currentSpeed < 0.5) {
      this.drawTaillights(ctx, halfW, halfL, true);
    } else {
      this.drawTaillights(ctx, halfW, halfL, false);
    }

    ctx.restore();
  }

  drawHeadlightBeams(ctx, halfW, halfL) {
    // Left & Right headlight beams extending forward
    const beamGrad = ctx.createLinearGradient(0, halfL, 0, halfL + 65);
    beamGrad.addColorStop(0, 'rgba(255, 255, 230, 0.5)');
    beamGrad.addColorStop(1, 'rgba(255, 255, 200, 0)');

    ctx.fillStyle = beamGrad;
    // Left beam
    ctx.beginPath();
    ctx.moveTo(-halfW + 3, halfL);
    ctx.lineTo(-halfW - 8, halfL + 65);
    ctx.lineTo(-halfW + 12, halfL + 65);
    ctx.closePath();
    ctx.fill();

    // Right beam
    ctx.beginPath();
    ctx.moveTo(halfW - 3, halfL);
    ctx.lineTo(halfW - 12, halfL + 65);
    ctx.lineTo(halfW + 8, halfL + 65);
    ctx.closePath();
    ctx.fill();
  }

  drawTaillights(ctx, halfW, halfL, isBraking) {
    ctx.fillStyle = isBraking ? '#ff0033' : '#aa0011';
    if (isBraking) {
      ctx.shadowColor = '#ff0033';
      ctx.shadowBlur = 8;
    }
    // Left rear light
    ctx.fillRect(-halfW + 2, -halfL - 1, 4, 2);
    // Right rear light
    ctx.fillRect(halfW - 6, -halfL - 1, 4, 2);
    ctx.shadowBlur = 0;
  }

  renderStandardCar(ctx, halfW, halfL) {
    // Chassis
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfL, this.width, this.length, 5);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Windshield (Front)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-halfW + 2, halfL - 16, this.width - 4, 7, 2);
    ctx.fill();

    // Rear glass
    ctx.fillRect(-halfW + 2, -halfL + 8, this.width - 4, 5);

    // Roof
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(-halfW + 3, -halfL + 14, this.width - 6, this.length - 30);
  }

  renderAutoRickshaw(ctx, halfW, halfL) {
    // Iconic Indian Auto: Tapered front, green/black lower body, yellow roof canvas
    ctx.fillStyle = '#16a34a'; // Auto dark green lower chassis
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfL, this.width, this.length, 4);
    ctx.fill();

    // Yellow Canopy Roof
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.roundRect(-halfW + 1, -halfL + 5, this.width - 2, this.length - 8, 3);
    ctx.fill();

    // Front windshield
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-halfW + 2, halfL - 7, this.width - 4, 4);

    // Single front wheel nose
    ctx.fillStyle = '#000000';
    ctx.fillRect(-2, halfL - 2, 4, 3);
  }

  renderTwoWheeler(ctx, halfW, halfL) {
    // Narrow bike body
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-2, -halfL, 4, this.length);

    // Front wheel & handlebars
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-halfW, halfL - 6, this.width, 3);

    // Rider & Helmet
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  renderBus(ctx, halfW, halfL) {
    // Long rectangular body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfL, this.width, this.length, 4);
    ctx.fill();

    // White roof panel
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(-halfW + 3, -halfL + 6, this.width - 6, this.length - 14);

    // Front large bus windshield
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-halfW + 2, halfL - 8, this.width - 4, 6);

    // Side windows
    ctx.fillStyle = '#334155';
    for (let i = -halfL + 8; i < halfL - 10; i += 8) {
      ctx.fillRect(-halfW + 1, i, 2, 5);
      ctx.fillRect(halfW - 3, i, 2, 5);
    }
  }

  renderAmbulance(ctx, halfW, halfL) {
    // White body
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfL, this.width, this.length, 5);
    ctx.fill();

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Red Cross on Roof
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-3, -8, 6, 16);
    ctx.fillRect(-8, -3, 16, 6);

    // Emergency Flashing Beacon Lightbar
    const isRed = Math.floor(this.strobeTick) % 2 === 0;
    ctx.fillStyle = isRed ? '#ef4444' : '#3b82f6';
    ctx.shadowColor = isRed ? '#ef4444' : '#3b82f6';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.roundRect(-halfW + 4, halfL - 12, this.width - 8, 4, 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

window.Vehicle = Vehicle;
window.VehicleType = VehicleType;
window.RouteType = RouteType;
