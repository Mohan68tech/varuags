# Smart Traffic Junction Simulator AI
### Competitive Hackathon Project: Indian 4-Way Smart Traffic Junction

A professional, interactive, browser-based traffic engineering and AI simulation application. Simulates a realistic four-way Indian traffic junction with left-hand traffic (LHT), deterministic collision prevention, adaptive signal timing, emergency green corridors, live telemetry, side-by-side benchmarking, and Firebase Realtime Database cloud analytics.

---

## 🚦 Key System Capabilities

### 1. Realistic Indian Junction Geometry & Vehicle Fleet
- **Left-Hand Traffic (LHT)**: Faithfully simulates Indian road driving rules where vehicles drive on the left half of the road and turn into corresponding left lanes.
- **Indian Vehicle Fleet**:
  - **Sedans & SUVs** (Standard cars)
  - **Auto-Rickshaws** (Tuk-tuks with distinctive 3-wheel profile, green chassis, and yellow canopy)
  - **Two-Wheelers** (Motorcycles & scooters with rider helmets)
  - **Buses & Heavy Commercials** (Long vehicles with slower acceleration and wider stopping margins)
  - **Emergency Ambulances** (Flashing dual-color strobe lightbar, synthesized audio siren, green corridor override)
- **Free Left Turn (Indian Rule)**: Dedicated left-turn lane allows continuous free left turns subject to pedestrian/cross-traffic yielding. Can be toggled on/off in the control panel.
- **Asphalt & Road Markings**: Yellow Box Junction ("Do Not Block The Box"), Zebra pedestrian crossings, broken lane dividers, stop lines, and direction markings.
- **Day & Night Visual Themes**: Features glowing headlights with light cones, LED signal gantries with countdown timers, taillight braking glows, and night road ambiance.

### 2. Zero-Collision Spatial Interlock & Queueing
- **Conflict Zone Reservation**: Deterministic spatial interlock ensures conflicting vehicle trajectories cannot enter the intersection simultaneously.
- **Clearance Interval & All-Red Buffer**: Enforces a minimum 3.5s amber and 2.5s all-red clearance interval before releasing cross traffic, guaranteeing the central box is physically vacant before conflicting greens activate.
- **Safe Following Distance**: Vehicles dynamically adjust speed to maintain safe bumper-to-bumper gaps (`minGap = 16px + speed * 10`) and stop smoothly behind red lights.
- **Anti-Gridlock Protection**: Vehicles will not enter the intersection if their exit lane is congested.

### 3. Adaptive AI Signal Control vs Fixed-Time Mode
- **Mode A (Fixed-Time Single-Arm)**: Sequentially releases one approach at a time (**NORTH ONLY → EAST ONLY → SOUTH ONLY → WEST ONLY**) on fixed 14s green, 3s amber, and 2s all-red clearance intervals. The other 3 directions remain strictly RED.
- **Mode B (Adaptive AI Single-Arm Engine)**:
  - Continuously monitors individual directional queue lengths, vehicle delay times, and approaching vehicles across all 4 approaches (N, E, S, W).
  - Dynamically extends green time (up to 24s) for high-congestion approaches.
  - Triggers **Early Cutoff** when an active queue is cleared and other approaches have queued vehicles, saving up to 8s of wasted idle green time per phase.
  - **Anti-Starvation Safeguard**: Guarantees no approach waits longer than 38s, even under heavy traffic.
  - **Live AI Decision Engine HUD**: Displays real-time reasoning and individual N, E, S, W demand scores.

### 4. Emergency Green Corridor
- Spawns an ambulance on any chosen approach (North, South, East, West).
- Safely initiates amber clearance for conflicting traffic.
- Opens an immediate dedicated green corridor with audio siren synthesis.
- Automatically restores standard cycling once the ambulance has cleared the intersection.

### 5. Firebase Realtime Database Integration
- **Cloud Analytics**: Logs simulation runs (session ID, timestamp, duration, mode, total vehicles passed, average waiting time, max queue, throughput, and spawn rates).
- **Graceful Local Fallback**: Seamlessly works 100% offline or without API keys using localStorage fallback, with zero runtime errors.
- **Configuration Modal**: In-app configuration modal allows entering Firebase credentials (`databaseURL`, `apiKey`, `projectId`) and testing live connectivity on demand.
- **Session History & JSON Export**: Interactive table of past runs with one-click JSON data export.

