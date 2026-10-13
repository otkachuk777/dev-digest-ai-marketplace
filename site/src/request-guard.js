// Monotonic token guard: only the most recently started async request may commit its result.
export function createGuard() {
  let latest = 0;
  return {
    next: () => ++latest,
    isCurrent: (token) => token === latest,
  };
}
