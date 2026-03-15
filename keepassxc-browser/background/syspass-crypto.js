'use strict';

// Passkey-derived encryption for sysPass API credentials at rest.
//
// Architecture:
// - The keyRing (containing the API password) is ONLY stored encrypted.
// - Plaintext keyRing exists ONLY in memory while unlocked.
// - On lock/timeout, memory is wiped. No plaintext persists anywhere.
// - Unlock requires passkey authentication (WebAuthn PRF).

const syspassCrypto = {};
syspassCrypto.state = 'not_configured'; // 'not_configured' | 'locked' | 'unlocked'
syspassCrypto.encryptionKey = null; // CryptoKey, in memory only when unlocked
syspassCrypto.lockTimer = null;

// Storage keys
const STORAGE_ENCRYPTED_KEYRING = 'syspass_encrypted_keyring';
const STORAGE_WRAPPED_KEY = 'syspass_wrapped_key';
const STORAGE_KEY_IV = 'syspass_key_iv';
const STORAGE_KEYRING_IV = 'syspass_keyring_iv';
const STORAGE_CREDENTIAL_ID = 'syspass_credential_id';
const STORAGE_PRF_SALT = 'syspass_prf_salt';
const STORAGE_LOCK_MODE = 'syspass_lock_mode';
const STORAGE_LOCK_TIMEOUT = 'syspass_lock_timeout';

//--------------------------------------------------------------------------
// State management
//--------------------------------------------------------------------------

syspassCrypto.isUnlocked = function() {
    return syspassCrypto.state === 'unlocked';
};

syspassCrypto.isConfigured = function() {
    return syspassCrypto.state !== 'not_configured';
};

syspassCrypto.lock = function() {
    // Wipe encryption key from memory
    syspassCrypto.encryptionKey = null;
    syspassCrypto.state = 'locked';
    clearTimeout(syspassCrypto.lockTimer);
    syspassCrypto.lockTimer = null;

    // Wipe plaintext credentials from memory
    keepass.keyRing = {};
    keepass.isKeePassXCAvailable = false;
    keepass.isConnected = false;
    keepass.isDatabaseClosed = true;
    keepass.associated.value = false;
    keepass.associated.hash = null;
    keepass.databaseHash = '';

    page.clearAllLogins();
    keepass.updatePopup();
    keepass.updateDatabaseHashToContent();
};

// Called from popup/options page with the PRF-derived key material
syspassCrypto.unlock = async function(prfOutput) {
    try {
        const stored = await browser.storage.local.get([
            STORAGE_WRAPPED_KEY,
            STORAGE_ENCRYPTED_KEYRING, STORAGE_KEYRING_IV,
            STORAGE_PRF_SALT, STORAGE_LOCK_MODE, STORAGE_LOCK_TIMEOUT
        ]);

        if (!stored[STORAGE_WRAPPED_KEY] || !stored[STORAGE_ENCRYPTED_KEYRING]) {
            throw new Error('No encrypted keyring found');
        }

        // Derive wrapping key from PRF output using HKDF
        const wrappingKey = await syspassCrypto.deriveWrappingKey(
            prfOutput,
            base64ToBuffer(stored[STORAGE_PRF_SALT])
        );

        // Unwrap the encryption key
        const encryptionKey = await crypto.subtle.unwrapKey(
            'raw',
            base64ToBuffer(stored[STORAGE_WRAPPED_KEY]),
            wrappingKey,
            { name: 'AES-KW' },
            { name: 'AES-GCM' },
            true,
            [ 'encrypt', 'decrypt' ]
        );

        // Decrypt the keyRing
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToBuffer(stored[STORAGE_KEYRING_IV]) },
            encryptionKey,
            base64ToBuffer(stored[STORAGE_ENCRYPTED_KEYRING])
        );

        const keyRing = JSON.parse(new TextDecoder().decode(decrypted));

        // Restore state -- keyRing lives ONLY in memory
        syspassCrypto.encryptionKey = encryptionKey;
        syspassCrypto.state = 'unlocked';
        keepass.keyRing = keyRing;

        // Start lock timer if configured for timed mode
        const lockMode = stored[STORAGE_LOCK_MODE] || 'session';
        if (lockMode === 'timed') {
            const timeout = (stored[STORAGE_LOCK_TIMEOUT] || 15) * 60 * 1000;
            syspassCrypto.startLockTimer(timeout);
        }

        // Trigger reconnection
        await keepass.reconnect();

        return true;
    } catch (err) {
        logError(`syspassCrypto.unlock failed: ${err}`);
        return false;
    }
};

