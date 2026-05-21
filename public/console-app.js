let __consoleAppPageKey = null;

function initConsoleApp(pageKey = window.location.pathname) {
  if (typeof window.createConsoleApp !== 'function') {
    throw new Error('console-core.js did not load before console-app.js');
  }

  const normalizedPageKey = String(pageKey || window.location.pathname || '/');
  if (window.consoleAppReady && __consoleAppPageKey === normalizedPageKey) {
    return window.consoleAppReady;
  }

  __consoleAppPageKey = normalizedPageKey;
  const app = window.createConsoleApp();
  window.consoleAppReady = Promise.resolve(app.init());
  return window.consoleAppReady;
}

window.initConsoleApp = initConsoleApp;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initConsoleApp, { once: true });
} else {
  initConsoleApp();
}
