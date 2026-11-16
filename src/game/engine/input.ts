const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyE', 'KeyR', 'KeyM', 'Escape', 'Enter', 'PageUp', 'PageDown', 'Home', 'End',
]);

/**
 * Keyboard + mouse state. Listens in the capture phase so the host page's own
 * shortcuts (e.g. "k" to pause a video, "/" to search) never fire during a raid.
 */
export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  mouseX = window.innerWidth / 2;
  mouseY = window.innerHeight / 2;
  mouseDown = false;

  constructor(private readonly surface: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('keypress', this.swallowKey, true);
    window.addEventListener('blur', this.onBlur);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('contextmenu', this.prevent);
    surface.addEventListener('wheel', this.prevent, { passive: false });
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('keypress', this.swallowKey, true);
    window.removeEventListener('blur', this.onBlur);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('pointerup', this.onPointerUp);
    this.surface.removeEventListener('pointercancel', this.onPointerUp);
    this.surface.removeEventListener('contextmenu', this.prevent);
    this.surface.removeEventListener('wheel', this.prevent);
    this.keys.clear();
    this.pressed.clear();
  }

  down(...codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** True once per physical key press. */
  consume(code: string): boolean {
    return this.pressed.delete(code);
  }

  endFrame(): void {
    this.pressed.clear();
  }

  private swallowKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    e.stopImmediatePropagation();
    if (GAME_KEYS.has(e.code)) e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.swallowKey(e);
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!e.repeat) this.pressed.add(e.code);
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.swallowKey(e);
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.mouseDown = false;
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };

  private onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.onPointerMove(e);
    if (e.button === 0) {
      this.mouseDown = true;
      this.pressed.add('Mouse0');
      try {
        this.surface.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0 || e.type === 'pointercancel') this.mouseDown = false;
  };

  private prevent = (e: Event): void => {
    e.preventDefault();
  };
}
