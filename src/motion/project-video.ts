/** Keep media observers and listeners under the portfolio's shared lifecycle. */
export function bindProjectVideos() {
  const abort = new AbortController();
  const { signal } = abort;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const disposers = Array.from(document.querySelectorAll<HTMLElement>('[data-project-video]'), root => {
    const video = root.querySelector('video')!;
    let visible = false;
    video.muted = true;
    const update = () => {
      if (!visible || document.hidden || reduced.matches || signal.aborted) {
        video.pause();
        return;
      }
      if (!video.getAttribute('src')) video.src = video.dataset.src!;
      void video.play().catch(() => root.classList.remove('is-loaded'));
    };
    video.addEventListener('playing', () => root.classList.add('is-loaded'), { signal });
    video.addEventListener('error', () => root.classList.remove('is-loaded'), { signal });
    video.addEventListener('contextmenu', event => event.preventDefault(), { signal });
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .15;
      update();
    }, { threshold: .15 });
    observer.observe(root.closest('.motion-project') ?? root);
    document.addEventListener('visibilitychange', update, { signal });
    reduced.addEventListener('change', update, { signal });
    return () => { observer.disconnect(); video.pause(); };
  });
  return () => { abort.abort(); disposers.forEach(dispose => dispose()); };
}
