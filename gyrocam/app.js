'use strict';

const MAX_RECORDING_MS = 3 * 60 * 1000;
const MAX_RECORDING_BYTES = 150 * 1024 * 1024;
const TARGET_VIDEO_BITRATE = 6_000_000;
const RECORDING_FPS = 30;

const elements = {
  video: document.querySelector('#cameraVideo'),
  canvas: document.querySelector('#outputCanvas'),
  viewer: document.querySelector('#viewer'),
  emptyState: document.querySelector('#emptyState'),
  emptyTitle: document.querySelector('#emptyTitle'),
  emptyNote: document.querySelector('#emptyNote'),
  blockedState: document.querySelector('#blockedState'),
  blockedMessage: document.querySelector('#blockedMessage'),
  startButton: document.querySelector('#startButton'),
  stabilizeButton: document.querySelector('#stabilizeButton'),
  recenterButton: document.querySelector('#recenterButton'),
  switchButton: document.querySelector('#switchButton'),
  fullscreenButton: document.querySelector('#fullscreenButton'),
  stopButton: document.querySelector('#stopButton'),
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
  recordTimer: document.querySelector('#recordTimer'),
  recordSize: document.querySelector('#recordSize'),
  recordHint: document.querySelector('#recordHint'),
  recordResult: document.querySelector('#recordResult'),
  recordResultText: document.querySelector('#recordResultText'),
  saveButton: document.querySelector('#saveButton'),
  deleteButton: document.querySelector('#deleteButton'),
  downloadLink: document.querySelector('#downloadLink'),
  announcer: document.querySelector('#announcer')
};

const ctx = elements.canvas.getContext('2d', {
  alpha: false,
  desynchronized: true
});

const state = {
  stream: null,
  track: null,
  facingMode: 'environment',
  running: false,
  stabilizing: false,
  motionPermissionGranted: false,
  sensorSource: 'none',
  lastSensorTime: 0,
  lastOrientation: null,
  latestRate: { pitch: 0, yaw: 0, roll: 0 },
  rawPath: { pitch: 0, yaw: 0, roll: 0 },
  smoothPath: { pitch: 0, yaw: 0, roll: 0 },
  correction: { pitch: 0, yaw: 0, roll: 0 },
  lastFrameTime: 0,
  animationId: 0,
  videoFrameCallbackId: 0,
  recorder: null,
  recordingStream: null,
  recordingChunks: [],
  recordingBytes: 0,
  recordingStartedAt: 0,
  recordingTimerId: 0,
  recordingStopReason: '',
  recordingBlob: null,
  recordingFile: null,
  recordingFilename: '',
  resizeObserver: null,
  wakeLock: null
};

function setStatus(message, mode = 'normal') {
  const label = elements.sensorStatus.querySelector('span:last-child');
  label.textContent = message;
  elements.sensorStatus.classList.toggle('active', mode === 'active');
  elements.sensorStatus.classList.toggle('error', mode === 'error');
  elements.sensorStatus.title = message;
}

function announce(message) {
  elements.announcer.textContent = '';
  window.setTimeout(() => {
    elements.announcer.textContent = message;
  }, 30);
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

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(0, bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildFilename(extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `gyro-steady-${stamp}.${extension}`;
}

function getScreenAngle() {
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((Number(angle) % 360) + 360) % 360;
}

function mapDeviceRates(beta, gamma, alpha) {
  const angle = getScreenAngle();
  if (angle === 90) return { pitch: -gamma, yaw: beta, roll: alpha };
  if (angle === 270) return { pitch: gamma, yaw: -beta, roll: alpha };
  if (angle === 180) return { pitch: -beta, yaw: -gamma, roll: alpha };
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

  state.latestRate = mapDeviceRates(
    cleanRate(rotation.beta),
    cleanRate(rotation.gamma),
    cleanRate(rotation.alpha)
  );
  state.sensorSource = 'gyroscope';
  state.lastSensorTime = performance.now();
  elements.sensorValue.textContent = 'Gyro';
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

    state.latestRate = mapDeviceRates(
      cleanRate(betaRate),
      cleanRate(gammaRate),
      cleanRate(alphaRate)
    );
    state.sensorSource = 'orientation';
    state.lastSensorTime = now;
    elements.sensorValue.textContent = 'Motion';
  }

  state.lastOrientation = {
    alpha: event.alpha,
    beta: event.beta,
    gamma: event.gamma,
    time: now
  };
}

async function requestMotionAccess() {
  const hasMotionApi = 'DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window;
  if (!hasMotionApi) return false;

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
  removeMotionListeners();
  window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
  window.addEventListener('deviceorientation', handleDeviceOrientation, { passive: true });
}

function removeMotionListeners() {
  window.removeEventListener('devicemotion', handleDeviceMotion);
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
}

function resetStabilizer({ speak = true } = {}) {
  state.rawPath = { pitch: 0, yaw: 0, roll: 0 };
  state.smoothPath = { pitch: 0, yaw: 0, roll: 0 };
  state.correction = { pitch: 0, yaw: 0, roll: 0 };
  state.latestRate = { pitch: 0, yaw: 0, roll: 0 };
  state.lastOrientation = null;
  state.lastFrameTime = performance.now();
  if (speak) announce('Stabilizer centered');
}

function getCameraConstraints(facingMode) {
  return {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60 }
    }
  };
}

