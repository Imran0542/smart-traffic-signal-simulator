# Smart Traffic Signal Simulator

A zero-dependency traffic-control simulation built with plain HTML, CSS, and JavaScript. It models a 4-way intersection with adaptive signal timing, queue-based optimization, emergency preemption, and real-time analytics.

## Overview

This project simulates a standard 4-way signalized intersection with:
- 4 approaches: North, South, East, West
- 2 lanes per approach: Left-turn and Straight/Right-turn
- Fixed-Time benchmark mode and Adaptive signal mode
- Emergency vehicle preemption
- Queue-based decision logic and starvation prevention
- Live dashboard with queue lengths, throughput, wait statistics, and efficiency comparison

## Architecture and State Machine

### 1. Intersection Layout
- The junction is represented as a central 4-way cross with a 2-lane approach per direction.
- Each direction has a dedicated queue managed by lane key: `N-left`, `N-straight`, `S-left`, `S-straight`, `E-left`, `E-straight`, `W-left`, `W-straight`.
- Each vehicle follows a predefined route polyline that starts at the approach edge, crosses the intersection, and exits the map.

### 2. Signal State Machine
The signal uses a simplified two-phase controller:
- `NS_GREEN`: North/South movements are permitted
- `EW_GREEN`: East/West movements are permitted

State transitions:
- Fixed mode: alternates on a static cycle (e.g., 12s green each phase)
- Adaptive mode: chooses the active group based on queue length, cumulative wait time, and a starvation check
- Emergency preemption: if an emergency vehicle is spawned, the controller immediately switches to that direction's green phase and holds it briefly until the emergency vehicle clears the junction

### 3. Queue and Timing Logic
For each approach group (`NS` or `EW`):
- `queueLength = # vehicles still inside the approach corridor or near the stop line`
- `groupWait = sum of waiting times of vehicles in that group`
- `score = queueLength * 18 + groupWait * 0.9 + bonus if currently green`

The adaptive controller selects the highest-scoring direction. It also checks starvation prevention:
- If a direction exceeds `Tmax` (maximum allowed wait), it is forced into the next green phase.

### 4. Vehicle Dynamics
Each vehicle is updated with a simple car-following model:
- Vehicles maintain a safe following gap behind the leader in the same lane
- Speed is reduced before the stop line when the signal is not green
- Vehicles accelerate smoothly when allowed to proceed
- Emergency vehicles have higher max speed and immediate right-of-way

## Files
- `index.html`: App shell and UI controls
- `styles.css`: Layout and visual styling
- `app.js`: Simulation engine, signal logic, metrics, and rendering

## Run Instructions

### Option 1: Open directly in browser
1. Download or clone the repo
2. Open `index.html` in any modern browser
3. Use the controls to start, pause, modify spawn rates, and spawn emergency vehicles

### Option 2: Run a local static server (recommended)
```bash
cd smart-traffic-signal-simulator
python3 -m http.server 8000
```
Then open:
```text
http://localhost:8000/
```

## Testing and Observing Efficiency Differences

1. Start with Adaptive mode enabled and observe signal decisions.
2. Switch to Fixed-Time mode and compare queue buildup and wait time.
3. Increase spawn rate to stress the intersection.
4. Spawn emergency vehicles from different directions and observe preemption.
5. Watch the adaptive benchmark chart and real-time metrics to compare efficiency.

Expected behavior:
- Adaptive mode is more resilient under queue imbalance and variable demand
- Fixed mode is predictable but less efficient under uneven traffic flow
- Emergency vehicles trigger immediate corridor priority and reduce delay for critical trips

## Notes
- This implementation focuses on a clean, readable, zero-dependency simulation rather than photorealistic traffic modeling.
- The logic is intentionally modular so it can be extended with more realistic phases, lane-specific turning probabilities, or a backend analytics model.

## License
This project is provided as a demonstration and can be adapted as needed for educational or research use.
