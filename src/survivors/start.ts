import Phaser from 'phaser';
import gameAtlasUrl from './assets/game-atlas.png?url';
import gameAtlas from './assets/game-atlas.json';
import officeAtlasUrl from './assets/office-atlas.png?url';
import officeAtlas from './assets/office-atlas.json';
import { FINAL_BOSS_KIND, RUN_SECONDS, STEP, CAMERA_WORLD_HEIGHT, enemies } from './config.ts';
import { Field } from './field.ts';
import { Run, type RunPhase } from './run.ts';
import { copy, type Locale } from './text.ts';
import { createGameGuide } from './guide';
import { createUpgradeCard } from './upgrade-card';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const result = document.createElement(tag);
  result.className = className;
  if (text) result.textContent = text;
  return result;
}

export function startGame(host: HTMLElement, locale: Locale, close: (projects?: boolean) => void,
  bossTest = false) {
  const t = copy[locale];
  let run = new Run(Math.random, bossTest);
  let accumulator = 0, hudClock = 0;
  let renderedPhase: RunPhase | undefined;
  let cancelConfirmation: (() => void) | undefined;
  let wakeGame = () => {};
  const guideArt: Record<string, string> = {};
  const abort = new AbortController();
  const listener = { signal: abort.signal };
  const keys = new Set<string>();
  const root = element('div', 'survivor-run');
  const surface = element('div', 'survivor-surface');
  const hud = element('div', 'survivor-hud');
  const xp = element('progress', 'survivor-xp');
  xp.setAttribute('aria-label', 'XP');
  const status = element('span', 'survivor-status');
  const score = element('span', 'survivor-score');
  const timer = element('span', 'survivor-time');
  timer.setAttribute('aria-label', locale === 'ru' ? 'Оставшееся время' : 'Time remaining');
  const runStats = element('div', 'survivor-run-stats');
  runStats.append(score, timer);
  let renderedScore = -1;
  let renderedSeconds = -1;
  const formatScore = (value: number) => value.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US');
  const pause = element('button', 'survivor-button survivor-button-game', t.pause);
  pause.type = 'button';
  hud.append(xp, status, pause);
  const bossHud = element('div', 'survivor-boss');
  const bossHealth = element('progress', 'survivor-boss-health');
  bossHealth.setAttribute('aria-label', t.boss);
  bossHealth.max = enemies[FINAL_BOSS_KIND].hp;
  bossHud.append(element('span', '', t.boss), bossHealth);
  bossHud.hidden = true;
  hud.append(bossHud);
  const controls = element('p', 'survivor-controls', t.controls);
  const overlay = element('div', 'survivor-overlay');
  const panel = element('div', 'survivor-panel');
  overlay.append(panel);
  const stick = element('div', 'survivor-stick');
  const knob = element('i', 'survivor-knob');
  stick.append(knob);
  stick.hidden = true;
  stick.setAttribute('aria-hidden', 'true');
  root.append(surface, hud, runStats, controls, stick, overlay);
  host.replaceChildren(root);
  const layoutWidth = 1500;
  host.style.position = 'relative';
  host.style.height = '100%';
  const fitGame = () => {
    const scale = Math.max(1, host.clientWidth) / layoutWidth;
    const layoutHeight = Math.max(1, host.clientHeight) / scale;
    root.style.width = layoutWidth + 'px';
    root.style.height = layoutHeight + 'px';
    root.style.position = 'absolute';
    root.style.left = '50%';
    root.style.top = '50%';
    root.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };
  const layoutResize = new ResizeObserver(fitGame);
  layoutResize.observe(host);
  fitGame();

  let pointer = -1, startX = 0, startY = 0, touchX = 0, touchY = 0;
  const clearInput = () => { keys.clear(); pointer = -1; touchX = touchY = 0; stick.hidden = true; };
  const pauseRun = () => { clearInput(); run.pause(); sync(); };
  const resumeRun = () => { clearInput(); run.start(); sync(); };

  function sync() {
    if (renderedScore !== run.score) {
      score.textContent = `${t.score}: ${formatScore(run.score)}`;
      renderedScore = run.score;
    }
    const seconds = Math.floor(run.time);
    const remaining = Math.max(0, RUN_SECONDS - seconds);
    if (renderedSeconds !== remaining) {
      timer.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
      renderedSeconds = remaining;
    }
    const xpRequired = run.xpRequired;
    if (xp.max !== xpRequired) xp.max = xpRequired;
    const visibleXp = Math.min(run.xp, xpRequired);
    if (xp.value !== visibleXp) xp.value = visibleXp;
    const currentBossHealth = run.bossHealth;
    const hideBoss = currentBossHealth <= 0;
    if (bossHud.hidden !== hideBoss) bossHud.hidden = hideBoss;
    if (!hideBoss && bossHealth.value !== currentBossHealth) bossHealth.value = currentBossHealth;
    let statusText = `${t.level} ${run.level}`;
    if (seconds >= RUN_SECONDS && !run.bossDefeated) statusText += ` · ${t.bossRemaining}`;
    if (status.textContent !== statusText) status.textContent = statusText;
    const disablePause = run.phase !== 'running';
    if (pause.disabled !== disablePause) pause.disabled = disablePause;
    if (renderedPhase === run.phase) return;
    renderedPhase = run.phase;
    renderOverlay();
    if (run.phase === 'running') wakeGame();
  }

  function restart() {
    const { viewWidth, viewHeight } = run;
    run = new Run(Math.random, bossTest);
    run.viewWidth = viewWidth;
    run.viewHeight = viewHeight;
    run.start();
    accumulator = 0;
    renderedPhase = undefined;
    sync();
  }

  function confirmAction(label: string, action: () => void, opener: HTMLButtonElement) {
    const confirmation = element('div', 'survivor-confirm');
    const box = element('div', 'survivor-panel survivor-confirm-panel');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', label);
    const buttons = element('div', 'survivor-end-actions');
    const ok = element('button', 'survivor-button survivor-button-game', 'OK');
    const cancel = element('button', 'survivor-button survivor-button-game survivor-button-exit',
      locale === 'ru' ? 'Отмена' : 'Cancel');
    ok.type = cancel.type = 'button';
    cancelConfirmation = () => {
      confirmation.remove();
      panel.inert = false;
      cancelConfirmation = undefined;
      opener.focus({ preventScroll: true });
    };
    cancel.addEventListener('click', () => cancelConfirmation?.());
    confirmation.addEventListener('click', event => {
      if (event.target === confirmation) cancelConfirmation?.();
    });
    ok.addEventListener('click', () => { cancelConfirmation?.(); action(); });
    buttons.append(ok, cancel);
    box.append(element('h3', '', label), buttons);
    confirmation.append(box);
    panel.inert = true;
    overlay.append(confirmation);
    cancel.focus({ preventScroll: true });
  }

  function fitGuide() {
    if (panel.classList.contains('survivor-panel-upgrade')) {
      panel.style.removeProperty('zoom');
      const scale = Math.min(1, Math.max(1, overlay.clientWidth - 16) / 1280,
        Math.max(1, overlay.clientHeight - 16) / Math.max(1, panel.scrollHeight));
      panel.style.setProperty('zoom', String(scale));
      return;
    }
    if (!panel.classList.contains('survivor-panel-guide')) {
      panel.style.removeProperty('zoom');
      return;
    }
    const scale = Math.min(1, Math.max(1, overlay.clientWidth - 16) / 1500,
      Math.max(1, overlay.clientHeight - 16) / 850);
    panel.style.setProperty('zoom', String(scale));
  }

  const guideResize = new ResizeObserver(fitGuide);
  guideResize.observe(overlay);

  function renderOverlay() {
    overlay.hidden = run.phase === 'running';
    if (overlay.hidden) return;
    clearInput();
    panel.replaceChildren();
    panel.classList.toggle('survivor-panel-guide', run.phase === 'intro' || run.phase === 'paused');
    panel.classList.toggle('survivor-panel-upgrade', run.phase === 'upgrade');
    panel.classList.toggle('survivor-panel-lost', run.phase === 'lost');
    panel.classList.toggle('survivor-panel-won', run.phase === 'won');
    fitGuide();
    const heading = element('h3', '', {
      intro: 'HR Survivors', paused: t.pause, upgrade: t.upgrade,
      won: t.won, lost: t.lost, running: '',
    }[run.phase]);
    if (run.phase === 'upgrade') panel.append(element('span', 'survivor-upgrade-eyebrow', locale === 'ru'
      ? '01 / КАДРОВЫЕ ДОКУМЕНТЫ' : '01 / PERSONNEL DOCUMENTS'));
    panel.append(heading);
    if (run.phase === 'upgrade') {
      heading.textContent = locale === 'ru' ? 'Вам согласовали новые полномочия' : 'Your new responsibilities are approved';
      panel.append(element('p', 'survivor-upgrade-caption', locale === 'ru'
        ? 'Выберите один приказ. Остальное согласуем потом.' : 'Choose one order. The rest can wait for approval.'));
    }
    let actions = panel;
    const addButton = (label: string, action: () => void) => {
      const button = element('button', 'survivor-button', label);
      button.type = 'button';
      button.addEventListener('click', action);
      actions.append(button);
      return button;
    };
    if (run.phase === 'upgrade') {
      const cards = element('div', 'survivor-cards');
      for (let i = 0; i < run.choiceCount; i++) {
        const id = run.choices[i];
        const card = createUpgradeCard(id, run.levels[id], i, locale, run.maxMood, () => {
          run.choose(i);
          renderedPhase = undefined;
          sync();
        }, guideArt);
        cards.append(card);
      }
      panel.append(cards);
    } else if (run.phase === 'intro' || run.phase === 'paused') {
      panel.append(createGameGuide(locale, guideArt));
      actions = element('div', 'survivor-guide-actions');
      panel.append(actions);
      addButton(t.toGame, resumeRun).classList.add('survivor-button-game');
      if (run.phase === 'paused') {
        const again = addButton(locale === 'ru' ? 'Заново' : 'Restart', () =>
          confirmAction(locale === 'ru' ? 'Начать заново?' : 'Restart the run?', restart, again));
        again.classList.add('survivor-button-game');
      }
      const exit = addButton(t.close, () => {
        if (run.phase === 'paused') {
          confirmAction(locale === 'ru' ? 'Выйти из игры?' : 'Exit the game?', () => close(), exit);
        } else close();
      });
      exit.classList.add('survivor-button-game', 'survivor-button-exit');
    } else {
      panel.append(element('p', '', run.phase === 'won' ? t.wonDetail : t.lostDetail));
      const total = element('div', 'survivor-end-score');
      total.append(element('span', '', t.totalScore), element('strong', '', formatScore(run.score)));
      panel.append(total);
      actions = element('div', 'survivor-end-actions');
      panel.append(actions);
      addButton(t.retry, restart).classList.add('survivor-button-game');
      if (run.phase === 'won') addButton(t.projects, () => close(true)).classList.add('survivor-button-game');
      addButton(t.close, () => close()).classList.add('survivor-button-game', 'survivor-button-exit');
    }
    fitGuide();
    if (run.phase === 'upgrade') {
      // Focus the panel, not the first choice: programmatic :focus-visible otherwise
      // pins its hover transform and outline while the mouse visits other cards.
      panel.tabIndex = -1;
      panel.focus({ preventScroll: true });
    } else {
      panel.removeAttribute('tabindex');
      (panel.querySelector<HTMLButtonElement>('.survivor-guide-actions button') ??
        panel.querySelector('button'))?.focus({ preventScroll: true });
    }
  }

  pause.addEventListener('click', pauseRun, listener);
  overlay.addEventListener('click', event => {
    if (event.target === overlay && run.phase === 'paused' && !cancelConfirmation) resumeRun();
  }, listener);
  window.addEventListener('blur', pauseRun, listener);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); }, listener);
  const directions = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && (run.phase === 'running' || run.phase === 'paused')) {
      event.preventDefault();
      if (!event.repeat) {
        if (cancelConfirmation) cancelConfirmation();
        else if (run.phase === 'paused') resumeRun();
        else pauseRun();
      }
    }
    if (run.phase === 'running' && directions.has(event.code)) {
      event.preventDefault(); keys.add(event.code);
    }
  }, listener);
  window.addEventListener('keyup', event => keys.delete(event.code), listener);
  surface.addEventListener('pointerdown', event => {
    if (run.phase !== 'running' || pointer !== -1 || event.button !== 0) return;
    pointer = event.pointerId;
    startX = event.clientX; startY = event.clientY;
    surface.setPointerCapture(pointer);
    const rect = root.getBoundingClientRect();
    const layoutScale = rect.width / layoutWidth;
    stick.style.left = `${(startX - rect.left) / layoutScale}px`;
    stick.style.top = `${(startY - rect.top) / layoutScale}px`;
    knob.style.transform = '';
    stick.hidden = false;
  }, listener);
  surface.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    const scale = Math.max(36, Math.hypot(dx, dy));
    touchX = dx / scale; touchY = dy / scale;
    knob.style.transform = `translate(${touchX * 23}px, ${touchY * 23}px)`;
  }, listener);
  const endPointer = (event: PointerEvent) => {
    if (event.pointerId === pointer) { pointer = -1; touchX = touchY = 0; stick.hidden = true; }
  };
  surface.addEventListener('pointerup', endPointer, listener);
  surface.addEventListener('pointercancel', endPointer, listener);
  surface.addEventListener('lostpointercapture', endPointer, listener);

  class OfficeScene extends Phaser.Scene {
    private field?: Field;
    constructor() { super('office'); }
    preload() {
      this.load.atlas('game-atlas', gameAtlasUrl, gameAtlas);
      this.load.atlas('office-atlas', officeAtlasUrl, officeAtlas);
    }
    create() {
      this.cameras.main.setOrigin(0, 0).setZoom(viewportZoom);
      this.field = new Field(this, locale);
      guideArt['boss-orb'] = this.textures.getBase64('boss-orb');
      guideArt['shot-0'] = this.textures.getBase64('shot-0');
      guideArt['drop-0'] = this.textures.getBase64('drop-0');
      renderedPhase = undefined;
      sync();
      this.draw();
    }
    draw() { this.field?.draw(run, accumulator / STEP); }
    update(time: number, delta: number) {
      if (run.phase === 'running') {
        accumulator += Math.min(delta / 1000, .1);
        const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) -
          Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchX;
        const y = Number(keys.has('KeyS') || keys.has('ArrowDown')) -
          Number(keys.has('KeyW') || keys.has('ArrowUp')) + touchY;
        while (accumulator >= STEP && run.phase === 'running') {
          run.step(x, y);
          accumulator -= STEP;
        }
        if (run.phase !== 'running') accumulator %= STEP;
        this.draw();
      }
      if (time >= hudClock || renderedPhase !== run.phase) {
        hudClock = time + 100;
        sync();
      }
      if (run.phase !== 'running') this.game.loop.sleep();
    }
  }

  const measureViewport = () => {
    const bounds = surface.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const density = Math.max(1, window.devicePixelRatio || 1);
    const renderHeight = Math.max(1, Math.round(height * density));
    // Keep the vertical world view constant across device pixel densities.
    return { width: Math.max(1, Math.round(width * density)),
      height: renderHeight, zoom: renderHeight / CAMERA_WORLD_HEIGHT };
  };
  const viewport = measureViewport();
  let viewportZoom = viewport.zoom;
  const updateCameraBounds = (width: number, height: number) => {
    run.viewWidth = Math.ceil(width / viewportZoom);
    run.viewHeight = Math.ceil(height / viewportZoom);
  };
  updateCameraBounds(viewport.width, viewport.height);
  if (bossTest) run.start();
  const scene = new OfficeScene();
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: surface, width: viewport.width, height: viewport.height,
    backgroundColor: '#282840', scene,
    fps: { target: 60, limit: 60, smoothStep: false },
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
    render: { antialias: false, pixelArt: true, roundPixels: true },
  });
  wakeGame = () => game.loop.wake();
  const resize = new ResizeObserver(() => {
    const { width, height, zoom } = measureViewport();
    if (width === game.scale.gameSize.width && height === game.scale.gameSize.height) {
      game.scale.refresh();
      return;
    }
    viewportZoom = zoom;
    if (scene.cameras?.main) scene.cameras.main.setZoom(viewportZoom);
    updateCameraBounds(width, height);
    game.scale.resize(width, height);
    scene.draw();
    game.loop.wake();
  });
  resize.observe(surface);
  resize.observe(host);
  sync();
  return () => {
    abort.abort();
    resize.disconnect();
    guideResize.disconnect();
    layoutResize.disconnect();
    game.destroy(true);
    // Destruction is processed on the next tick, including when paused.
    game.loop.wake();
    host.replaceChildren();
  };
}
