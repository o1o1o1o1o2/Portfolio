/** Rotate visible project media without running timers for offscreen cards. */
export function bindProjectSlideshows() {
  const disposers = Array.from(document.querySelectorAll<HTMLElement>('[data-project-slideshow]')).map(root => {
    const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0;
    let visible = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      clearInterval(timer);
      timer = undefined;
      if (!visible || document.hidden || reduced.matches || images.length < 2) return;
      timer = setInterval(() => {
        const next = (index + 1) % images.length;
        if (!images[next].complete || !images[next].naturalWidth) return;
        images[index].classList.remove('is-active');
        images[next].classList.add('is-active');
        index = next;
      }, 3000);
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .15;
      update();
    }, {threshold: .15});
    observer.observe(root);
    document.addEventListener('visibilitychange', update);
    reduced.addEventListener('change', update);
    return () => {
      clearInterval(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      reduced.removeEventListener('change', update);
    };
  });
  return () => disposers.forEach(dispose => dispose());
}