// Encrypt and store the keyRing, then DELETE plaintext from storage.
// Called during initial passkey setup from the options page.
// prfOutput: ArrayBuffer from WebAuthn PRF extension
// credentialId: ArrayBuffer of the credential ID used
syspassCrypto.encryptAndStore = async function(prfOutput, credentialId, keyRing) {
    try {
        // Generate a random encryption key
        const encryptionKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            [ 'encrypt', 'decrypt' ]
        );

        // Generate a random salt for HKDF
        const prfSalt = crypto.getRandomValues(new Uint8Array(32));

        // Derive wrapping key from PRF output
        const wrappingKey = await syspassCrypto.deriveWrappingKey(prfOutput, prfSalt);

        // Wrap the encryption key
        const wrappedKey = await crypto.subtle.wrapKey(
            'raw',
            encryptionKey,
            wrappingKey,
            { name: 'AES-KW' }
        );

        // Encrypt the keyRing
        const keyRingIv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(keyRing));
        const encryptedKeyRing = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: keyRingIv },
            encryptionKey,
            encoded
        );

        // Store encrypted data and DELETE plaintext keyRing from storage
        await browser.storage.local.set({
            [STORAGE_ENCRYPTED_KEYRING]: bufferToBase64(encryptedKeyRing),
            [STORAGE_WRAPPED_KEY]: bufferToBase64(wrappedKey),
            [STORAGE_KEYRING_IV]: bufferToBase64(keyRingIv),
            [STORAGE_PRF_SALT]: bufferToBase64(prfSalt),
            [STORAGE_CREDENTIAL_ID]: bufferToBase64(credentialId),
        });

        // Remove plaintext keyRing from storage -- this is the critical step
        await browser.storage.local.remove('keyRing');

        syspassCrypto.encryptionKey = encryptionKey;
        syspassCrypto.state = 'unlocked';

        // Start lock timer if timed mode was already configured
        const lockSettings = await syspassCrypto.loadLockSettings();
        if (lockSettings.mode === 'timed') {
            syspassCrypto.startLockTimer(lockSettings.timeout * 60 * 1000);
        }

        return true;
    } catch (err) {
        logError(`syspassCrypto.encryptAndStore failed: ${err}`);
        return false;
    }
};

// Re-encrypt keyRing with existing key (for keyRing updates while unlocked)
syspassCrypto.reencryptKeyRing = async function(keyRing) {
    if (!syspassCrypto.encryptionKey || syspassCrypto.state !== 'unlocked') {
        return false;
    }

    try {
        const keyRingIv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(keyRing));
        const encryptedKeyRing = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: keyRingIv },
            syspassCrypto.encryptionKey,
            encoded
        );

        await browser.storage.local.set({
            [STORAGE_ENCRYPTED_KEYRING]: bufferToBase64(encryptedKeyRing),
            [STORAGE_KEYRING_IV]: bufferToBase64(keyRingIv),
        });

        // Ensure no plaintext in storage
        await browser.storage.local.remove('keyRing');

        return true;
    } catch (err) {
        logError(`syspassCrypto.reencryptKeyRing failed: ${err}`);
        return false;
    }
};

