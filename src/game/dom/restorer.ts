import type { HideMode } from '@/shared/types';

/**
 * Records every visual change WEBRAID makes to the page and undoes them all on
 * exit, in reverse order. The page must look exactly as it did before the raid.
 */
interface SavedStyle {
  el: Element & ElementCSSInlineStyle;
  prop: HideMode;
  value: string;
  priority: string;
  /** Exact original `style` attribute text (null if absent). */
  originalAttr: string | null;
  /** The attribute text right after we hid it, to detect page-side edits. */
  ourAttr: string | null;
}

export class Restorer {
  private styles: SavedStyle[] = [];
  private nodes: Node[] = [];
  private cleanups: Array<() => void> = [];
  private restored = false;

  /**
   * Hide an element without affecting layout. `visibility` for most things;
   * `opacity` for videos, because Chrome stops decoding (and may pause)
   * visibility-hidden media, and we want their frames to keep streaming.
   */
  hide(el: Element, mode: HideMode = 'visibility'): void {
    const styled = el as Element & ElementCSSInlineStyle;
    if (!styled.style) return;
    const saved: SavedStyle = {
      el: styled,
      prop: mode,
      value: styled.style.getPropertyValue(mode),
      priority: styled.style.getPropertyPriority(mode),
      originalAttr: el.getAttribute('style'),
      ourAttr: null,
    };
    styled.style.setProperty(mode, mode === 'opacity' ? '0' : 'hidden', 'important');
    saved.ourAttr = el.getAttribute('style');
    this.styles.push(saved);
  }

  /** Mute a playing video for the raid; its own muted state comes back after. */
  mute(video: HTMLMediaElement): void {
    if (video.muted) return;
    video.muted = true;
    this.onRestore(() => {
      video.muted = false;
    });
  }

  /** A node we inserted; removed on restore. */
  addNode(node: Node): void {
    this.nodes.push(node);
  }

  /** Arbitrary undo step (event listeners, scroll guard, ...). */
  onRestore(fn: () => void): void {
    this.cleanups.push(fn);
  }

  get isRestored(): boolean {
    return this.restored;
  }

  restore(): void {
    if (this.restored) return;
    this.restored = true;

    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        this.cleanups[i]!();
      } catch (err) {
        console.warn('[WEBRAID] cleanup failed', err);
      }
    }
    for (const node of this.nodes) node.parentNode?.removeChild(node);

    for (let i = this.styles.length - 1; i >= 0; i--) {
      const { el, prop, value, priority, originalAttr, ourAttr } = this.styles[i]!;
      if (el.getAttribute('style') === ourAttr) {
        // Untouched since we hid it: put back the exact original text.
        if (originalAttr === null) el.removeAttribute('style');
        else el.setAttribute('style', originalAttr);
        continue;
      }
      // The page edited inline styles mid-raid (carousel, animation...): only undo our property.
      if (value) el.style.setProperty(prop, value, priority);
      else el.style.removeProperty(prop);
      if (originalAttr === null && el.getAttribute('style') === '') el.removeAttribute('style');
    }

    this.styles = [];
    this.nodes = [];
    this.cleanups = [];
  }
}
