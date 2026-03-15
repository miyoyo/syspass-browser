'use strict';

// sysPass JSON-RPC 2.0 API Client
// Replaces keepassClient (native messaging) with HTTP API calls to sysPass

const syspassClient = {};
syspassClient.requestId = 0;

const kpErrors = {
    UNKNOWN_ERROR: 0,
    DATABASE_NOT_OPENED: 1,
    DATABASE_HASH_NOT_RECEIVED: 2,
    CLIENT_PUBLIC_KEY_NOT_RECEIVED: 3,
    CANNOT_DECRYPT_MESSAGE: 4,
    TIMEOUT_OR_NOT_CONNECTED: 5,
    ACTION_CANCELLED_OR_DENIED: 6,
    PUBLIC_KEY_NOT_FOUND: 7,
    ASSOCIATION_FAILED: 8,
    KEY_CHANGE_FAILED: 9,
    ENCRYPTION_KEY_UNRECOGNIZED: 10,
    NO_SAVED_DATABASES_FOUND: 11,
    INCORRECT_ACTION: 12,
    EMPTY_MESSAGE_RECEIVED: 13,
    NO_URL_PROVIDED: 14,
    NO_LOGINS_FOUND: 15,

    // sysPass-specific errors
    SYSPASS_API_ERROR: 100,
    SYSPASS_AUTH_FAILED: 101,
    SYSPASS_NO_ACCOUNTS: 102,

    errorMessages: {
        0: { msg: tr('errorMessageUnknown') },
        1: { msg: tr('errorMessageDatabaseNotOpened') },
        5: { msg: tr('errorMessageTimeout') },
        8: { msg: tr('errorMessageAssociate') },
        10: { msg: tr('errorMessageEncryptionKey') },
        11: { msg: tr('errorMessageSavedDatabases') },
        15: { msg: tr('errorMessageNoLogins') },
        100: { msg: 'sysPass API returned an error.' },
        101: { msg: 'sysPass authentication failed. Check your API key and password.' },
        102: { msg: 'No accounts found in sysPass for this site.' },
    },

    getError(errorCode) {
        return this.errorMessages[errorCode]?.msg || 'Unknown error';
    }
};

// Send a raw JSON-RPC 2.0 request to the sysPass API
syspassClient.sendRequest = async function(url, method, params, timeoutMs = 10000) {
    syspassClient.requestId++;

    const body = {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: syspassClient.requestId
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    if (json.error) {
        const msg = json.error.message || JSON.stringify(json.error);
        throw new Error(`sysPass API error: ${msg}`);
    }

    return json.result;
};

// Search for accounts matching a hostname
syspassClient.searchAccounts = async function(url, authToken, text) {
    const result = await syspassClient.sendRequest(url, 'account/search', {
        authToken: authToken,
        text: text
    });

    return result?.result || [];
};

// Retrieve password for a specific account
syspassClient.viewPassword = async function(url, authToken, tokenPass, accountId) {
    const result = await syspassClient.sendRequest(url, 'account/viewPass', {
        authToken: authToken,
        tokenPass: tokenPass,
        id: accountId
    });

    return result?.result?.password || '';
};

// Create a new account in sysPass
syspassClient.createAccount = async function(url, authToken, tokenPass, accountData) {
    const params = {
        authToken: authToken,
        tokenPass: tokenPass,
        name: accountData.name || accountData.url,
        login: accountData.login,
        pass: accountData.password,
        url: accountData.url,
        categoryId: accountData.categoryId || 1,
        clientId: accountData.clientId || 1
    };

    const result = await syspassClient.sendRequest(url, 'account/create', params);
    return result;
};

// Edit an existing account's password in sysPass
syspassClient.editPassword = async function(url, authToken, tokenPass, accountId, newPassword) {
    const params = {
        authToken: authToken,
        tokenPass: tokenPass,
        id: accountId,
        pass: newPassword
    };

    const result = await syspassClient.sendRequest(url, 'account/editPass', params);
    return result;
};

// Edit an existing account's metadata in sysPass
syspassClient.editAccount = async function(url, authToken, tokenPass, accountId, accountData) {
    const params = {
        authToken: authToken,
        tokenPass: tokenPass,
        id: accountId
    };

    if (accountData.login) {
        params.login = accountData.login;
    }
    if (accountData.name) {
        params.name = accountData.name;
    }
    if (accountData.url) {
        params.url = accountData.url;
    }

    const result = await syspassClient.sendRequest(url, 'account/edit', params);
    return result;
};

// Test API connectivity by searching and optionally verifying password access
syspassClient.testConnection = async function(url, authToken, tokenPass) {
    // Test 1: Can we search?
    const accounts = await syspassClient.searchAccounts(url, authToken, '');

    // Test 2: Can we view passwords? (only if there are accounts)
    if (accounts.length > 0) {
        await syspassClient.viewPassword(url, authToken, tokenPass, accounts[0].id);
    }

    return true;
};
