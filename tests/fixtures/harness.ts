import { toggleRaid } from '@/game/game';

// Same entry point the extension uses; Alt+R or the floating button toggles a raid.
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.code === 'KeyR') {
    e.preventDefault();
    toggleRaid();
  }
});
document.getElementById('raid')?.addEventListener('click', () => toggleRaid());
(window as unknown as { webraid: () => void }).webraid = toggleRaid;
