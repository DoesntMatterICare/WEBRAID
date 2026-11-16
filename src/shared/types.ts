export type EnemyKind = 'tank' | 'brute' | 'swarmer' | 'turret' | 'toxic';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A pre-rendered picture of a page element (drawn at device-pixel resolution). */
export interface Sprite {
  canvas: HTMLCanvasElement;
  /** CSS-pixel size the sprite was captured at. */
  w: number;
  h: number;
  /** Visible text of the element, if any (tanks shoot it back at you). */
  text: string;
  /** Playing video whose frames keep streaming into `canvas` during the raid. */
  live?: HTMLVideoElement;
  /** object-fit used when redrawing a live frame. */
  fit?: string;
  /** Cross-origin pixels: drawable but unreadable (undefined = not probed yet). */
  tainted?: boolean;
  /** Scanline armor layer re-applied over every live video frame. */
  armor?: HTMLCanvasElement;
}

/** How the original element is hidden while its sprite fights. */
export type HideMode = 'visibility' | 'opacity';

export interface EnemySpec {
  kind: EnemyKind;
  rect: Rect;
  sprite: Sprite;
  /** Original element; null for synthetic filler enemies. */
  el: Element | null;
  /** Videos use opacity so the browser keeps decoding frames for us. */
  hide?: HideMode;
}
