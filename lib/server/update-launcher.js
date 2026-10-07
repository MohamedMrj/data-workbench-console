export function quoteCmdArg(value = '') {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function buildUpdaterLaunchCommand({
  powerShellPath,
  updaterPath,
  projectDir,
  port,
  oldPid
}) {
  return [
    'start',
    '""',
    '/min',
    quoteCmdArg(powerShellPath),
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-WindowStyle',
    'Hidden',
    '-File',
    quoteCmdArg(updaterPath),
    '-ProjectDir',
    quoteCmdArg(projectDir),
    '-Port',
    quoteCmdArg(port),
    '-OldPid',
    quoteCmdArg(oldPid)
  ].join(' ');
}

// windowsVerbatimArguments is what makes the launch work at all. Without it Node escapes the
// quotes inside the /c string as \" (the C runtime convention), which cmd.exe does not
// understand: `start` receives garbage, PowerShell never runs, cmd.exe hangs, and the update
// silently does nothing while the old server keeps answering. quoteCmdArg already quotes
// for cmd, so the string must reach it untouched.
export function buildUpdaterSpawnOptions(projectDir) {
  return {
    cwd: projectDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true
  };
}

export function waitForUpdaterStart(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let spawned = false;

    const cleanup = () => {
      clearTimeout(timer);
      child.off('spawn', onSpawn);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    const settle = (callback, value) => {
      cleanup();
      callback(value);
    };
    const onSpawn = () => {
      spawned = true;
      settle(resolve);
    };
    const onError = (error) => {
      settle(reject, error);
    };
    const onExit = (code, signal) => {
      if (!spawned) {
        settle(reject, new Error(`Updater exited before it could start work (${signal || `exit ${code}`}).`));
      }
    };
    const timer = setTimeout(() => {
      if (!spawned) {
        settle(reject, new Error('Timed out waiting for the updater process to launch.'));
        return;
      }
      settle(resolve);
    }, timeoutMs);

    child.once('spawn', onSpawn);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}
