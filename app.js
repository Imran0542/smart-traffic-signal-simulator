const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

const chartCanvas = document.getElementById('comparisonChart');
const chartCtx = chartCanvas.getContext('2d');

const toggleRunBtn = document.getElementById('toggleRunBtn');
const spawnEmergencyBtn = document.getElementById('spawnEmergencyBtn');
const modeSelect = document.getElementById('modeSelect');
const spawnRateSlider = document.getElementById('spawnRateSlider');
const speedSlider = document.getElementById('speedSlider');
const maxWaitSlider = document.getElementById('maxWaitSlider');

const spawnRateValue = document.getElementById('spawnRateValue');
const speedValue = document.getElementById('speedValue');
const maxWaitValue = document.getElementById('maxWaitValue');

const avgWaitValue = document.getElementById('avgWaitValue');
const throughputValue = document.getElementById('throughputValue');
const activeVehicleValue = document.getElementById('activeVehicleValue');
const modeValue = document.getElementById('modeValue');
const signalPhaseBadge = document.getElementById('signalPhaseBadge');

const adaptiveScoreValue = document.getElementById('adaptiveScoreValue');
const fixedScoreValue = document.getElementById('fixedScoreValue');
const deltaScoreValue = document.getElementById('deltaScoreValue');
const queuePanel = document.getElementById('queuePanel');

const directions = ['N', 'S', 'E', 'W'];
const laneLayout = {
  N: ['left', 'straight'],
  S: ['left', 'straight'],
  E: ['left', 'straight'],
  W: ['left', 'straight']
};

const STOP_LINE_DISTANCE = 140;
const MAX_GREEN_NS = 24;
const MAX_GREEN_EW = 24;
const BASE_FIXED_GREEN = 12;
const MAX_WAIT_TRESHOLD = 60;

const SIM = {
  running: true,
  currentTime: 0,
  vehicles: [],
  completedVehicles: 0,
  totalWaitAccumulated: 0,
  lastTimestamp: performance.now(),
  spawnAccumulators: {},
  mode: 'adaptive',
  baseSpawnRate: 30,
  speedMultiplier: 1,
  maxWaitThreshold: 60,
  signal: {
    phase: 'NS_GREEN',
    timer: 0,
    currentGroup: 'NS',
    lockUntil: 0,
    emergencyGroup: null,
  },
  adaptiveHistory: [],
  fixedHistory: [],
  lastSpawnId: 1,
};

const PATH_LIBRARY = createPathLibrary();

function createPathLibrary() {
  return {
    N: {
      left: {
        points: [[-40, -520], [-40, -120], [170, -120], [170, 520]],
        stopDistance: 110,
      },
      straight: {
        points: [[-20, -520], [-20, -120], [-20, 520]],
        stopDistance: 115,
      },
      right: {
        points: [[20, -520], [20, -120], [-170, -120], [-170, 520]],
        stopDistance: 120,
      },
    },
    S: {
      left: {
        points: [[40, 520], [40, 120], [-170, 120], [-170, -520]],
        stopDistance: 110,
      },
      straight: {
        points: [[20, 520], [20, 120], [20, -520]],
        stopDistance: 115,
      },
      right: {
        points: [[-20, 520], [-20, 120], [170, 120], [170, -520]],
        stopDistance: 120,
      },
    },
    E: {
      left: {
        points: [[520, 40], [120, 40], [120, 170], [-520, 170]],
        stopDistance: 110,
      },
      straight: {
        points: [[520, 20], [120, 20], [-520, 20]],
        stopDistance: 115,
      },
      right: {
        points: [[520, -20], [120, -20], [120, -170], [-520, -170]],
        stopDistance: 120,
      },
    },
    W: {
      left: {
        points: [[-520, -40], [-120, -40], [-120, -170], [520, -170]],
        stopDistance: 110,
      },
      straight: {
        points: [[-520, -20], [-120, -20], [520, -20]],
        stopDistance: 115,
      },
      right: {
        points: [[-520, 20], [-120, 20], [-120, 170], [520, 170]],
        stopDistance: 120,
      },
    },
  };
}

function buildRoute(points) {
  const segments = [];
  let totalLength = 0;

  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    segments.push({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      dx,
      dy,
      length,
      startDistance: totalLength,
      endDistance: totalLength + length,
    });
    totalLength += length;
  }

  return { points, segments, totalLength };
}

