'use strict';

// sysPass adapter for keepassxc-browser
// Replaces KeePassXC native messaging protocol with sysPass JSON-RPC 2.0 API

const keepass = {};
keepass.associated = { 'value': false, 'hash': null };
keepass.cacheTimeout = 30 * 1000;
keepass.currentKeePassXC = 'sysPass';
keepass.databaseHash = '';
keepass.isConnected = false;
keepass.isDatabaseClosed = false;
keepass.isEncryptionKeyUnrecognized = false;
keepass.isKeePassXCAvailable = false;
keepass.latestKeePassXC = { 'version': 'N/A', 'lastChecked': null };
keepass.previousDatabaseHash = '';
keepass.reconnectLoop = null;
keepass.requiredKeePassXC = '0.0.0';

// Feature flags: sysPass supports credentials and local password generation only
keepass.featuresList = {
    downloadFaviconAfterSave: false,
    newTotp: false,
    passwordGenerator: true,
    passkeys: false,
    passkeysDefaultGroup: false,
    requiredKeePassXCVersionFound: true,
};

browser.storage.local.get({ 'latestKeePassXC': { 'version': 'N/A', 'lastChecked': null }, 'keyRing': {} }).then((item) => {
    keepass.latestKeePassXC = item.latestKeePassXC;
    keepass.keyRing = item.keyRing;
});

//--------------------------------------------------------------------------
// KeyRing accessors for sysPass credentials
//--------------------------------------------------------------------------

// Returns the first keyRing entry (sysPass uses a single connection)
keepass.getActiveKey = function() {
    const keys = Object.keys(keepass.keyRing);
    if (keys.length === 0) {
        return null;
    }
    return keepass.keyRing[keys[0]];
};

Object.defineProperty(keepass, 'address', {
    get() {
        return keepass.getActiveKey()?.id || '';
    }
});

Object.defineProperty(keepass, 'apiKey', {
    get() {
        return keepass.getActiveKey()?.hash || '';
    }
});

Object.defineProperty(keepass, 'apiPass', {
    get() {
        return keepass.getActiveKey()?.key || '';
    }
});

//--------------------------------------------------------------------------
// Commands
//--------------------------------------------------------------------------

keepass.addCredentials = async function(tab, args = []) {
    const [ username, password, url ] = args;
    return keepass.updateCredentials(tab, [ null, username, password, url ]);
};

keepass.updateCredentials = async function(tab, args = []) {
    try {
        const [ entryId, username, password, url ] = args;
        const taResponse = await keepass.testAssociation(tab);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return 'error';
        }

        if (entryId) {
            // Update existing account
            await syspassClient.editAccount(
                keepass.address, keepass.apiKey, keepass.apiPass,
                entryId,
                { login: username, password: password, url: url }
            );
            return 'updated';
        } else {
            // Create new account
            await syspassClient.createAccount(
                keepass.address, keepass.apiKey, keepass.apiPass,
                { login: username, password: password, url: url, name: url }
            );
            return 'created';
        }
    } catch (err) {
        logError(`updateCredentials failed: ${err}`);
        return 'error';
    }
};

