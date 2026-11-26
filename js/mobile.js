let portraitOverlayActive = false;
let playGuardsBound = false;
let singleTouchOnControl = false;
let viewportSyncBound = false;
let layoutRefreshCallback = null;
let refreshTimers = [];
let gameContainerRef = null;
let wasPortraitBlocked = false;

const PLAY_TOUCH_ALLOW = '#padLook, #padFire, #btnClose, #btnMute, #btnRecenter, .topbar';

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

export function setLayoutRefreshHandler(fn) {
  layoutRefreshCallback = fn;
}

export function syncViewportSize() {
  const vv = window.visualViewport;
  const vh = vv?.height ?? window.innerHeight;
  const vw = vv?.width ?? window.innerWidth;
  document.documentElement.style.setProperty('--app-vh', `${vh}px`);
  document.documentElement.style.setProperty('--app-vw', `${vw}px`);
}

/** @deprecated use syncViewportSize */
export function syncViewportHeight() {
  syncViewportSize();
}

function onViewportResizeForSync() {
  syncViewportSize();
}

function bindViewportSyncListener() {
  if (viewportSyncBound) return;
  viewportSyncBound = true;
  window.visualViewport?.addEventListener('resize', onViewportResizeForSync);
}

function unbindViewportSyncListener() {
  if (!viewportSyncBound) return;
  viewportSyncBound = false;
  window.visualViewport?.removeEventListener('resize', onViewportResizeForSync);
}

export function scheduleLayoutRefresh() {
  syncViewportSize();
  if (!layoutRefreshCallback) return;
  for (const id of refreshTimers) clearTimeout(id);
  refreshTimers = [];
  const delays = [0, 150, 350];
  for (const ms of delays) {
    refreshTimers.push(setTimeout(() => {
      syncViewportSize();
      layoutRefreshCallback();
    }, ms));
  }
}

function tryRequestFullscreenOnLandscapeReturn() {
  if (!document.documentElement.classList.contains('fs-requested')) return;
  if (isPortraitBlocked()) return;
  if (isFullscreenActive()) {
    tryOrientationLock();
    return;
  }
  if (gameContainerRef) requestGameFullscreen(gameContainerRef);
}

export function setupOrientationGate(overlayEl) {
  function refresh() {
    wasPortraitBlocked = portraitOverlayActive;
    portraitOverlayActive = isPortraitBlocked();
    if (overlayEl) overlayEl.classList.toggle('hidden', !portraitOverlayActive);
    scheduleLayoutRefresh();
    if (wasPortraitBlocked && !portraitOverlayActive) {
      tryRequestFullscreenOnLandscapeReturn();
    }
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
  if (on) {
    syncViewportSize();
    bindViewportSyncListener();
    if (isMobileDevice()) {
      requestAnimationFrame(() => {
        window.scrollTo(0, 1);
        requestAnimationFrame(() => {
          window.scrollTo(0, 0);
          syncViewportSize();
        });
      });
    }
  } else {
    unbindViewportSyncListener();
    document.documentElement.style.removeProperty('--app-vh');
    document.documentElement.style.removeProperty('--app-vw');
    syncViewportSize();
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

function onFullscreenDone() {
  tryOrientationLock();
  applyImmersiveMode(true);
  scheduleLayoutRefresh();
}

export function requestGameFullscreen(container) {
  gameContainerRef = container || gameContainerRef;
  applyImmersiveMode(true);
  document.documentElement.classList.add('fs-requested');

  if (isFullscreenActive()) {
    onFullscreenDone();
    return;
  }

  const mobile = isMobileDevice();
  const targets = mobile
    ? [document.documentElement, container, document.body]
    : [container, document.documentElement, document.body];
  const filtered = targets.filter(Boolean);

  for (const el of filtered) {
    const p = invokeRequestFullscreen(el);
    if (p == null) continue;
    if (typeof p.then === 'function') {
      p.then(onFullscreenDone).catch(() => scheduleLayoutRefresh());
    } else {
      onFullscreenDone();
    }
    return;
  }
}

export function bindFullscreenMaintenance(container) {
  gameContainerRef = container;
  const retry = () => {
    if (!document.documentElement.classList.contains('fs-requested')) return;
    if (isPortraitBlocked()) return;
    if (isFullscreenActive()) return;
    requestGameFullscreen(container);
  };
  document.addEventListener('fullscreenchange', () => {
    if (isFullscreenActive()) onFullscreenDone();
    else retry();
  });
  document.addEventListener('webkitfullscreenchange', retry);
}

export function exitGameFullscreen() {
  document.documentElement.classList.remove('fs-requested');
  applyImmersiveMode(false);
  const exit =
    document.exitFullscreen?.bind(document) ||
    document.webkitExitFullscreen?.bind(document) ||
    document.mozCancelFullScreen?.bind(document) ||
    document.msExitFullscreen?.bind(document);
  if (exit && isFullscreenActive()) {
    exit().then(() => syncViewportSize()).catch(() => syncViewportSize());
  } else {
    syncViewportSize();
  }
  screen.orientation?.unlock?.();
  scheduleLayoutRefresh();
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
  if (active) scheduleLayoutRefresh();
}