function getPointOnRoute(route, distance) {
  const clampedDistance = Math.min(Math.max(distance, 0), route.totalLength);

  for (const segment of route.segments) {
    if (clampedDistance >= segment.startDistance && clampedDistance <= segment.endDistance) {
      const frac = (clampedDistance - segment.startDistance) / segment.length;
      const x = segment.start.x + segment.dx * frac;
      const y = segment.start.y + segment.dy * frac;
      return { x, y, angle: Math.atan2(segment.dy, segment.dx) };
    }
  }

  const last = route.points[route.points.length - 1];
  return { x: last[0], y: last[1], angle: 0 };
}

function vehicleColor(vehicle) {
  if (vehicle.isEmergency) return '#fcd34d';
  if (vehicle.movement === 'left') return '#7dd3fc';
  if (vehicle.movement === 'straight') return '#a7f3d0';
  return '#c4b5fd';
}

function randomDirection() {
  return directions[Math.floor(Math.random() * directions.length)];
}

function createVehicle(direction, laneType, customMovement = null, emergency = false) {
  const movement = customMovement || (laneType === 'left' ? 'left' : (Math.random() < 0.75 ? 'straight' : 'right'));
  const routeDef = PATH_LIBRARY[direction][movement];
  const route = buildRoute(routeDef.points);
  const length = emergency ? 40 : 28;
  const width = emergency ? 18 : 16;

  return {
    id: SIM.lastSpawnId++,
    direction,
    laneType,
    movement,
    route,
    routeDef,
    progress: 0,
    speed: 0,
    targetSpeed: 0,
    maxSpeed: emergency ? 150 : 72 + Math.random() * 22,
    acceleration: emergency ? 110 : 72,
    deceleration: emergency ? 140 : 110,
    length,
    width,
    waitTime: 0,
    isEmergency: emergency,
    color: vehicleColor({ movement, isEmergency: emergency }),
    stopDistance: routeDef.stopDistance,
  };
}

function laneKey(direction, laneType) {
  return `${direction}-${laneType}`;
}

function laneGroup(direction) {
  return direction === 'N' || direction === 'S' ? 'NS' : 'EW';
}

function getLaneConfig() {
  const config = [];
  for (const dir of directions) {
    for (const laneType of laneLayout[dir]) {
      config.push({ direction: dir, laneType });
    }
  }
  return config;
}

function isVehicleAllowed(vehicle) {
  return laneGroup(vehicle.direction) === SIM.signal.currentGroup;
}

function updateSignal(dt) {
  const phaseName = SIM.signal.phase;
  const phaseGroup = phaseName === 'NS_GREEN' ? 'NS' : 'EW';
  SIM.signal.currentGroup = phaseGroup;

  if (SIM.signal.emergencyGroup) {
    SIM.signal.currentGroup = SIM.signal.emergencyGroup;
    SIM.signal.phase = SIM.signal.emergencyGroup === 'NS' ? 'NS_GREEN' : 'EW_GREEN';
    SIM.signal.timer += dt;

    const emergencyDuration = 8 + (SIM.vehicles.filter(v => v.isEmergency).length ? 6 : 0);
    if (SIM.signal.timer >= emergencyDuration) {
      SIM.signal.emergencyGroup = null;
      SIM.signal.timer = 0;
    }
    return;
  }

  if (SIM.mode === 'fixed') {
    SIM.signal.timer += dt;
    const greenDuration = phaseGroup === 'NS' ? BASE_FIXED_GREEN : BASE_FIXED_GREEN;
    if (SIM.signal.timer >= greenDuration) {
      SIM.signal.phase = phaseGroup === 'NS' ? 'EW_GREEN' : 'NS_GREEN';
      SIM.signal.timer = 0;
    }
    return;
  }

  const queueState = computeQueueData();
  const groups = ['NS', 'EW'];
  let bestGroup = phaseGroup;
  let bestScore = -Infinity;

  for (const group of groups) {
    const score = calculateAdaptiveScore(group, queueState);
    if (score > bestScore) {
      bestGroup = group;
      bestScore = score;
    }
  }

  const groupWait = queueState.totalWaitByGroup[bestGroup];
  const maxGroupQueue = queueState.maxQueueGroup[bestGroup];
  const timeThreshold = SIM.maxWaitThreshold;

  if (groupWait > timeThreshold || maxGroupQueue > 6) {
    SIM.signal.phase = bestGroup === 'NS' ? 'NS_GREEN' : 'EW_GREEN';
    SIM.signal.currentGroup = bestGroup;
    SIM.signal.timer = 0;
    return;
  }

  if (phaseGroup !== bestGroup) {
    SIM.signal.phase = bestGroup === 'NS' ? 'NS_GREEN' : 'EW_GREEN';
    SIM.signal.currentGroup = bestGroup;
    SIM.signal.timer = 0;
    return;
  }

  SIM.signal.timer += dt;
  const requestedGreen = adaptiveGreenDuration(bestGroup, queueState);
  if (SIM.signal.timer >= requestedGreen) {
    SIM.signal.phase = bestGroup === 'NS' ? 'EW_GREEN' : 'NS_GREEN';
    SIM.signal.currentGroup = bestGroup === 'NS' ? 'EW' : 'NS';
    SIM.signal.timer = 0;
  }
}

