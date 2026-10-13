// A channel click is a no-op only when it targets what is already pending (or committed, if nothing is pending).
export const shouldIgnoreChannelClick = (target, pending, committed) => target === (pending ?? committed);

// Monotonic token guard: only the most recently started async request may commit its result.
export function createGuard() {
  let latest = 0;
  return {
    next: () => ++latest,
    isCurrent: (token) => token === latest,
  };
}