keepass.retrieveCredentials = async function(tab, args = []) {
    try {
        const [ url, submiturl, triggerUnlock = false, httpAuth = false ] = args;
        const taResponse = await keepass.testAssociation(tab, [ false, triggerUnlock ]);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        keepass.clearErrorMessage(tab);

        if (!keepass.isKeePassXCAvailable) {
            return [];
        }

        const target = new URL(url);
        const accounts = await syspassClient.searchAccounts(
            keepass.address, keepass.apiKey, target.hostname
        );

        if (!accounts || accounts.length === 0) {
            browserAction.showDefault(tab);
            logDebug(`No entries found for url ${url}`);
            return [];
        }

        // Fetch passwords for all matching accounts in parallel
        const entries = await Promise.all(
            accounts.map(async (account) => {
                try {
                    const password = await syspassClient.viewPassword(
                        keepass.address, keepass.apiKey, keepass.apiPass, account.id
                    );

                    return {
                        login: account.login,
                        name: account.name,
                        password: password,
                        uuid: String(account.id),
                        group: account.categoryName || '',
                        stringFields: []
                    };
                } catch (err) {
                    logError(`Failed to fetch password for account ${account.id}: ${err}`);
                    return null;
                }
            })
        );

        const validEntries = removeDuplicateEntries(entries.filter(e => e !== null));
        keepass.updateLastUsed(keepass.databaseHash);

        if (validEntries.length === 0) {
            browserAction.showDefault(tab);
        }

        logDebug(`Found ${validEntries.length} entries for url ${url}`);
        return validEntries;
    } catch (err) {
        logError(`retrieveCredentials failed: ${err}`);
        return [];
    }
};

keepass.generatePassword = async function(tab) {
    // Local password generation since sysPass does not provide an API for this
    const length = 32;
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$&*=?_-@#%';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);

    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset[array[i] % charset.length];
    }

    return [ {
        password: password,
        login: 0,
        entropy: 0
    } ];
};

keepass.associate = async function(tab) {
    // For sysPass, association is handled via the options page (URL + API key + password).
    // This function is called from the popup Connect button, which should open the options page.
    if (keepass.isAssociated()) {
        return AssociatedAction.ASSOCIATED;
    }

    // If already configured, test the association
    if (Object.keys(keepass.keyRing).length > 0) {
        const result = await keepass.testAssociation(tab);
        if (result) {
            return AssociatedAction.ASSOCIATED;
        }
    }

    return AssociatedAction.NOT_ASSOCIATED;
};

keepass.testAssociation = async function(tab, args = []) {
    keepass.clearErrorMessage(tab);

    try {
        if (Object.keys(keepass.keyRing).length === 0) {
            keepass.isKeePassXCAvailable = false;
            keepass.isConnected = false;
            if (tab && page.tabs[tab.id]) {
                keepass.handleError(tab, kpErrors.NO_SAVED_DATABASES_FOUND);
            }
            return false;
        }

        // Set databaseHash to the API key hash for compatibility
        keepass.databaseHash = keepass.apiKey;

        await syspassClient.testConnection(keepass.address, keepass.apiKey, keepass.apiPass);

        keepass.isKeePassXCAvailable = true;
        keepass.isConnected = true;
        keepass.isDatabaseClosed = false;
        keepass.isEncryptionKeyUnrecognized = false;
        keepass.associated.value = true;
        keepass.associated.hash = keepass.databaseHash;

        return true;
    } catch (err) {
        keepass.isKeePassXCAvailable = false;
        keepass.isConnected = false;

        if (tab && page.tabs[tab.id]) {
            page.tabs[tab.id].errorMessage =
                'Unable to contact sysPass, check configuration (Settings > Connected Databases).'
                + (typeof err === 'string' ? ' ' + err : '');
        }

        logError(`testAssociation failed: ${err}`);
        return false;
    }
};

keepass.getDatabaseHash = async function(tab, args = []) {
    // For sysPass, the "database hash" is the API key
    if (Object.keys(keepass.keyRing).length === 0) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return '';
    }

    keepass.databaseHash = keepass.apiKey;
    return keepass.databaseHash;
};

// Stubs for KeePassXC-specific functions not applicable to sysPass
keepass.changePublicKeys = async function() {
    return true;
};

keepass.lockDatabase = async function(tab) {
    // Lock triggers the passkey re-auth flow
    keepass.isDatabaseClosed = true;
    keepass.associated.value = false;
    keepass.associated.hash = null;

    if (syspassCrypto && typeof syspassCrypto.lock === 'function') {
        syspassCrypto.lock();
    }

    keepass.updateDatabase();
    keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
    return true;
};

keepass.getDatabaseGroups = async function() {
    return [];
};