function computeQueueData() {
  const queueState = {
    totalQueueByGroup: { NS: 0, EW: 0 },
    totalWaitByGroup: { NS: 0, EW: 0 },
    maxQueueGroup: { NS: 0, EW: 0 },
  };

  for (const vehicle of SIM.vehicles) {
    const group = laneGroup(vehicle.direction);
    if (vehicle.progress < vehicle.stopDistance + 80) {
      queueState.totalQueueByGroup[group] += 1;
      queueState.maxQueueGroup[group] = Math.max(queueState.maxQueueGroup[group], 1);
    }
    queueState.totalWaitByGroup[group] += vehicle.waitTime;
  }

  if (SIM.vehicles.length === 0) {
    queueState.totalQueueByGroup = { NS: 0, EW: 0 };
    queueState.totalWaitByGroup = { NS: 0, EW: 0 };
    queueState.maxQueueGroup = { NS: 0, EW: 0 };
  }

  return queueState;
}

function calculateAdaptiveScore(group, queueState) {
  const queueLength = queueState.totalQueueByGroup[group] || 0;
  const waitTime = queueState.totalWaitByGroup[group] || 0;
  const score = queueLength * 18 + waitTime * 0.9 + (group === SIM.signal.currentGroup ? 8 : 0);
  return score;
}

function adaptiveGreenDuration(group, queueState) {
  const queueLength = queueState.totalQueueByGroup[group] || 0;
  const waitTime = queueState.totalWaitByGroup[group] || 0;
  return Math.min(24, Math.max(8, 8 + queueLength * 1.6 + waitTime / 18));
}

function updateVehicleWaitTime(vehicle, dt) {
  if (vehicle.speed < 8 && vehicle.progress < vehicle.stopDistance) {
    vehicle.waitTime += dt;
  }
}

function canSpawnVehicle(direction, laneType) {
  const key = laneKey(direction, laneType);
  const tooClose = SIM.vehicles.some(vehicle => {
    if (vehicle.direction !== direction || vehicle.laneType !== laneType) return false;
    return vehicle.progress < 40;
  });
  return !tooClose;
}

function updateSpawning(dt) {
  const laneConfigs = getLaneConfig();
  const ratePerSecond = (SIM.baseSpawnRate / 60) * SIM.speedMultiplier;

  for (const { direction, laneType } of laneConfigs) {
    const key = laneKey(direction, laneType);
    SIM.spawnAccumulators[key] = (SIM.spawnAccumulators[key] || 0) + ratePerSecond * dt * (laneType === 'straight' ? 0.8 : 0.7);

    while (SIM.spawnAccumulators[key] >= 1) {
      SIM.spawnAccumulators[key] -= 1;
      if (canSpawnVehicle(direction, laneType)) {
        const movement = laneType === 'left' ? 'left' : (Math.random() < 0.72 ? 'straight' : 'right');
        SIM.vehicles.push(createVehicle(direction, laneType, movement, false));
      }
    }
  }
}

