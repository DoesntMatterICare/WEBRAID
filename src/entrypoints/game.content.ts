import { toggleRaid } from '@/game/game';
import { SAFE_ZONE_MESSAGE } from '@/shared/blocklist';
import { showSafeZoneToast } from '@/shared/safe-zone';

// Not in the manifest: the background injects this on toolbar click / Alt+R
// via scripting.executeScript, using only the activeTab grant.
export default defineContentScript({
  registration: 'runtime',
  main() {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement &&
      (active.type === 'password' || /cc-|card/i.test(active.autocomplete))
    ) {
      showSafeZoneToast(SAFE_ZONE_MESSAGE);
      return;
    }
    toggleRaid();
  },
});