// Save lock mode settings and apply immediately if unlocked
syspassCrypto.saveLockSettings = async function(mode, timeoutMinutes) {
    await browser.storage.local.set({
        [STORAGE_LOCK_MODE]: mode,
        [STORAGE_LOCK_TIMEOUT]: timeoutMinutes
    });

    // Apply timer changes immediately for the current session
    clearTimeout(syspassCrypto.lockTimer);
    syspassCrypto.lockTimer = null;
    if (mode === 'timed' && syspassCrypto.state === 'unlocked') {
        syspassCrypto.startLockTimer(timeoutMinutes * 60 * 1000);
    }
};

// Load lock mode settings
syspassCrypto.loadLockSettings = async function() {
    const stored = await browser.storage.local.get([ STORAGE_LOCK_MODE, STORAGE_LOCK_TIMEOUT ]);
    return {
        mode: stored[STORAGE_LOCK_MODE] || 'session',
        timeout: stored[STORAGE_LOCK_TIMEOUT] || 15
    };
};

// Get the stored credential ID for passkey authentication
syspassCrypto.getCredentialId = async function() {
    const stored = await browser.storage.local.get(STORAGE_CREDENTIAL_ID);
    if (stored[STORAGE_CREDENTIAL_ID]) {
        return base64ToBuffer(stored[STORAGE_CREDENTIAL_ID]);
    }
    return null;
};

// Get the stored PRF salt
syspassCrypto.getPrfSalt = async function() {
    const stored = await browser.storage.local.get(STORAGE_PRF_SALT);
    if (stored[STORAGE_PRF_SALT]) {
        return base64ToBuffer(stored[STORAGE_PRF_SALT]);
    }
    return null;
};

//--------------------------------------------------------------------------
// Internal helpers
//--------------------------------------------------------------------------

syspassCrypto.deriveWrappingKey = async function(prfOutput, salt) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        prfOutput,
        'HKDF',
        false,
        [ 'deriveKey' ]
    );

    return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: salt, info: new TextEncoder().encode('syspass-browser-key-wrap') },
        keyMaterial,
        { name: 'AES-KW', length: 256 },
        false,
        [ 'wrapKey', 'unwrapKey' ]
    );
};

syspassCrypto.startLockTimer = function(timeoutMs) {
    clearTimeout(syspassCrypto.lockTimer);
    syspassCrypto.lockTimer = setTimeout(() => {
        syspassCrypto.lock();
    }, timeoutMs);
};

// Check if encrypted keyring exists (to determine initial state on startup)
syspassCrypto.initialize = async function() {
    const stored = await browser.storage.local.get([ STORAGE_ENCRYPTED_KEYRING, STORAGE_CREDENTIAL_ID ]);
    if (stored[STORAGE_ENCRYPTED_KEYRING] && stored[STORAGE_CREDENTIAL_ID]) {
        syspassCrypto.state = 'locked';
        keepass.isDatabaseClosed = true;

        // Ensure no plaintext keyRing lingers in storage
        await browser.storage.local.remove('keyRing');
        keepass.keyRing = {};
    } else {
        syspassCrypto.state = 'not_configured';
    }
};

// Remove all passkey encryption data (for re-setup or fallback)
syspassCrypto.clear = async function() {
    await browser.storage.local.remove([
        STORAGE_ENCRYPTED_KEYRING, STORAGE_WRAPPED_KEY,
        STORAGE_KEY_IV, STORAGE_KEYRING_IV,
        STORAGE_CREDENTIAL_ID, STORAGE_PRF_SALT,
        STORAGE_LOCK_MODE, STORAGE_LOCK_TIMEOUT
    ]);
    syspassCrypto.encryptionKey = null;
    syspassCrypto.state = 'not_configured';
    clearTimeout(syspassCrypto.lockTimer);
};

//--------------------------------------------------------------------------
// Utilities
//--------------------------------------------------------------------------

function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
