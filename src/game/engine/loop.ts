/** Fixed-timestep game loop: deterministic updates, render once per frame. */
export class Loop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(
    private readonly step: number,
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    // Clamp so a background tab or a hitch never fast-forwards the game.
    const elapsed = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += elapsed;
    while (this.acc >= this.step && this.running) {
      this.update(this.step);
      this.acc -= this.step;
    }
    if (!this.running) return;
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };
}
