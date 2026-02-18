import { LightningElement, api } from 'lwc';
import { getAllTabInfo, closeTab, getFocusedTabInfo } from 'lightning/platformWorkspaceApi';

export default class QuoteNewWindowAction extends LightningElement {
    @api recordId;

    // This method is called by the Salesforce framework when the headless action is triggered
    @api async invoke() {
        console.log('--- New Quote Action: Opening in new tab and closing all Salesforce tabs ---');
        
        const origin = window.location.origin;
        const vfUrl = `${origin}/apex/GoogleQuoteAppVF?recordId=${this.recordId}`;

        // Strategy 1: window.open with explicit window features to force new window
        try {
            const windowFeatures = 'noopener,noreferrer,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes,width=1400,height=900';
            const newWindow = window.open(vfUrl, '_blank', windowFeatures);
            
            if (newWindow) {
                console.log('[Navigation] New browser tab opened successfully');
                newWindow.focus();
            } else {
                console.warn('[Navigation] window.open returned null (popup blocked?)');
            }
        } catch (e) {
            console.error('[Navigation] Strategy 1 failed:', e);
        }

        // Strategy 2: Create temporary anchor element and click it (fallback)
        try {
            const anchor = document.createElement('a');
            anchor.href = vfUrl;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            setTimeout(() => document.body.removeChild(anchor), 100);
            console.log('[Navigation] Anchor element click triggered');
        } catch (e) {
            console.error('[Navigation] Strategy 2 failed:', e);
        }

        // Strategy 3: AGGRESSIVE Console Tab Cleanup
        // Close both the app Console tab AND the Opportunity tab
        const closeAllTabs = async () => {
            try {
                const allTabs = await getAllTabInfo();
                console.log('[Cleanup] Checking tabs...', allTabs.length);
                
                // Find and close:
                // 1. Any tab with our app URL (the "Preparing..." tab)
                // 2. The Opportunity tab (contains the recordId)
                const tabsToClose = allTabs.filter(tab => {
                    const url = (tab.url || '').toLowerCase();
                    const title = (tab.title || '').toLowerCase();
                    const rid = (this.recordId || '').toLowerCase();
                    
                    // Very aggressive matching
                    return url.includes('googlequoteappvf') || 
                           title.includes('preparing') ||
                           title.includes('google') ||
                           title.includes('quote') ||
                           url.includes(rid) ||
                           title.includes('opportunity');
                });

                for (const tab of tabsToClose) {
                    console.log('[Cleanup] Closing tab:', tab.title, tab.tabId);
                    await closeTab(tab.tabId);
                }
                
                console.log(`[Cleanup] Closed ${tabsToClose.length} tab(s)`);
            } catch (err) {
                console.warn('[Cleanup] Tab cleanup failed:', err);
            }
        };

        // Run cleanup VERY frequently to ensure immediate closure
        closeAllTabs();                    // 0ms
        setTimeout(closeAllTabs, 50);      // 50ms
        setTimeout(closeAllTabs, 150);     // 150ms
        setTimeout(closeAllTabs, 250);     // 250ms
        setTimeout(closeAllTabs, 400);     // 400ms
        setTimeout(closeAllTabs, 600);     // 600ms
        setTimeout(closeAllTabs, 800);     // 800ms
    }
}