async function openCameraStream(facingMode) {
  try {
    return await navigator.mediaDevices.getUserMedia(getCameraConstraints(facingMode));
  } catch (error) {
    if (error?.name !== 'OverconstrainedError') throw error;
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facingMode } }
    });
  }
}

async function startCamera() {
  if (!checkEnvironment()) return;

  elements.startButton.disabled = true;
  elements.startButton.textContent = 'Starting...';
  setStatus('Requesting access');

  const motionPromise = requestMotionAccess();

  try {
    stopCameraTracks();
    const stream = await openCameraStream(state.facingMode);
    const motionGranted = await motionPromise;

    state.stream = stream;
    state.track = stream.getVideoTracks()[0] ?? null;
    state.motionPermissionGranted = motionGranted;
    elements.video.srcObject = stream;
    await elements.video.play();

    state.track?.addEventListener('ended', handleCameraEnded, { once: true });
    state.running = true;
    attachMotionListeners();
    configureHardwareZoom();
    resizeCanvas();
    resetStabilizer({ speak: false });
    updateRunningUi(true);
    await requestWakeLock();

    setStatus(motionGranted ? 'Camera + motion' : 'Camera only', motionGranted ? 'active' : 'normal');
    elements.sensorValue.textContent = motionGranted ? 'Waiting' : 'Denied';
    announce(motionGranted ? 'Camera and motion started' : 'Camera started without motion access');

    state.lastFrameTime = performance.now();
    cancelRenderLoop();
    scheduleNextFrame();
  } catch (error) {
    console.error(error);
    stopCameraTracks();
    state.running = false;
    updateRunningUi(false);
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
    case 'OverconstrainedError': return 'Camera setting unsupported';
    case 'SecurityError': return 'HTTPS required';
    default: return 'Could not start camera';
  }
}

function handleCameraEnded() {
  if (!state.running) return;
  stopCamera({ message: 'Camera ended' });
}

function stopCameraTracks() {
  if (state.stream) {
    for (const track of state.stream.getTracks()) track.stop();
  }
  state.stream = null;
  state.track = null;
  elements.video.pause();
  elements.video.srcObject = null;
}

function stopCamera({ message = 'Camera stopped', backgrounded = false } = {}) {
  if (isRecording()) stopRecording(backgrounded ? 'Stopped in background' : 'Camera stopped');

  state.running = false;
  state.stabilizing = false;
  cancelRenderLoop();
  removeMotionListeners();
  stopCameraTracks();
  releaseWakeLock();
  resetStabilizer({ speak: false });
  updateRunningUi(false, backgrounded);
  setStatus(backgrounded ? 'Paused for privacy' : message, backgrounded ? 'normal' : 'normal');
  announce(backgrounded ? 'Camera stopped because the page was hidden' : message);
}

