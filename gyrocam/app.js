'use strict';

const elements = {
  video: document.querySelector('#cameraVideo'),
  canvas: document.querySelector('#outputCanvas'),
  viewer: document.querySelector('#viewer'),
  emptyState: document.querySelector('#emptyState'),
  startButton: document.querySelector('#startButton'),
  stabilizeButton: document.querySelector('#stabilizeButton'),
  recenterButton: document.querySelector('#recenterButton'),
  switchButton: document.querySelector('#switchButton'),
  fullscreenButton: document.querySelector('#fullscreenButton'),
  sensorStatus: document.querySelector('#sensorStatus'),
  sensorValue: document.querySelector('#sensorValue'),
  yawValue: document.querySelector('#yawValue'),
  pitchValue: document.querySelector('#pitchValue'),
  rollValue: document.querySelector('#rollValue'),
  cropZoom: document.querySelector('#cropZoom'),
  cropZoomOutput: document.querySelector('#cropZoomOutput'),
  strength: document.querySelector('#strength'),
  strengthOutput: document.querySelector('#strengthOutput'),
  fieldOfView: document.querySelector('#fieldOfView'),
  fieldOfViewOutput: document.querySelector('#fieldOfViewOutput'),
  horizonLock: document.querySelector('#horizonLock'),
  showRaw: document.querySelector('#showRaw'),
  showTelemetry: document.querySelector('#showTelemetry'),
  hud: document.querySelector('#hud'),
  hardwareZoomCard: document.querySelector('#hardwareZoomCard'),
  hardwareZoom: document.querySelector('#hardwareZoom'),
  hardwareZoomOutput: document.querySelector('#hardwareZoomOutput'),
  recordButton: document.querySelector('#recordButton'),
  recordIndicator: document.querySelector('#recordIndicator'),
  downloadLink: document.querySelector('#downloadLink'),
  announcer: document.querySelector('#announcer')
};

const ctx = elements.canvas.getContext('2d', { alpha: false, desynchronized: true });

const state = {
  stream: null,
  track: null,
  facingMode: 'environment',
  running: false,
  stabilizing: false,
  sensorSource: 'none',
  lastSensorTime: 0,
  lastOrientation: null,
  latestRate: { pitch: 0, yaw: 0, roll: 0 },
  rawPath: { pitch: 0, yaw: 0, roll: 0 },
  smoothPath: { pitch: 0, yaw: 0, roll: 0 },
  correction: { pitch: 0, yaw: 0, roll: 0 },
  lastFrameTime: 0,
  animationId: 0,
  recorder: null,
  recordingChunks: [],
  recordingUrl: '',
  resizeObserver: null
};

function setStatus(message, mode = 'normal') {
  elements.sensorStatus.querySelector('span:last-child').textContent = message;
  elements.sensorStatus.classList.toggle('active', mode === 'active');
  elements.sensorStatus.classList.toggle('error', mode === 'error');
}

function announce(message) {
  elements.announcer.textContent = '';
  window.setTimeout(() => { elements.announcer.textContent = message; }, 30);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapDegrees(value) {
  let wrapped = value;
  while (wrapped > 180) wrapped -= 360;
  while (wrapped < -180) wrapped += 360;
  return wrapped;
}

function getScreenAngle() {
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((Number(angle) % 360) + 360) % 360;
}

function mapDeviceRates(beta, gamma, alpha) {
  const angle = getScreenAngle();
  if (angle === 90) {
    return { pitch: -gamma, yaw: beta, roll: alpha };
  }
  if (angle === 270) {
    return { pitch: gamma, yaw: -beta, roll: alpha };
  }
  if (angle === 180) {
    return { pitch: -beta, yaw: -gamma, roll: alpha };
  }
  return { pitch: beta, yaw: gamma, roll: alpha };
}

function cleanRate(value) {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) < 0.12) return 0;
  return clamp(value, -720, 720);
}

