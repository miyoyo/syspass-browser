'use strict';

const contextMenuItems = [
    { title: tr('contextMenuFillUsernameAndPassword'), action: 'fill_username_password' },
    { title: tr('contextMenuFillPassword'), action: 'fill_password' },
    { title: tr('contextMenuShowPasswordGenerator'), action: 'show_password_generator' },
    { title: tr('contextMenuSaveCredentials'), action: 'save_credentials' },
];

const initListeners = async function() {
    browser.tabs.onCreated.addListener((tab) => {
        if (tab?.id > 0 && tab?.selected) {
            page.currentTabId = tab.id;

            if (!page.tabs[tab.id]) {
                page.createTabEntry(tab.id);
            }

            page.switchTab(tab);
        }
    });

    browser.tabs.onRemoved.addListener(async function(tabId, removeInfo) {
        if (page.currentTabId === tabId) {
            const currentTab = await getCurrentTab();
            page.currentTabId = currentTab ? currentTab.id : -1;
        }
        delete page.tabs[tabId];
    });

    browser.tabs.onActivated.addListener(async function(activeInfo) {
        try {
            const info = await browser.tabs.get(activeInfo.tabId);
            if (info && info.id) {
                page.currentTabId = info.id;
                if (info.status === 'complete') {
                    if (!page.tabs[info.id]) {
                        page.createTabEntry(info.id);
                    }
                    page.switchTab(info);
                }
            }
        } catch (err) {
            logError(err.message);
        }
    });

    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.url) {
            page.clearLogins(tabId);
        }

        if (changeInfo.status === 'complete' && tab?.id) {
            browserAction.showDefault(tab);
            if (!page.tabs[tab.id]) {
                page.createTabEntry(tab.id);
            }
        }
    });

    browser.webNavigation.onCommitted.addListener((details) => {
        if (details.transitionQualifiers?.[0] === 'client_redirect' || details.transitionType === 'form_submit') {
            page.redirectCount += 1;
            return;
        }

        if (details.transitionType === 'reload') {
            page.clearLogins(details.tabId);
        }

        page.redirectCount = 0;
    });

    browser.runtime.onMessage.addListener(kpxcEvent.onMessage);

    browser.commands.onCommand.addListener(async (command) => {
        if (contextMenuItems.some(e => e.action === command)
            || command === 'redetect_fields'
            || command === 'choose_credential_fields'
            || command === 'retrieve_credentials_forced'
            || command === 'reload_extension') {
            const tab = await getCurrentTab();
            if (tab?.id) {
                browser.tabs.sendMessage(tab.id, { action: command });
            }
        }
    });

    browser.contextMenus.onClicked.addListener(async (item, tab) => {
        if (!tab?.id) {
            return;
        }

        if (item?.menuItemId?.startsWith('fill_attribute')) {
            const menuItem = page.attributeMenuItems.find(i => i?.action === item?.menuItemId);
            if (menuItem) {
                browser.tabs.sendMessage(tab.id, {
                    action: 'fill_attribute',
                    args: menuItem?.args
                }).catch((err) => {
                    logError(err);
                });
            }

            return;
        }

        browser.tabs.sendMessage(tab.id, {
            action: item.menuItemId
        }).catch((err) => {
            logError(err);
        });
    });

    browser.runtime.onInstalled.addListener((details) => {
        if (details?.reason === 'install') {
            browser.tabs.create({
                url: 'options/options.html#connected-databases',
            });
        }
    });
};

const initContextMenuItems = async function() {
    page.menuContexts = [ 'editable' ];
    if (page.isFirefox) {
        page.menuContexts.push('password');
    }

    await browser.contextMenus.removeAll();
    for (const item of contextMenuItems) {
        try {
            await browser.contextMenus.create({
                title: item.title,
                contexts: page.menuContexts,
                visible: item.visible,
                id: item.id || item.action
            });
        } catch (e) {
            logError(e);
        }
    }
};

(async () => {
    try {
        await keepass.migrateKeyRing();
        await syspassCrypto.initialize();
        await page.initBrowser();
        await page.initSettings();
        await page.initSitePreferences();
        await page.initOpenedTabs();
        await initListeners();
        await initContextMenuItems();
        await httpAuth.init();

        // Only attempt reconnect if not locked by passkey encryption
        if (syspassCrypto.state !== 'locked') {
            await keepass.reconnect(null, 5000);
        }

        await keepass.enableAutomaticReconnect();
    } catch (_e) {
        logError('init.js failed');
    }
})();
