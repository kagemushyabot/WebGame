let portraitOverlayActive = false;
let playGuardsBound = false;
let singleTouchOnControl = false;

const PLAY_TOUCH_ALLOW = '#padLook, #padFire, #btnQuit, #btnMute, #btnRecenter, .topbar';

export function isMobileDevice() {
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isPortrait() {
  const landscapeMq = window.matchMedia('(orientation: landscape)');
  if (landscapeMq.matches) return false;
  const portraitMq = window.matchMedia('(orientation: portrait)');
  if (portraitMq.matches) return true;

  const type = screen.orientation?.type;
  if (type) return type.startsWith('portrait');

  const o = window.orientation;
  if (typeof o === 'number' && (o === 90 || o === -90 || o === 270)) return false;

  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  return h > w;
}

export function isPortraitBlocked() {
  return isMobileDevice() && isPortrait();
}

export function isGameplayOrientationBlocked() {
  return portraitOverlayActive;
}

export function setupOrientationGate(overlayEl) {
  function refresh() {
    portraitOverlayActive = isPortraitBlocked();
    if (overlayEl) overlayEl.classList.toggle('hidden', !portraitOverlayActive);
  }
  refresh();
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  window.visualViewport?.addEventListener('resize', refresh);
  screen.orientation?.addEventListener?.('change', refresh);
  landscapeMqWatch(refresh);
  return refresh;
}

function landscapeMqWatch(refresh) {
  const mq = window.matchMedia('(orientation: landscape)');
  const onChange = () => refresh();
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}

function tryOrientationLock() {
  if (!isMobileDevice()) return;
  screen.orientation?.lock?.('landscape').catch(() => {});
}

function isFullscreenActive() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

export function applyImmersiveMode(on) {
  document.documentElement.classList.toggle('immersive-mode', on);
  if (on && isMobileDevice()) {
    requestAnimationFrame(() => {
      window.scrollTo(0, 1);
      requestAnimationFrame(() => window.scrollTo(0, 0));
    });
  }
}

function invokeRequestFullscreen(el) {
  const req =
    el.requestFullscreen?.bind(el) ||
    el.webkitRequestFullscreen?.bind(el) ||
    el.mozRequestFullScreen?.bind(el) ||
    el.msRequestFullscreen?.bind(el);
  if (!req) return null;
  try {
    return req({ navigationUI: 'hide' });
  } catch {
    try {
      return req();
    } catch {
      return null;
    }
  }
}

export function requestGameFullscreen(container) {
  applyImmersiveMode(true);

  if (isFullscreenActive()) {
    tryOrientationLock();
    return;
  }

  const targets = [container, document.documentElement, document.body].filter(Boolean);
  for (const el of targets) {
    const p = invokeRequestFullscreen(el);
    if (p == null) continue;
    if (typeof p.then === 'function') {
      p.then(() => tryOrientationLock()).catch(() => {});
    } else {
      tryOrientationLock();
    }
    return;
  }
}

export function exitGameFullscreen() {
  applyImmersiveMode(false);
  const exit =
    document.exitFullscreen?.bind(document) ||
    document.webkitExitFullscreen?.bind(document) ||
    document.mozCancelFullScreen?.bind(document) ||
    document.msExitFullscreen?.bind(document);
  if (exit && isFullscreenActive()) exit().catch(() => {});
  screen.orientation?.unlock?.();
}

function touchAllowedTarget(target) {
  return target instanceof Element && !!target.closest(PLAY_TOUCH_ALLOW);
}

function onPlayTouchStart(e) {
  if (!document.documentElement.classList.contains('game-playing')) return;
  if (e.touches.length > 1) {
    e.preventDefault();
    singleTouchOnControl = false;
    return;
  }
  singleTouchOnControl = touchAllowedTarget(e.target);
}

function onPlayTouchMove(e) {
  if (!document.documentElement.classList.contains('game-playing')) return;
  if (e.touches.length > 1) {
    e.preventDefault();
    return;
  }
  if (singleTouchOnControl || touchAllowedTarget(e.target)) return;
  e.preventDefault();
}

function onPlayTouchEnd() {
  if (!document.documentElement.classList.contains('game-playing')) {
    singleTouchOnControl = false;
    return;
  }
  singleTouchOnControl = false;
}

function onPlayGesture(e) {
  if (document.documentElement.classList.contains('game-playing')) e.preventDefault();
}

function onPlayWheel(e) {
  if (!document.documentElement.classList.contains('game-playing')) return;
  if (e.ctrlKey) e.preventDefault();
}

function bindPlayTouchGuards() {
  if (playGuardsBound) return;
  playGuardsBound = true;
  document.addEventListener('touchstart', onPlayTouchStart, { passive: false, capture: true });
  document.addEventListener('touchmove', onPlayTouchMove, { passive: false, capture: true });
  document.addEventListener('touchend', onPlayTouchEnd, { passive: true, capture: true });
  document.addEventListener('touchcancel', onPlayTouchEnd, { passive: true, capture: true });
  document.addEventListener('gesturestart', onPlayGesture, { passive: false, capture: true });
  document.addEventListener('gesturechange', onPlayGesture, { passive: false, capture: true });
  document.addEventListener('gestureend', onPlayGesture, { passive: false, capture: true });
  window.addEventListener('wheel', onPlayWheel, { passive: false, capture: true });
}

function unbindPlayTouchGuards() {
  if (!playGuardsBound) return;
  playGuardsBound = false;
  document.removeEventListener('touchstart', onPlayTouchStart, true);
  document.removeEventListener('touchmove', onPlayTouchMove, true);
  document.removeEventListener('touchend', onPlayTouchEnd, true);
  document.removeEventListener('touchcancel', onPlayTouchEnd, true);
  singleTouchOnControl = false;
  document.removeEventListener('gesturestart', onPlayGesture, true);
  document.removeEventListener('gesturechange', onPlayGesture, true);
  document.removeEventListener('gestureend', onPlayGesture, true);
  window.removeEventListener('wheel', onPlayWheel, true);
}

export function setPlaySessionActive(active) {
  document.documentElement.classList.toggle('game-playing', active);
  if (active) bindPlayTouchGuards();
  else {
    unbindPlayTouchGuards();
    singleTouchOnControl = false;
  }
}