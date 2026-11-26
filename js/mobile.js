let portraitOverlayActive = false;

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
  screen.orientation?.lock?.('landscape').catch(() => {});
}

function isFullscreenActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
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

export function requestGameFullscreen(container) {
  if (!isMobileDevice()) return;
  applyImmersiveMode(true);

  if (isFullscreenActive()) {
    tryOrientationLock();
    return;
  }

  const targets = [container, document.documentElement, document.body].filter(Boolean);
  for (const el of targets) {
    const req =
      el.requestFullscreen?.bind(el) ||
      el.webkitRequestFullscreen?.bind(el);
    if (!req) continue;
    try {
      const p = req();
      if (p && typeof p.then === 'function') {
        p.then(() => tryOrientationLock()).catch(() => {});
      } else {
        tryOrientationLock();
      }
      return;
    } catch {
      /* try next target */
    }
  }
}

export function exitGameFullscreen() {
  applyImmersiveMode(false);
  const exit = document.exitFullscreen?.bind(document) || document.webkitExitFullscreen?.bind(document);
  if (!exit) return;
  if (isFullscreenActive()) exit().catch(() => {});
  screen.orientation?.unlock?.();
}