function updateRunningUi(running, backgrounded = false) {
  elements.emptyState.hidden = running;
  elements.blockedState.hidden = true;
  elements.startButton.disabled = running;
  elements.startButton.textContent = backgrounded ? 'Resume camera' : 'Start camera';
  elements.emptyTitle.textContent = backgrounded ? 'Camera paused' : 'Steady your camera';
  elements.emptyNote.textContent = backgrounded ? 'Paused while this page was hidden.' : 'Best in Safari or Chrome over HTTPS.';

  elements.stabilizeButton.disabled = !running;
  elements.recenterButton.disabled = !running;
  elements.switchButton.disabled = !running || isRecording();
  elements.fullscreenButton.disabled = !running;
  elements.stopButton.disabled = !running;
  elements.recordButton.disabled = !running || !supportsRecording();

  if (!running) {
    elements.stabilizeButton.setAttribute('aria-pressed', 'false');
    elements.stabilizeButton.textContent = 'Steady off';
    elements.hardwareZoomCard.hidden = true;
    elements.video.classList.remove('visible');
    elements.showRaw.checked = false;
  }
}

function configureHardwareZoom() {
  elements.hardwareZoomCard.hidden = true;
  if (!state.track?.getCapabilities || !state.track?.applyConstraints) return;

  try {
    const capabilities = state.track.getCapabilities();
    const settings = state.track.getSettings?.() ?? {};
    if (!capabilities.zoom) return;

    const { min, max, step } = capabilities.zoom;
    elements.hardwareZoom.min = String(min);
    elements.hardwareZoom.max = String(max);
    elements.hardwareZoom.step = String(step || 0.1);
    elements.hardwareZoom.value = String(clamp(settings.zoom ?? min, min, max));
    elements.hardwareZoomOutput.textContent = `${Number(elements.hardwareZoom.value).toFixed(1)}x`;
    elements.hardwareZoomCard.hidden = false;
  } catch (error) {
    console.warn('Camera capability check failed:', error);
  }
}

async function applyHardwareZoom() {
  if (!state.track) return;
  const zoom = Number(elements.hardwareZoom.value);
  elements.hardwareZoomOutput.textContent = `${zoom.toFixed(1)}x`;
  try {
    await state.track.applyConstraints({ advanced: [{ zoom }] });
  } catch (error) {
    console.warn('Camera zoom constraint failed:', error);
    announce('This camera rejected that zoom');
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

  if (!elements.horizonLock.checked) state.correction.roll = 0;
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
  ctx.fillStyle = '#030507';
  ctx.fillRect(0, 0, cw, ch);

  if (elements.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    drawStabilizedVideo(cw, ch);
  }

  updateTelemetry();
  scheduleNextFrame();
}

function scheduleNextFrame() {
  if (!state.running) return;
  if (typeof elements.video.requestVideoFrameCallback === 'function') {
    state.videoFrameCallbackId = elements.video.requestVideoFrameCallback(renderFrame);
  } else {
    state.animationId = requestAnimationFrame(renderFrame);
  }
}

function cancelRenderLoop() {
  if (state.animationId) cancelAnimationFrame(state.animationId);
  if (state.videoFrameCallbackId && typeof elements.video.cancelVideoFrameCallback === 'function') {
    elements.video.cancelVideoFrameCallback(state.videoFrameCallbackId);
  }
  state.animationId = 0;
  state.videoFrameCallbackId = 0;
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

  const shiftX = clamp(
    Math.tan(yawRad) * horizontalPxPerRad * strength,
    -extraX * 0.94,
    extraX * 0.94
  );
  const shiftY = clamp(
    Math.tan(pitchRad) * verticalPxPerRad * strength,
    -extraY * 0.94,
    extraY * 0.94
  );

  const maxRollByCrop = Math.atan2(Math.min(extraX, extraY), Math.max(cw, ch) / 2);
  const maxRoll = Math.min(maxRollByCrop, 8 * Math.PI / 180);
  const safeRoll = clamp(rollRad * strength, -maxRoll, maxRoll);

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
    elements.sensorValue.textContent = state.motionPermissionGranted ? 'No data' : 'Denied';
  }
}

function toggleStabilization() {
  state.stabilizing = !state.stabilizing;
  elements.stabilizeButton.setAttribute('aria-pressed', String(state.stabilizing));
  elements.stabilizeButton.textContent = state.stabilizing ? 'Steady on' : 'Steady off';
  resetStabilizer({ speak: false });
  setStatus(state.stabilizing ? 'Stabilizing' : 'Camera active', 'active');
  announce(state.stabilizing ? 'Stabilization on' : 'Stabilization off');
}

