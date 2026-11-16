import { SAFE_ZONE_MESSAGE, safeZoneReason } from '@/shared/blocklist';
import { showSafeZoneToast } from '@/shared/safe-zone';

interface TabLike {
  id?: number;
  url?: string;
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => void launch(tab));
  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'start-raid' && tab) void launch(tab);
  });
});

async function launch(tab: TabLike): Promise<void> {
  const tabId = tab.id;
  if (tabId === undefined) return;

  const reason = safeZoneReason(tab.url);
  if (reason === 'unsupported') {
    await flashBadge(tabId);
    return;
  }
  try {
    if (reason === 'safe-zone') {
      await browser.scripting.executeScript({
        target: { tabId },
        func: showSafeZoneToast,
        args: [SAFE_ZONE_MESSAGE],
      });
      return;
    }
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/game.js'],
    });
  } catch (err) {
    // Browser-internal pages, the web store, PDFs, etc. refuse injection.
    console.warn('[WEBRAID] cannot raid this tab', err);
    await flashBadge(tabId);
  }
}

async function flashBadge(tabId: number): Promise<void> {
  await browser.action.setBadgeBackgroundColor({ tabId, color: '#ff2bd6' });
  await browser.action.setBadgeText({ tabId, text: 'NO' });
  setTimeout(() => void browser.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 2000);
}