function pushEmergencyVehicle(direction) {
  const laneType = Math.random() < 0.5 ? 'left' : 'straight';
  const movement = laneType === 'left' ? 'left' : 'straight';
  const vehicle = createVehicle(direction, laneType, movement, true);
  SIM.vehicles.push(vehicle);
  SIM.signal.emergencyGroup = laneGroup(direction);
  SIM.signal.phase = SIM.signal.emergencyGroup === 'NS' ? 'NS_GREEN' : 'EW_GREEN';
  SIM.signal.currentGroup = SIM.signal.emergencyGroup;
  SIM.signal.timer = 0;
}

function updateVehicles(dt) {
  const laneGroups = new Map();

  for (const vehicle of SIM.vehicles) {
    const key = laneKey(vehicle.direction, vehicle.laneType);
    if (!laneGroups.has(key)) laneGroups.set(key, []);
    laneGroups.get(key).push(vehicle);
  }

  for (const [, groupVehicles] of laneGroups) {
    groupVehicles.sort((a, b) => a.progress - b.progress);

    for (let index = 0; index < groupVehicles.length; index += 1) {
      const vehicle = groupVehicles[index];
      const nextVehicle = groupVehicles[index + 1] || null;
      const allowed = isVehicleAllowed(vehicle);
      let effectiveTarget = vehicle.maxSpeed;

      if (nextVehicle) {
        const gap = nextVehicle.progress - vehicle.progress - nextVehicle.length;
        const desiredGap = 28;
        effectiveTarget = Math.min(effectiveTarget, Math.max(0, (gap - desiredGap) * 4.5));
      }

      const signalDistance = vehicle.stopDistance - vehicle.progress;
      if (!allowed && signalDistance > 0 && signalDistance < STOP_LINE_DISTANCE) {
        const brakeFactor = Math.max(0, signalDistance / STOP_LINE_DISTANCE);
        effectiveTarget = Math.min(effectiveTarget, vehicle.maxSpeed * brakeFactor);
      }
      if (!allowed && signalDistance <= 4) {
        effectiveTarget = 0;
      }

      if (vehicle.speed < effectiveTarget) {
        vehicle.speed = Math.min(vehicle.speed + vehicle.acceleration * dt, effectiveTarget);
      } else {
        vehicle.speed = Math.max(vehicle.speed - vehicle.deceleration * dt, effectiveTarget);
      }

      if (vehicle.speed < 1 && vehicle.progress < vehicle.stopDistance && !allowed) {
        vehicle.speed = 0;
      }

      vehicle.progress += vehicle.speed * dt;
      updateVehicleWaitTime(vehicle, dt);

      if (vehicle.progress >= vehicle.route.totalLength) {
        SIM.completedVehicles += 1;
        SIM.totalWaitAccumulated += vehicle.waitTime;
        SIM.vehicles = SIM.vehicles.filter(v => v.id !== vehicle.id);
      }
    }
  }
}

function computeMetricSnapshot() {
  const totalVehicles = SIM.vehicles.length;
  const averageWait = totalVehicles > 0
    ? SIM.vehicles.reduce((sum, vehicle) => sum + vehicle.waitTime, 0) / totalVehicles
    : (SIM.completedVehicles > 0 ? SIM.totalWaitAccumulated / SIM.completedVehicles : 0);

  const throughput = SIM.currentTime > 0 ? (SIM.completedVehicles / (SIM.currentTime / 60)) : 0;

  const queueLengths = {};
  for (const dir of directions) {
    for (const laneType of laneLayout[dir]) {
      const key = laneKey(dir, laneType);
      queueLengths[key] = SIM.vehicles.filter(v => v.direction === dir && v.laneType === laneType && v.progress < v.stopDistance + 60).length;
    }
  }

  const adaptiveScore = 120 + (queueLengths['N-left'] + queueLengths['N-straight'] + queueLengths['S-left'] + queueLengths['S-straight']) * 8 + averageWait * 6;
  const fixedScore = 100 + (queueLengths['E-left'] + queueLengths['E-straight'] + queueLengths['W-left'] + queueLengths['W-straight']) * 5 + averageWait * 4;

  SIM.adaptiveHistory.push(adaptiveScore);
  SIM.fixedHistory.push(fixedScore);
  if (SIM.adaptiveHistory.length > 30) {
    SIM.adaptiveHistory.shift();
    SIM.fixedHistory.shift();
  }

  return {
    averageWait,
    throughput,
    queueLengths,
    adaptiveScore,
    fixedScore,
    totalVehicles,
  };
}