function handleDeviceMotion(event) {
  const rotation = event.rotationRate;
  if (!rotation) return;

  const mapped = mapDeviceRates(
    cleanRate(rotation.beta),
    cleanRate(rotation.gamma),
    cleanRate(rotation.alpha)
  );

  state.latestRate = mapped;
  state.sensorSource = 'gyroscope';
  state.lastSensorTime = performance.now();
  elements.sensorValue.textContent = 'Gyroscope';
}

function handleDeviceOrientation(event) {
  const now = performance.now();
  if (state.sensorSource === 'gyroscope' && now - state.lastSensorTime < 250) return;
  if (![event.alpha, event.beta, event.gamma].every(Number.isFinite)) return;

  if (state.lastOrientation) {
    const dt = clamp((now - state.lastOrientation.time) / 1000, 0.005, 0.1);
    const alphaRate = wrapDegrees(event.alpha - state.lastOrientation.alpha) / dt;
    const betaRate = wrapDegrees(event.beta - state.lastOrientation.beta) / dt;
    const gammaRate = wrapDegrees(event.gamma - state.lastOrientation.gamma) / dt;
    state.latestRate = mapDeviceRates(cleanRate(betaRate), cleanRate(gammaRate), cleanRate(alphaRate));
    state.sensorSource = 'orientation';
    state.lastSensorTime = now;
    elements.sensorValue.textContent = 'Orientation';
  }

  state.lastOrientation = {
    alpha: event.alpha,
    beta: event.beta,
    gamma: event.gamma,
    time: now
  };
}

async function requestMotionAccess() {
  const requests = [];

  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    requests.push(DeviceMotionEvent.requestPermission());
  }
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    requests.push(DeviceOrientationEvent.requestPermission());
  }

  if (!requests.length) return true;

  try {
    const results = await Promise.all(requests);
    return results.every(result => result === 'granted');
  } catch (error) {
    console.warn('Motion permission request failed:', error);
    return false;
  }
}

function attachMotionListeners() {
  window.removeEventListener('devicemotion', handleDeviceMotion);
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
  window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
  window.addEventListener('deviceorientation', handleDeviceOrientation, { passive: true });
}

function resetStabilizer() {
  state.rawPath = { pitch: 0, yaw: 0, roll: 0 };
  state.smoothPath = { pitch: 0, yaw: 0, roll: 0 };
  state.correction = { pitch: 0, yaw: 0, roll: 0 };
  state.latestRate = { pitch: 0, yaw: 0, roll: 0 };
  state.lastFrameTime = performance.now();
  announce('Stabilizer recentered');
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('Camera API unavailable', 'error');
    announce('This browser does not support camera access.');
    return;
  }

  elements.startButton.disabled = true;
  elements.startButton.textContent = 'Requesting access…';
  setStatus('Requesting permissions');

  const motionPromise = requestMotionAccess();

  try {
    stopCameraTracks();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60, min: 24, max: 60 }
      }
    });

    const motionGranted = await motionPromise;
    state.stream = stream;
    state.track = stream.getVideoTracks()[0] ?? null;
    elements.video.srcObject = stream;
    await elements.video.play();

    state.running = true;
    attachMotionListeners();
    configureHardwareZoom();
    resizeCanvas();
    resetStabilizer();

    elements.emptyState.hidden = true;
    elements.stabilizeButton.disabled = false;
    elements.recenterButton.disabled = false;
    elements.switchButton.disabled = false;
    elements.fullscreenButton.disabled = false;
    elements.recordButton.disabled = !supportsRecording();

    setStatus(motionGranted ? 'Camera + motion ready' : 'Camera ready; no motion access', motionGranted ? 'active' : 'normal');
    if (!motionGranted) {
      elements.sensorValue.textContent = 'Denied';
      announce('Camera started. Motion permission was not granted, so stabilization may be unavailable.');
    } else {
      announce('Camera and motion sensors started.');
    }

    state.lastFrameTime = performance.now();
    cancelAnimationFrame(state.animationId);
    state.animationId = requestAnimationFrame(renderFrame);
  } catch (error) {
    console.error(error);
    setStatus(formatCameraError(error), 'error');
    announce(formatCameraError(error));
    elements.startButton.disabled = false;
    elements.startButton.textContent = 'Try again';
  }
}