keepass.createNewGroup = async function() {
    return [];
};

keepass.getTotp = async function(tab, args = []) {
    return args[1]; // Return oldTotp
};

keepass.requestAutotype = async function() {
    return false;
};

keepass.passkeysRegister = async function() {
    return [];
};

keepass.passkeysGet = async function() {
    return [];
};

//--------------------------------------------------------------------------
// Keyring
//--------------------------------------------------------------------------

keepass.migrateKeyRing = function() {
    return new Promise((resolve) => {
        browser.storage.local.get('keyRing').then((item) => {
            const keyring = item.keyRing;
            if (keyring) {
                let num = 0;
                for (const keyHash in keyring) {
                    const key = keyring[keyHash];
                    [ 'created', 'lastUsed' ].forEach((fld) => {
                        const v = key[fld];
                        if (v instanceof Date && v.valueOf() >= 0) {
                            key[fld] = v.valueOf();
                            num++;
                        } else if (typeof v !== 'number') {
                            key[fld] = Date.now().valueOf();
                            num++;
                        }
                    });
                }
                if (num > 0) {
                    browser.storage.local.set({ keyRing: keyring });
                }
            }
            resolve();
        });
    });
};

keepass.saveKey = function(hash, id, key) {
    if (!Object.hasOwn(keepass.keyRing, hash)) {
        keepass.keyRing[hash] = {
            id: id,
            key: key,
            hash: hash,
            created: new Date().valueOf(),
            lastUsed: new Date().valueOf()
        };
    } else {
        keepass.keyRing[hash].id = id;
        keepass.keyRing[hash].key = key;
        keepass.keyRing[hash].hash = hash;
        keepass.keyRing[hash].lastUsed = new Date().valueOf();
    }

    browser.storage.local.set({ 'keyRing': keepass.keyRing });
};

keepass.updateLastUsed = function(hash) {
    if (Object.hasOwn(keepass.keyRing, hash)) {
        keepass.keyRing[hash].lastUsed = new Date().valueOf();
        browser.storage.local.set({ 'keyRing': keepass.keyRing });
    }
};

keepass.updateDatabaseHash = function(oldHash, newHash) {
    if (!oldHash || !newHash || oldHash === newHash) {
        return;
    }

    if ((oldHash in keepass.keyRing)) {
        keepass.keyRing[newHash] = keepass.keyRing[oldHash];
        keepass.keyRing[newHash].hash = newHash;
        delete keepass.keyRing[oldHash];
        browser.storage.local.set({ 'keyRing': keepass.keyRing });
    }
};

keepass.deleteKey = function(hash) {
    delete keepass.keyRing[hash];
    browser.storage.local.set({ 'keyRing': keepass.keyRing });
};

keepass.getCryptoKey = function() {
    const activeKey = keepass.getActiveKey();
    if (!activeKey) {
        return [ null, null ];
    }
    return [ activeKey.id, activeKey.key ];
};

keepass.setCryptoKey = function(id, key) {
    keepass.saveKey(keepass.databaseHash, id, key);
};

keepass.getCryptoKeys = function() {
    const keys = [];
    for (const keyHash in keepass.keyRing) {
        keys.push({
            id: keepass.keyRing[keyHash].id,
            key: keepass.keyRing[keyHash].key
        });
    }
    return keys;
};

//--------------------------------------------------------------------------
// Connection
//--------------------------------------------------------------------------

keepass.enableAutomaticReconnect = async function() {
    if (!page.settings.autoReconnect) {
        return;
    }
    if (keepass.reconnectLoop === null) {
        keepass.reconnectLoop = setInterval(async () => {
            if (!keepass.isKeePassXCAvailable && Object.keys(keepass.keyRing).length > 0) {
                keepass.reconnect();
            }
        }, 30000); // Check every 30 seconds (longer interval than native messaging)
    }
};