function renderQueueInfo(queueLengths) {
  const rows = [];
  for (const dir of directions) {
    for (const laneType of laneLayout[dir]) {
      const key = laneKey(dir, laneType);
      const laneName = `${dir} ${laneType === 'left' ? 'Left Turn' : 'Straight/Right'}`;
      rows.push(`<div class="queue-row"><span class="queue-name">${laneName}</span><span class="queue-value">${queueLengths[key] || 0}</span></div>`);
    }
  }
  queuePanel.innerHTML = rows.join('');
}

function renderMetricText(snapshot) {
  avgWaitValue.textContent = `${snapshot.averageWait.toFixed(1)} s`;
  throughputValue.textContent = `${snapshot.throughput.toFixed(1)} veh/min`;
  activeVehicleValue.textContent = String(snapshot.totalVehicles);
  modeValue.textContent = SIM.mode === 'adaptive' ? 'Adaptive' : 'Fixed';
  signalPhaseBadge.textContent = SIM.signal.currentGroup === 'NS' ? 'NS GREEN' : 'EW GREEN';
  signalPhaseBadge.style.background = SIM.signal.currentGroup === 'NS' ? 'rgba(73,209,125,0.18)' : 'rgba(255,94,91,0.15)';
  signalPhaseBadge.style.color = SIM.signal.currentGroup === 'NS' ? '#49d17d' : '#ff5e5b';
  signalPhaseBadge.style.borderColor = SIM.signal.currentGroup === 'NS' ? 'rgba(73,209,125,0.35)' : 'rgba(255,94,91,0.35)';

  const adaptiveScore = snapshot.adaptiveScore;
  const fixedScore = snapshot.fixedScore;
  const delta = ((adaptiveScore - fixedScore) / Math.max(fixedScore, 1)) * 100;

  adaptiveScoreValue.textContent = adaptiveScore.toFixed(0);
  fixedScoreValue.textContent = fixedScore.toFixed(0);
  deltaScoreValue.textContent = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

function renderComparisonChart() {
  chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  const padding = 18;
  const width = chartCanvas.width;
  const height = chartCanvas.height;
  const maxVal = 250;

  chartCtx.strokeStyle = 'rgba(255,255,255,0.12)';
  chartCtx.lineWidth = 1;
  chartCtx.beginPath();
  chartCtx.moveTo(padding, padding);
  chartCtx.lineTo(padding, height - padding);
  chartCtx.lineTo(width - padding, height - padding);
  chartCtx.stroke();

  const pointsAdaptive = SIM.adaptiveHistory;
  const pointsFixed = SIM.fixedHistory;

  drawSeries(pointsAdaptive, '#49d17d', 0.35, 0.9);
  drawSeries(pointsFixed, '#60a5fa', 0.52, 0.9);

  function drawSeries(points, color, alpha, opacity) {
    chartCtx.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const x = padding + (i / Math.max(1, points.length - 1)) * (width - padding * 2);
      const y = height - padding - (points[i] / maxVal) * (height - padding * 2);
      if (i === 0) chartCtx.moveTo(x, y);
      else chartCtx.lineTo(x, y);
    }
    chartCtx.strokeStyle = color;
    chartCtx.lineWidth = 2;
    chartCtx.globalAlpha = opacity;
    chartCtx.stroke();
    chartCtx.globalAlpha = 1;

    const lastX = padding + ((points.length - 1) / Math.max(1, points.length - 1)) * (width - padding * 2);
    const lastY = height - padding - (points[points.length - 1] / maxVal) * (height - padding * 2);

    chartCtx.fillStyle = color;
    chartCtx.globalAlpha = alpha;
    chartCtx.beginPath();
    chartCtx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    chartCtx.fill();
    chartCtx.globalAlpha = 1;
  }
}

function drawRoads() {
  ctx.fillStyle = '#1d3f2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#2b2f38';
  ctx.fillRect(0, 350, canvas.width, 200);
  ctx.fillRect(350, 0, 200, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 18]);
  ctx.beginPath();
  ctx.moveTo(0, 450);
  ctx.lineTo(canvas.width, 450);
  ctx.moveTo(450, 0);
  ctx.lineTo(450, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 9; i += 1) {
    ctx.fillRect(140 + i * 70, 350, 14, 200);
    ctx.fillRect(350, 140 + i * 70, 200, 14);
  }

  ctx.fillStyle = '#f3f4f6';
  for (let i = 0; i < 2; i += 1) {
    const x = 330 + i * 130;
    const y = 336;
    ctx.fillRect(x, y, 10, 225);
    ctx.fillRect(336, y, 10, 225);
  }

  drawIntersectionSignals();
}