async function switchCamera() {
  if (!state.running || isRecording()) return;

  const previousFacingMode = state.facingMode;
  const targetFacingMode = previousFacingMode === 'environment' ? 'user' : 'environment';
  elements.switchButton.disabled = true;
  setStatus('Switching camera');

  stopCameraTracks();

  try {
    const stream = await openCameraStream(targetFacingMode);
    state.facingMode = targetFacingMode;
    state.stream = stream;
    state.track = stream.getVideoTracks()[0] ?? null;
    elements.video.srcObject = stream;
    await elements.video.play();
    state.track?.addEventListener('ended', handleCameraEnded, { once: true });
    configureHardwareZoom();
    resetStabilizer({ speak: false });
    setStatus('Camera active', 'active');
    announce(targetFacingMode === 'environment' ? 'Rear camera' : 'Front camera');
  } catch (error) {
    console.warn('Camera switch failed:', error);
    state.facingMode = previousFacingMode;

    try {
      const restoredStream = await openCameraStream(previousFacingMode);
      state.stream = restoredStream;
      state.track = restoredStream.getVideoTracks()[0] ?? null;
      elements.video.srcObject = restoredStream;
      await elements.video.play();
      state.track?.addEventListener('ended', handleCameraEnded, { once: true });
      configureHardwareZoom();
      resetStabilizer({ speak: false });
      setStatus('Camera active', 'active');
      announce('Previous camera restored');
    } catch (restoreError) {
      console.error('Could not restore camera:', restoreError);
      stopCamera({ message: 'Camera unavailable' });
    }
  } finally {
    elements.switchButton.disabled = !state.running || isRecording();
  }
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await elements.viewer.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.warn('Fullscreen failed:', error);
    announce('Fullscreen is not available');
  }
}

function supportsRecording() {
  return Boolean(
    typeof elements.canvas.captureStream === 'function' &&
    typeof window.MediaRecorder === 'function'
  );
}

function chooseRecordingMimeType() {
  const types = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  return types.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
}

function isRecording() {
  return state.recorder?.state === 'recording' || state.recorder?.state === 'paused';
}

function updateRecordingUi() {
  const elapsed = state.recordingStartedAt ? performance.now() - state.recordingStartedAt : 0;
  elements.recordTimer.textContent = formatDuration(elapsed);
  elements.recordSize.textContent = formatBytes(state.recordingBytes);

  if (elapsed >= MAX_RECORDING_MS) stopRecording('3 minute limit reached');
}

function clearRecordingTimer() {
  if (state.recordingTimerId) clearInterval(state.recordingTimerId);
  state.recordingTimerId = 0;
}

function startRecordingTimer() {
  clearRecordingTimer();
  updateRecordingUi();
  state.recordingTimerId = window.setInterval(updateRecordingUi, 250);
}

function toggleRecording() {
  if (isRecording()) {
    stopRecording('Stopped by user');
    return;
  }
  startRecording();
}

function startRecording() {
  if (!state.running || !supportsRecording()) {
    announce('Recording is not supported here');
    return;
  }

  if (state.recordingBlob) {
    const replace = window.confirm('Replace the unsaved recording?');
    if (!replace) return;
    deleteRecording({ speak: false });
  }

  state.recordingChunks = [];
  state.recordingBytes = 0;
  state.recordingStopReason = '';
  state.recordingStartedAt = performance.now();

  const capture = elements.canvas.captureStream(RECORDING_FPS);
  state.recordingStream = capture;
  const mimeType = chooseRecordingMimeType();
  const options = mimeType
    ? { mimeType, videoBitsPerSecond: TARGET_VIDEO_BITRATE }
    : { videoBitsPerSecond: TARGET_VIDEO_BITRATE };

  try {
    state.recorder = new MediaRecorder(capture, options);
  } catch (error) {
    console.warn('Preferred recorder settings failed:', error);
    try {
      state.recorder = new MediaRecorder(capture);
    } catch (fallbackError) {
      console.error('Recorder creation failed:', fallbackError);
      cleanupRecordingCapture();
      setStatus('Recording unavailable', 'error');
      announce('Recording could not start');
      return;
    }
  }

  state.recorder.addEventListener('dataavailable', handleRecordingData);
  state.recorder.addEventListener('stop', finalizeRecording, { once: true });
  state.recorder.addEventListener('error', handleRecordingError, { once: true });

  try {
    state.recorder.start(1000);
  } catch (error) {
    console.error('Recorder start failed:', error);
    cleanupRecordingCapture();
    setStatus('Recording unavailable', 'error');
    announce('Recording could not start');
    return;
  }

  elements.recordButton.classList.add('recording');
  elements.recordButton.textContent = '■ Stop';
  elements.recordIndicator.hidden = false;
  elements.recordResult.hidden = true;
  elements.recordHint.textContent = 'Recording stays in memory until saved or deleted';
  elements.switchButton.disabled = true;
  startRecordingTimer();
  announce('Recording started');
}