function formatCameraError(error) {
  switch (error?.name) {
    case 'NotAllowedError': return 'Camera permission denied';
    case 'NotFoundError': return 'No camera found';
    case 'NotReadableError': return 'Camera is busy';
    case 'OverconstrainedError': return 'Camera settings unsupported';
    case 'SecurityError': return 'HTTPS is required';
    default: return 'Could not start camera';
  }
}

function stopCameraTracks() {
  if (state.stream) {
    for (const track of state.stream.getTracks()) track.stop();
  }
  state.stream = null;
  state.track = null;
}

function configureHardwareZoom() {
  elements.hardwareZoomCard.hidden = true;
  if (!state.track?.getCapabilities || !state.track?.applyConstraints) return;

  const capabilities = state.track.getCapabilities();
  const settings = state.track.getSettings?.() ?? {};
  if (!capabilities.zoom) return;

  const { min, max, step } = capabilities.zoom;
  elements.hardwareZoom.min = String(min);
  elements.hardwareZoom.max = String(max);
  elements.hardwareZoom.step = String(step || 0.1);
  elements.hardwareZoom.value = String(clamp(settings.zoom ?? min, min, max));
  elements.hardwareZoomOutput.textContent = `${Number(elements.hardwareZoom.value).toFixed(1)}×`;
  elements.hardwareZoomCard.hidden = false;
}

async function applyHardwareZoom() {
  if (!state.track) return;
  const zoom = Number(elements.hardwareZoom.value);
  elements.hardwareZoomOutput.textContent = `${zoom.toFixed(1)}×`;
  try {
    await state.track.applyConstraints({ advanced: [{ zoom }] });
  } catch (error) {
    console.warn('Camera zoom constraint failed:', error);
    announce('This camera rejected the requested zoom value.');
  }
}

function resizeCanvas() {
  const rect = elements.viewer.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (elements.canvas.width !== width || elements.canvas.height !== height) {
    elements.canvas.width = width;
    elements.canvas.height = height;
  }
}

function updateMotionPath(dt) {
  if (!state.stabilizing || performance.now() - state.lastSensorTime > 700) {
    const decay = Math.exp(-dt * 12);
    for (const axis of ['pitch', 'yaw', 'roll']) {
      state.correction[axis] *= decay;
      state.rawPath[axis] *= decay;
      state.smoothPath[axis] *= decay;
    }
    return;
  }

  const strength = Number(elements.strength.value) / 100;
  const tau = 0.035 + strength * 0.58;
  const follow = 1 - Math.exp(-dt / tau);

  for (const axis of ['pitch', 'yaw', 'roll']) {
    const rate = state.latestRate[axis];
    state.rawPath[axis] += rate * dt;
    state.smoothPath[axis] += (state.rawPath[axis] - state.smoothPath[axis]) * follow;
    state.correction[axis] = state.rawPath[axis] - state.smoothPath[axis];
  }

  if (!elements.horizonLock.checked) {
    state.correction.roll = 0;
  }
}

function renderFrame(timestamp) {
  if (!state.running) return;

  resizeCanvas();
  const dt = clamp((timestamp - (state.lastFrameTime || timestamp)) / 1000, 0, 0.05);
  state.lastFrameTime = timestamp;
  updateMotionPath(dt);

  const cw = elements.canvas.width;
  const ch = elements.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#050609';
  ctx.fillRect(0, 0, cw, ch);

  if (elements.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    drawStabilizedVideo(cw, ch);
  }

  updateTelemetry();
  state.animationId = requestAnimationFrame(renderFrame);
}

