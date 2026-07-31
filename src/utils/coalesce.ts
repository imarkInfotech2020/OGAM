/**
 * Run at most once per window, and always run last.
 *
 * A transfer reports every 64 KB, so a 4 GB file produces about sixty thousand notifications. Fanning
 * each one out to the screens repaints them thousands of times for a progress bar that a person reads
 * a few times a second - and it starves the JavaScript thread that the transfer itself is running on,
 * which makes the transfer slower as well as the app sluggish.
 *
 * The trailing call is guaranteed, so the final state is never the one that got dropped.
 */
export function coalesced(run: () => void, windowMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  return () => {
    if (timer) {
      pending = true;
      return;
    }
    run();
    timer = setTimeout(() => {
      timer = null;
      if (!pending) return;
      pending = false;
      run();
    }, windowMs);
  };
}