function handleRecordingData(event) {
  if (!event.data?.size) return;

  state.recordingChunks.push(event.data);
  state.recordingBytes += event.data.size;
  elements.recordSize.textContent = formatBytes(state.recordingBytes);

  if (state.recordingBytes >= MAX_RECORDING_BYTES) {
    stopRecording('150 MB limit reached');
  }
}

function stopRecording(reason = 'Recording stopped') {
  if (!isRecording()) return;
  state.recordingStopReason = reason;
  clearRecordingTimer();
  try {
    state.recorder.stop();
  } catch (error) {
    console.warn('Recorder stop failed:', error);
    cleanupRecordingCapture();
    resetRecordControls();
  }
}

function finalizeRecording() {
  clearRecordingTimer();
  const recorderType = state.recorder?.mimeType || chooseRecordingMimeType() || 'video/webm';
  const chunks = state.recordingChunks;

  cleanupRecordingCapture();
  resetRecordControls();

  if (!chunks.length) {
    state.recordingChunks = [];
    setStatus('Recording failed', 'error');
    announce('No video was recorded');
    return;
  }

  const blob = new Blob(chunks, { type: recorderType });
  const extension = recorderType.includes('mp4') ? 'mp4' : 'webm';
  const filename = buildFilename(extension);

  state.recordingBlob = blob;
  state.recordingFilename = filename;
  try {
    state.recordingFile = new File([blob], filename, { type: recorderType });
  } catch (error) {
    state.recordingFile = null;
  }
  state.recordingChunks = [];
  state.recordingBytes = blob.size;

  elements.recordResultText.textContent = `${formatBytes(blob.size)} ready`;
  elements.recordResult.hidden = false;
  elements.recordHint.textContent = 'Save or share, then delete to release memory';
  elements.recordTimer.textContent = formatDuration(performance.now() - state.recordingStartedAt);
  elements.recordSize.textContent = formatBytes(blob.size);

  const reason = state.recordingStopReason;
  setStatus(reason.includes('limit') ? reason : 'Recording ready', reason.includes('limit') ? 'normal' : 'active');
  announce(`${reason}. Recording ready to save`);
}

function handleRecordingError(event) {
  console.error('MediaRecorder error:', event.error || event);
  clearRecordingTimer();
  cleanupRecordingCapture();
  resetRecordControls();
  state.recordingChunks = [];
  state.recordingBytes = 0;
  setStatus('Recording failed', 'error');
  announce('Recording failed');
}

function cleanupRecordingCapture() {
  if (state.recordingStream) {
    for (const track of state.recordingStream.getTracks()) track.stop();
  }
  state.recordingStream = null;
  state.recorder = null;
}

function resetRecordControls() {
  elements.recordButton.classList.remove('recording');
  elements.recordButton.textContent = '● Record';
  elements.recordIndicator.hidden = true;
  elements.switchButton.disabled = !state.running;
  elements.recordButton.disabled = !state.running || !supportsRecording();
}

async function saveRecording() {
  if (!state.recordingBlob) return;

  const file = state.recordingFile;
  if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Gyro Steady recording'
      });
      announce('Share sheet opened');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.warn('File sharing failed; using download fallback:', error);
    }
  }

  const url = URL.createObjectURL(state.recordingBlob);
  elements.downloadLink.href = url;
  elements.downloadLink.download = state.recordingFilename;
  elements.downloadLink.rel = 'noopener';
  elements.downloadLink.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    elements.downloadLink.removeAttribute('href');
  }, 60_000);
  announce('Save requested');
}

