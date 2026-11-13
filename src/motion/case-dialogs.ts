import { clamp } from './math';
import { splitTitle } from './title-glyphs';

const CASE_REEL_DURATION = .42;

export function bindCaseDialogs(root: ParentNode = document) {
  const controller = new AbortController();
  const { signal } = controller;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const openCases = new Map<string, (button: HTMLButtonElement) => void>();

  root.querySelectorAll<HTMLDialogElement>('.case-dialog').forEach(dialog => {
    const piece = dialog.querySelector<HTMLElement>('.case-panel > i')!;
    const content = dialog.querySelector<HTMLElement>('.case-inner')!;
    const updateScrollIndicator = () => {
      const { clientHeight, scrollHeight, scrollTop } = content;
      const overflow = scrollHeight - clientHeight;
      dialog.toggleAttribute('data-case-scrollable', clientHeight > 0 && overflow > 1);
      if (clientHeight === 0 || overflow <= 1) return;
      const thumb = Math.max(.08, clientHeight / scrollHeight);
      dialog.style.setProperty('--case-scroll-size', String(thumb));
      dialog.style.setProperty('--case-scroll-offset', String(clamp(scrollTop / overflow) * (1 - thumb)));
    };
    const contentResize = new ResizeObserver(updateScrollIndicator);
    contentResize.observe(content);
    content.addEventListener('scroll', updateScrollIndicator, { passive: true, signal });
    const text = Array.from(dialog.querySelectorAll<HTMLElement>(
      '.case-inner :is(.m-eyebrow, h2, p, li, .case-links a)',
    ), element => {
      const original = Array.from(element.childNodes);
      const readable = document.createElement('span');
      readable.className = 'case-readable';
      readable.textContent = element.textContent;
      const glyphs = splitTitle(element, 'slot');
      element.prepend(readable);
      return { element, original, glyphs };
    });
    let opener: HTMLButtonElement | undefined;
    let frame = 0;
    let opening = 0;
    const paintText = (elapsed: number) => {
      const remaining = 1 - clamp(elapsed / CASE_REEL_DURATION);
      for (const { glyphs } of text) {
        glyphs.forEach((glyph, index) => {
          const phase = Math.sin(Math.PI * index / Math.max(1, glyphs.length - 1));
          // Four stacked copies: 75% puts the last copy directly in the mask.
          glyph.style.transform = `translate3d(0,${-75 * remaining ** (2.4 + phase)}%,0)`;
        });
      }
    };

    openCases.set(dialog.id, async button => {
      if (dialog.open) return;
      cancelAnimationFrame(frame);
      const currentOpening = ++opening;
      opener = button;
      delete dialog.dataset.caseReady;
      paintText(reduced.matches ? CASE_REEL_DURATION : 0);
      dialog.showModal();
      document.body.classList.add('dialog-open');
      updateScrollIndicator();
      const assembly = piece.getAnimations().find(animation =>
        'transitionProperty' in animation && animation.transitionProperty === 'transform');
      if (assembly) await assembly.finished.catch(() => {});
      if (!dialog.open || currentOpening !== opening || signal.aborted) return;
      dialog.dataset.caseReady = '';
      if (reduced.matches) {
        paintText(CASE_REEL_DURATION);
        return;
      }
      const startsAt = performance.now();
      const animate = (time: number) => {
        if (!dialog.open) return;
        const elapsed = Math.max(0, (time - startsAt) / 1000);
        paintText(reduced.matches ? CASE_REEL_DURATION : elapsed);
        if (!reduced.matches && elapsed < CASE_REEL_DURATION) frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    });

    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      cancelAnimationFrame(frame);
      document.body.classList.remove('dialog-open');
      opener?.focus({ preventScroll: true });
    }, { signal });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }, { signal });
    signal.addEventListener('abort', () => {
      cancelAnimationFrame(frame);
      contentResize.disconnect();
      for (const { element, original } of text) element.replaceChildren(...original);
      if (dialog.open) {
        dialog.close();
        document.body.classList.remove('dialog-open');
      }
    }, { once: true });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-case]').forEach(button => {
    button.addEventListener('click', () => openCases.get(`case-${button.dataset.case}`)?.(button), { signal });
  });
  return () => controller.abort();
}
