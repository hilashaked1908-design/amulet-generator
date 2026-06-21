/** Yield to the browser so spinners/progress can paint during heavy CPU work. */
export async function yieldToMainThread(minDelayMs = 0) {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (minDelayMs > 0) await new Promise((r) => setTimeout(r, minDelayMs));
}

/** Call `fn` after a macrotask so button/spinner state updates first. */
export function deferToNextTask(fn) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      Promise.resolve(fn()).then(resolve, reject);
    }, 0);
  });
}