function deleteRecording({ speak = true } = {}) {
  state.recordingBlob = null;
  state.recordingFile = null;
  state.recordingFilename = '';
  state.recordingChunks = [];
  state.recordingBytes = 0;
  state.recordingStartedAt = 0;
  elements.recordResult.hidden = true;
  elements.recordTimer.textContent = '0:00';
  elements.recordSize.textContent = '0 MB';
  elements.recordHint.textContent = 'Local only · 3 minute / 150 MB limit';
  if (speak) announce('Recording deleted from this page');
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || document.hidden) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => {
      state.wakeLock = null;
    }, { once: true });
  } catch (error) {
    console.warn('Wake lock unavailable:', error);
  }
}

function releaseWakeLock() {
  if (!state.wakeLock) return;
  state.wakeLock.release().catch(() => {});
  state.wakeLock = null;
}

function updateControlOutputs() {
  elements.cropZoomOutput.textContent = `${Number(elements.cropZoom.value).toFixed(2)}x`;
  elements.strengthOutput.textContent = `${elements.strength.value}%`;
  elements.fieldOfViewOutput.textContent = `${elements.fieldOfView.value}°`;
  elements.hardwareZoomOutput.textContent = `${Number(elements.hardwareZoom.value).toFixed(1)}x`;
}

function blockApp(message) {
  state.running = false;
  elements.emptyState.hidden = true;
  elements.blockedState.hidden = false;
  elements.blockedMessage.textContent = message;
  elements.startButton.disabled = true;
  setStatus('Unavailable', 'error');
}

function checkEnvironment() {
  if (window.self !== window.top) {
    blockApp('Open this page directly in Safari or Chrome.');
    return false;
  }
  if (!window.isSecureContext) {
    blockApp('HTTPS or localhost is required.');
    return false;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    blockApp('Camera access is not supported in this browser.');
    return false;
  }
  if (!ctx) {
    blockApp('Canvas rendering is not supported.');
    return false;
  }
  return true;
}

function handleVisibilityChange() {
  if (document.hidden && state.running) {
    stopCamera({ backgrounded: true });
  }
}

function cleanupPage() {
  clearRecordingTimer();
  if (isRecording()) {
    try { state.recorder.stop(); } catch (error) { console.warn(error); }
  }
  cleanupRecordingCapture();
  cancelRenderLoop();
  removeMotionListeners();
  stopCameraTracks();
  releaseWakeLock();
  deleteRecording({ speak: false });
}

elements.startButton.addEventListener('click', startCamera);
elements.stabilizeButton.addEventListener('click', toggleStabilization);
elements.recenterButton.addEventListener('click', () => resetStabilizer());
elements.switchButton.addEventListener('click', switchCamera);
elements.fullscreenButton.addEventListener('click', toggleFullscreen);
elements.stopButton.addEventListener('click', () => stopCamera());
elements.recordButton.addEventListener('click', toggleRecording);
elements.saveButton.addEventListener('click', saveRecording);
elements.deleteButton.addEventListener('click', () => deleteRecording());

elements.hardwareZoom.addEventListener('input', updateControlOutputs);
elements.hardwareZoom.addEventListener('change', applyHardwareZoom);
elements.cropZoom.addEventListener('input', updateControlOutputs);
elements.strength.addEventListener('input', updateControlOutputs);
elements.fieldOfView.addEventListener('input', updateControlOutputs);
elements.showRaw.addEventListener('change', () => {
  elements.video.classList.toggle('visible', elements.showRaw.checked && state.running);
});
elements.showTelemetry.addEventListener('change', () => {
  elements.hud.hidden = !elements.showTelemetry.checked;
});

window.addEventListener('resize', resizeCanvas, { passive: true });
screen.orientation?.addEventListener?.('change', () => resetStabilizer({ speak: false }));
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pagehide', cleanupPage, { once: true });

if ('ResizeObserver' in window) {
  state.resizeObserver = new ResizeObserver(resizeCanvas);
  state.resizeObserver.observe(elements.viewer);
}

if (!elements.viewer.requestFullscreen) {
  elements.fullscreenButton.hidden = true;
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(error => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

updateControlOutputs();
resizeCanvas();
checkEnvironment();