keepass.disableAutomaticReconnect = function() {
    clearInterval(keepass.reconnectLoop);
    keepass.reconnectLoop = null;
};

keepass.reconnect = async function(tab = null, connectionTimeout = 5000) {
    if (Object.keys(keepass.keyRing).length === 0) {
        keepass.isKeePassXCAvailable = false;
        keepass.isConnected = false;
        return false;
    }

    try {
        const result = await keepass.testAssociation(tab);
        if (result) {
            keepass.clearErrorMessage(tab);
            keepass.updateDatabaseHashToContent();
            return true;
        }
    } catch (err) {
        logError(`reconnect failed: ${err}`);
    }

    return false;
};

//--------------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------------

keepass.getErrorMessage = async function(tab, errorCode) {
    return kpErrors.getError(errorCode);
};

keepass.generateNewKeyPair = function() {
    // No-op: sysPass uses API key auth, not key pairs
};

keepass.isConfigured = async function() {
    return Object.keys(keepass.keyRing).length > 0;
};

keepass.checkDatabaseHash = async function(tab) {
    return keepass.databaseHash;
};

keepass.isAssociated = function() {
    return keepass.associated.value && keepass.associated.hash && keepass.associated.hash === keepass.databaseHash;
};

keepass.setcurrentKeePassXCVersion = function(version) {
    // No-op for sysPass
};

keepass.keePassXCUpdateAvailable = async function() {
    return false;
};

keepass.checkForNewKeePassXCVersion = async function() {
    // No-op
};

keepass.getPasskeysRelatedOrigins = async function() {
    return [];
};

keepass.clearErrorMessage = function(tab) {
    if (tab && page.tabs[tab.id]) {
        page.tabs[tab.id].errorMessage = undefined;
    }
};

keepass.handleError = function(tab, errorCode, errorMessage = '') {
    if (errorMessage.length === 0) {
        errorMessage = kpErrors.getError(errorCode);
    }

    logError(`${errorCode}: ${errorMessage}`);
    if (tab && page.tabs[tab.id]) {
        page.tabs[tab.id].errorMessage = errorMessage;
    }
};

keepass.updatePopup = function() {
    if (page && page.tabs.length > 0) {
        browserAction.showDefault();
    }
};

keepass.updateDatabase = async function() {
    keepass.associated.value = false;
    keepass.associated.hash = null;
    page.clearAllLogins();

    await keepass.testAssociation(null, [ true ]);

    keepass.updatePopup();
    keepass.updateDatabaseHashToContent();
};

keepass.updateDatabaseHashToContent = async function() {
    try {
        const tab = await getCurrentTab();
        if (tab?.id) {
            browser.tabs.sendMessage(tab.id, {
                action: 'check_database_hash',
                hash: { old: keepass.previousDatabaseHash, new: keepass.databaseHash },
                connected: keepass.isKeePassXCAvailable
            }).catch(() => {
                logError('No content script available for this tab.');
            });
            keepass.previousDatabaseHash = keepass.databaseHash;
        }
    } catch (err) {
        logError(`updateDatabaseHashToContent failed: ${err}`);
    }
};

keepass.updateFeaturesList = function() {
    // Static features for sysPass
    keepass.featuresList = {
        downloadFaviconAfterSave: false,
        newTotp: false,
        passwordGenerator: true,
        passkeys: false,
        passkeysDefaultGroup: false,
        requiredKeePassXCVersionFound: true,
    };
};

keepass.compareMultipleVersions = function(versions, current, canBeEqual = true) {
    if (!Array.isArray(versions)) {
        return {};
    }

    const result = {};
    for (const version of versions) {
        result[version] = true; // All version checks pass for sysPass
    }

    return result;
};

const removeDuplicateEntries = function(arr) {
    const newArray = [];
    for (const a of arr) {
        if (newArray.some(i => i.uuid === a.uuid)) {
            continue;
        }
        newArray.push(a);
    }
    return newArray;
};
