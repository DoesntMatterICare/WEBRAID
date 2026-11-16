/**
 * Shows a small toast on the page. Must stay fully self-contained: the
 * background passes it to scripting.executeScript({ func }), which serializes it.
 */
export function showSafeZoneToast(message: string): void {
  const id = '__webraid_safe_zone__';
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.id = id;
  el.textContent = '🛡 ' + message;
  el.setAttribute(
    'style',
    [
      'all:initial',
      'position:fixed',
      'top:20px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'background:#0d0221',
      'color:#2de2e6',
      'border:2px solid #ff2bd6',
      'border-radius:10px',
      'padding:12px 20px',
      'font:600 15px/1.3 ui-monospace,Consolas,monospace',
      'box-shadow:0 0 24px rgba(255,43,214,.6)',
      'pointer-events:none',
    ].join(';'),
  );
  document.documentElement.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