---

## 📁 Project Structure

```
traffic-junction-simulator/
├── index.html              # Main dashboard layout, HUD, canvas container, modals
├── style.css               # Dark navy design system, glassmorphism, responsive grid
├── README.md               # Architecture documentation & testing guide
└── js/
    ├── sound-effects.js    # Web Audio API synthesizers (siren, chimes, horns)
    ├── firebase-config.js  # Firebase Realtime Database SDK & fallback store
    ├── vehicles.js         # Indian vehicle fleet classes, LHT physics, rendering
    ├── traffic-signals.js  # Fail-safe interlocks, phase transitions, clearance
    ├── adaptive-signals.js # AI queue-weighted decision engine & anti-starvation
    ├── statistics.js       # Live telemetry, Chart.js benchmarks, performance deltas
    ├── simulation.js       # HTML5 Canvas 60fps engine, road graphics, collision guards
    └── main.js             # UI event wiring, playback controls, benchmarks, HUD
```

---

## 🚀 How to Run Locally

Because the project uses standard Vanilla JavaScript and HTML5 Canvas, you can run it directly:

### Option A: Using Python (Recommended)
```bash
# In the project directory:
python -m http.server 8080
```
Then open `http://localhost:8080` in any modern web browser (Chrome, Edge, Firefox, Safari).

### Option B: Using Node / npx
```bash
npx -y serve -p 8080 .
```

### Option C: Direct File Opening
Double-click `index.html` to open it in your browser. All core features, animations, local storage sessions, and audio will work directly.

---

## 🧪 Testing Checklist Verification

| Test # | Test Description | Result | Verification Notes |
|:---:|:---|:---:|:---|
| **1** | Vehicle Spawning | **PASSED** | Vehicles spawn reliably from North, South, East, and West with appropriate Indian fleet proportions. |
| **2** | Spawn Rate Slider | **PASSED** | Traffic density scales smoothly from 10 to 80 veh/min; queues form under rush conditions. |
| **3** | Stop Line Compliance | **PASSED** | Vehicles decelerate and stop firmly behind the white stop line on RED and AMBER. |
| **4** | Safe Queue Spacing | **PASSED** | Bumper-to-bumper distances prevent vehicles from overlapping in queues. |
| **5** | Interlock Integrity | **PASSED** | Software interlocks mathematically prevent conflicting directions from receiving green simultaneously. |
| **6** | Amber Rule | **PASSED** | Approaching vehicles behind stop line do not enter on amber; only committed vehicles clear. |
| **7** | Zero Collisions | **PASSED** | Spatial reservation grid prevents intersection box collisions. |
| **8** | Vehicle Counting | **PASSED** | Each vehicle is recorded exactly once upon exiting canvas boundaries. |
| **9** | Live Telemetry | **PASSED** | Wait times, queue lengths, and throughput per minute update dynamically. |
| **10** | Pause & Resume | **PASSED** | Freezes simulation state, canvas overlays "SIMULATION PAUSED", and resumes seamlessly. |
| **11** | Reset Behavior | **PASSED** | Clears canvas, resets traffic signals, counters, and timers to initial state. |
| **12** | Fixed vs. Adaptive Comparison | **PASSED** | Recorded data displays lower average wait times and higher throughput under Adaptive AI mode. |
| **13** | Emergency Priority | **PASSED** | Ambulance triggers green corridor; conflicting traffic stops safely; siren sounds; normal cycle resumes. |
| **14** | Responsive Canvas | **PASSED** | Scaled 900x900 coordinate system remains razor-sharp across screen resolutions. |
| **15** | Console Error Free | **PASSED** | Zero errors logged in browser console during full end-to-end execution. |

---

## 👥 Hackathon Presentation Tips
1. **Highlight the Indian Traffic Engineering**: Point out Left-Hand Traffic (LHT), Auto-Rickshaws, and the Free Left Turn toggle.
2. **Showcase the AI Reasoner**: Switch to Adaptive AI mode and explain the live decision engine logs (Early Cutoffs and Starvation safeguards).
3. **Dispatch an Ambulance**: Demonstrate the emergency priority system, siren audio, and automatic clearance intervals.
4. **Demonstrate Cloud Analytics**: Show the Firebase Configuration modal and the Session History table with JSON export.