function drawStabilizedVideo(cw, ch) {
  const vw = elements.video.videoWidth || 1920;
  const vh = elements.video.videoHeight || 1080;
  const cropZoom = Number(elements.cropZoom.value);
  const fov = Number(elements.fieldOfView.value) * Math.PI / 180;
  const strength = Number(elements.strength.value) / 100;

  const coverScale = Math.max(cw / vw, ch / vh);
  const scale = coverScale * cropZoom;
  const extraX = Math.max(0, (vw * scale - cw) / 2);
  const extraY = Math.max(0, (vh * scale - ch) / 2);

  const horizontalPxPerRad = cw / (2 * Math.tan(fov / 2));
  const verticalFov = 2 * Math.atan(Math.tan(fov / 2) * (ch / cw));
  const verticalPxPerRad = ch / (2 * Math.tan(verticalFov / 2));

  const yawRad = state.correction.yaw * Math.PI / 180;
  const pitchRad = state.correction.pitch * Math.PI / 180;
  const rollRad = state.correction.roll * Math.PI / 180;

  const shiftX = clamp(Math.tan(yawRad) * horizontalPxPerRad * strength, -extraX * 0.94, extraX * 0.94);
  const shiftY = clamp(Math.tan(pitchRad) * verticalPxPerRad * strength, -extraY * 0.94, extraY * 0.94);

  const maxRollByCrop = Math.atan2(Math.min(extraX, extraY), Math.max(cw, ch) / 2);
  const safeRoll = clamp(rollRad * strength, -Math.min(maxRollByCrop, 8 * Math.PI / 180), Math.min(maxRollByCrop, 8 * Math.PI / 180));

  ctx.save();
  ctx.translate(cw / 2 + shiftX, ch / 2 + shiftY);
  ctx.rotate(safeRoll);
  ctx.scale(scale, scale);
  ctx.drawImage(elements.video, -vw / 2, -vh / 2, vw, vh);
  ctx.restore();
}

function updateTelemetry() {
  elements.yawValue.textContent = `${state.correction.yaw.toFixed(1)}°`;
  elements.pitchValue.textContent = `${state.correction.pitch.toFixed(1)}°`;
  elements.rollValue.textContent = `${state.correction.roll.toFixed(1)}°`;

  if (state.running && performance.now() - state.lastSensorTime > 1200) {
    elements.sensorValue.textContent = 'No data';
  }
}

function toggleStabilization() {
  state.stabilizing = !state.stabilizing;
  elements.stabilizeButton.setAttribute('aria-pressed', String(state.stabilizing));
  elements.stabilizeButton.textContent = state.stabilizing ? 'Stabilization on' : 'Stabilization off';
  resetStabilizer();
  setStatus(state.stabilizing ? 'Stabilizing' : 'Camera active', 'active');
  announce(state.stabilizing ? 'Stabilization enabled' : 'Stabilization disabled');
}

async function switchCamera() {
  const previousFacingMode = state.facingMode;
  const targetFacingMode = previousFacingMode === 'environment' ? 'user' : 'environment';
  elements.switchButton.disabled = true;
  stopCameraTracks();

  const requestStream = facingMode => navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60, min: 24, max: 60 }
    }
  });

  try {
    const stream = await requestStream(targetFacingMode);
    state.facingMode = targetFacingMode;
    state.stream = stream;
    state.track = stream.getVideoTracks()[0] ?? null;
    elements.video.srcObject = stream;
    await elements.video.play();
    configureHardwareZoom();
    resetStabilizer();
    setStatus('Camera active', 'active');
    announce(`${targetFacingMode === 'environment' ? 'Rear' : 'Front'} camera requested`);
  } catch (error) {
    console.warn('Camera switch failed:', error);
    state.facingMode = previousFacingMode;

    try {
      const restoredStream = await requestStream(previousFacingMode);
      state.stream = restoredStream;
      state.track = restoredStream.getVideoTracks()[0] ?? null;
      elements.video.srcObject = restoredStream;
      await elements.video.play();
      configureHardwareZoom();
      resetStabilizer();
      setStatus('Camera active', 'active');
      announce('Could not switch cameras. The previous camera was restored.');
    } catch (restoreError) {
      console.error('Could not restore camera:', restoreError);
      state.running = false;
      setStatus('Could not reopen camera', 'error');
      announce('Could not switch or reopen the camera. Reload the page and try again.');
    }
  } finally {
    elements.switchButton.disabled = false;
  }
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await elements.viewer.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  } catch (error) {
    console.warn('Fullscreen failed:', error);
  }
}

