export function isMobileDevice() {
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isPortrait() {
  const type = screen.orientation?.type;
  if (type) return type.startsWith('portrait');
  return window.innerHeight >= window.innerWidth;
}

export function isPortraitBlocked() {
  return isMobileDevice() && isPortrait();
}

export function setupOrientationGate(overlayEl) {
  function refresh() {
    if (!overlayEl) return;
    overlayEl.classList.toggle('hidden', !isPortraitBlocked());
  }
  refresh();
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  screen.orientation?.addEventListener?.('change', refresh);
  return refresh;
}

export async function requestGameFullscreen(container) {
  if (!isMobileDevice()) return;
  const el = container || document.documentElement;
  const req =
    el.requestFullscreen?.bind(el) ||
    el.webkitRequestFullscreen?.bind(el) ||
    document.documentElement.webkitRequestFullscreen?.bind(document.documentElement);
  if (!req) return;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      await req();
    }
  } catch {
    /* user denied or unsupported */
  }
  try {
    await screen.orientation?.lock?.('landscape');
  } catch {
    /* optional */
  }
}

export function exitGameFullscreen() {
  const exit = document.exitFullscreen?.bind(document) || document.webkitExitFullscreen?.bind(document);
  if (!exit) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    exit().catch(() => {});
  }
  screen.orientation?.unlock?.();
}