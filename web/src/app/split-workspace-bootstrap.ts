export function applyInitialSplitWorkspacePreferences() {
  const storagePrefix = 'kitsune.split-workspace.v1.';
  const propertyPrefix = '--split-workspace-preference-';
  const preferenceKeyPattern = /^[a-z0-9-]+$/;
  const root = document.documentElement;

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);

      if (!storageKey?.startsWith(storagePrefix)) {
        continue;
      }

      const preferenceKey = storageKey.slice(storagePrefix.length);

      if (!preferenceKeyPattern.test(preferenceKey)) {
        continue;
      }

      const value = Number(window.localStorage.getItem(storageKey));

      if (!Number.isFinite(value) || value <= 0 || value >= 100) {
        continue;
      }

      root.style.setProperty(`${propertyPrefix}${preferenceKey}`, `${value}%`);
    }
  } catch {
    // Server defaults remain usable when storage is unavailable.
  }
}

export const splitWorkspaceBootstrapScript = `(${applyInitialSplitWorkspacePreferences.toString()})();`;