function supportsRecording() {
  return Boolean(elements.canvas.captureStream && window.MediaRecorder);
}

function chooseRecordingMimeType() {
  const types = [
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  return types.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
}

function toggleRecording() {
  if (state.recorder?.state === 'recording') {
    state.recorder.stop();
    return;
  }

  if (!supportsRecording()) {
    announce('Recording is not supported by this browser.');
    return;
  }

  if (state.recordingUrl) URL.revokeObjectURL(state.recordingUrl);
  elements.downloadLink.hidden = true;
  state.recordingChunks = [];

  const capture = elements.canvas.captureStream(30);
  const mimeType = chooseRecordingMimeType();
  const options = mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 };

  try {
    state.recorder = new MediaRecorder(capture, options);
  } catch (error) {
    console.warn(error);
    state.recorder = new MediaRecorder(capture);
  }

  state.recorder.addEventListener('dataavailable', event => {
    if (event.data?.size) state.recordingChunks.push(event.data);
  });

  state.recorder.addEventListener('stop', () => {
    const type = state.recorder.mimeType || mimeType || 'video/webm';
    const blob = new Blob(state.recordingChunks, { type });
    state.recordingUrl = URL.createObjectURL(blob);
    const extension = type.includes('mp4') ? 'mp4' : 'webm';
    elements.downloadLink.href = state.recordingUrl;
    elements.downloadLink.download = `gyro-steady-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
    elements.downloadLink.hidden = false;
    elements.recordButton.textContent = 'Record stabilized video';
    elements.recordIndicator.hidden = true;
    announce('Recording stopped. Download is ready.');
  });

  state.recorder.start(1000);
  elements.recordButton.textContent = 'Stop recording';
  elements.recordIndicator.hidden = false;
  announce('Recording started.');
}

function updateControlOutputs() {
  elements.cropZoomOutput.textContent = `${Number(elements.cropZoom.value).toFixed(2)}×`;
  elements.strengthOutput.textContent = `${elements.strength.value}%`;
  elements.fieldOfViewOutput.textContent = `${elements.fieldOfView.value}°`;
}

elements.startButton.addEventListener('click', startCamera);
elements.stabilizeButton.addEventListener('click', toggleStabilization);
elements.recenterButton.addEventListener('click', resetStabilizer);
elements.switchButton.addEventListener('click', switchCamera);
elements.fullscreenButton.addEventListener('click', toggleFullscreen);
elements.recordButton.addEventListener('click', toggleRecording);
elements.hardwareZoom.addEventListener('input', applyHardwareZoom);

elements.cropZoom.addEventListener('input', updateControlOutputs);
elements.strength.addEventListener('input', updateControlOutputs);
elements.fieldOfView.addEventListener('input', updateControlOutputs);
elements.showRaw.addEventListener('change', () => elements.video.classList.toggle('visible', elements.showRaw.checked));
elements.showTelemetry.addEventListener('change', () => { elements.hud.hidden = !elements.showTelemetry.checked; });

window.addEventListener('resize', resizeCanvas, { passive: true });
screen.orientation?.addEventListener?.('change', resetStabilizer);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) state.latestRate = { pitch: 0, yaw: 0, roll: 0 };
  resetStabilizer();
});
window.addEventListener('beforeunload', () => {
  stopCameraTracks();
  if (state.recordingUrl) URL.revokeObjectURL(state.recordingUrl);
});

if ('ResizeObserver' in window) {
  state.resizeObserver = new ResizeObserver(resizeCanvas);
  state.resizeObserver.observe(elements.viewer);
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
}

updateControlOutputs();
resizeCanvas();
