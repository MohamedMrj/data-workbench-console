let __consoleAppPageKey = null;
let __consoleAppCoreReady = null;

function waitForConsoleCore() {
  if (typeof window.createConsoleApp === 'function') {
    return Promise.resolve();
  }

  if (__consoleAppCoreReady) {
    return __consoleAppCoreReady;
  }

  const startedAt = Date.now();
  __consoleAppCoreReady = new Promise((resolve, reject) => {
    const poll = () => {
      if (typeof window.createConsoleApp === 'function') {
        resolve();
        return;
      }

      if (Date.now() - startedAt > 10000) {
        reject(new Error('console-core.js did not load before console-app.js'));
        return;
      }

      window.setTimeout(poll, 25);
    };

    poll();
  });

  return __consoleAppCoreReady;
}

function initConsoleApp(pageKey = window.location.pathname) {
  const normalizedPageKey = String(pageKey || window.location.pathname || '/');
  if (window.consoleAppReady && __consoleAppPageKey === normalizedPageKey) {
    return window.consoleAppReady;
  }

  __consoleAppPageKey = normalizedPageKey;
  window.consoleAppReady = waitForConsoleCore().then(() => {
    const app = window.createConsoleApp();
    return app.init();
  });
  return window.consoleAppReady;
}

window.initConsoleApp = initConsoleApp;

function startConsoleApp() {
  initConsoleApp().catch((error) => {
    console.error('Failed to initialize console app.', error);
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startConsoleApp, { once: true });
} else {
  startConsoleApp();
}