function drawIntersectionSignals() {
  const lightPositions = {
    N: { x: 360, y: 270 },
    S: { x: 540, y: 630 },
    E: { x: 630, y: 360 },
    W: { x: 270, y: 540 },
  };

  for (const [direction, { x, y }] of Object.entries(lightPositions)) {
    const isNS = direction === 'N' || direction === 'S';
    const greenActive = (SIM.signal.currentGroup === 'NS' && isNS) || (SIM.signal.currentGroup === 'EW' && !isNS);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 12, y - 26, 24, 52);
    ctx.fillStyle = greenActive ? '#39d98a' : '#cf4d4d';
    ctx.beginPath();
    ctx.arc(x, y - 12, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = !greenActive ? '#f5c451' : '#4b5563';
    ctx.beginPath();
    ctx.arc(x, y + 12, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawVehicle(vehicle) {
  const point = getPointOnRoute(vehicle.route, vehicle.progress);
  const angle = point.angle;
  ctx.save();
  ctx.translate(point.x * 1.2 + 450, point.y * 1.2 + 450);
  ctx.rotate(angle);
  ctx.fillStyle = vehicle.color;
  ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2, vehicle.length, vehicle.width);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(vehicle.length / 2 - 8, -vehicle.width / 2 + 2, 6, vehicle.width - 4);
  ctx.restore();
}

function renderFrame() {
  drawRoads();
  for (const vehicle of SIM.vehicles) {
    drawVehicle(vehicle);
  }
}

function update(dt) {
  if (!SIM.running) return;

  SIM.currentTime += dt;
  updateSignal(dt);
  updateSpawning(dt);
  updateVehicles(dt);
  const snapshot = computeMetricSnapshot();
  renderQueueInfo(snapshot.queueLengths);
  renderMetricText(snapshot);
  renderComparisonChart();
}

function loop(now) {
  const dt = (now - SIM.lastTimestamp) / 1000;
  SIM.lastTimestamp = now;

  const scaledDt = dt * SIM.speedMultiplier;
  update(scaledDt);
  renderFrame();
  requestAnimationFrame(loop);
}

function setupControls() {
  toggleRunBtn.addEventListener('click', () => {
    SIM.running = !SIM.running;
    toggleRunBtn.textContent = SIM.running ? 'Pause' : 'Play';
  });

  modeSelect.addEventListener('change', (event) => {
    SIM.mode = event.target.value;
    modeValue.textContent = SIM.mode === 'adaptive' ? 'Adaptive' : 'Fixed';
    if (SIM.mode === 'fixed') {
      SIM.signal.phase = 'NS_GREEN';
      SIM.signal.currentGroup = 'NS';
      SIM.signal.timer = 0;
    }
  });

  spawnRateSlider.addEventListener('input', (event) => {
    SIM.baseSpawnRate = Number(event.target.value);
    spawnRateValue.textContent = String(SIM.baseSpawnRate);
  });

  speedSlider.addEventListener('input', (event) => {
    SIM.speedMultiplier = Number(event.target.value);
    speedValue.textContent = `${SIM.speedMultiplier.toFixed(1)}x`;
  });

  maxWaitSlider.addEventListener('input', (event) => {
    SIM.maxWaitThreshold = Number(event.target.value);
    maxWaitValue.textContent = String(SIM.maxWaitThreshold);
  });

  spawnEmergencyBtn.addEventListener('click', () => {
    const direction = randomDirection();
    pushEmergencyVehicle(direction);
  });

  spawnRateValue.textContent = String(SIM.baseSpawnRate);
  speedValue.textContent = `${SIM.speedMultiplier.toFixed(1)}x`;
  maxWaitValue.textContent = String(SIM.maxWaitThreshold);
}

function bootstrap() {
  setupControls();
  renderQueueInfo({});
  renderComparisonChart();
  requestAnimationFrame(loop);
}

bootstrap();
