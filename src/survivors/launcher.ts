import { copy, type Locale } from './text';

/** Own the lifetime of each game, including an import still in flight. */
export function bindGameLaunchers() {
  const abort = new AbortController();
  const { signal } = abort;
  const disposers = Array.from(document.querySelectorAll<HTMLElement>('[data-survivor-launcher]'), root => {
    const locale = root.dataset.lang as Locale;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-play]'));
    const dialog = root.querySelector('dialog')!;
    const host = root.querySelector<HTMLElement>('[data-host]')!;
    const status = root.querySelector<HTMLElement>('.survivor-load')!;
    let dispose: (() => void) | undefined;
    let opener: HTMLButtonElement | undefined;
    let loading = false;
    let ownsFullscreen = false;
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'landscape') => Promise<void>;
    };
    const stop = () => {
      dispose?.(); dispose = undefined;
      if (ownsFullscreen) {
        orientation?.unlock?.();
        if (document.fullscreenElement === document.documentElement) {
          void document.exitFullscreen().catch(() => {});
        }
        ownsFullscreen = false;
      }
    };
    const unlockScroll = () => {
      document.body.classList.toggle('dialog-open', !!document.querySelector('dialog[open]'));
    };
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      stop();
      unlockScroll();
      opener?.focus({ preventScroll: true });
    }, { signal });
    const launch = async (button: HTMLButtonElement) => {
      if (loading || dialog.open) return;
      loading = true;
      opener = button;
      buttons.forEach(control => { control.disabled = true; });
      status.textContent = '';
      try {
        if (matchMedia('(pointer: coarse)').matches && !document.fullscreenElement &&
            document.documentElement.requestFullscreen) {
          try {
            await document.documentElement.requestFullscreen();
            ownsFullscreen = true;
            if (signal.aborted || !root.isConnected) { stop(); return; }
            await orientation?.lock?.('landscape').catch(() => {});
          } catch {}
        }
        const { startGame } = await import('./start');
        if (signal.aborted || !root.isConnected) return;
        dialog.showModal();
        document.body.classList.add('dialog-open');
        dispose = startGame(host, locale, projects => {
          dialog.close();
          if (projects) location.assign(root.dataset.projects!);
        }, new URLSearchParams(location.search).get('bossTest') === '1');
      } catch (error) {
        console.error(error);
        stop();
        if (dialog.open) dialog.close();
        unlockScroll();
        status.textContent = copy[locale].error;
      } finally {
        loading = false;
        buttons.forEach(control => { control.disabled = false; });
      }
    };
    buttons.forEach(button => button.addEventListener('click', () => void launch(button), { signal }));
    return () => { stop(); dialog.close(); unlockScroll(); };
  });
  return () => { abort.abort(); disposers.forEach(dispose => dispose()); };
}
