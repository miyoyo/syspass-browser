'use strict';

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function showState(id) {
    for (const el of ['unlock-prompt', 'unlock-progress', 'unlock-success', 'unlock-error']) {
        document.getElementById(el).style.display = el === id ? 'block' : 'none';
    }
}

async function doUnlock() {
    showState('unlock-progress');

    try {
        const cryptoState = await browser.runtime.sendMessage({ action: 'syspass_get_crypto_state' });

        if (!cryptoState || !cryptoState.credentialId || !cryptoState.prfSalt) {
            throw new Error('No passkey configured.');
        }

        const credentialId = base64ToArrayBuffer(cryptoState.credentialId);

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                allowCredentials: [{
                    type: 'public-key',
                    id: credentialId
                }],
                userVerification: 'required',
                extensions: {
                    prf: {
                        eval: {
                            first: new TextEncoder().encode('syspass-browser-prf-v1')
                        }
                    }
                }
            }
        });

        const prfResult = assertion?.getClientExtensionResults()?.prf;
        if (!prfResult?.results?.first) {
            throw new Error('Passkey did not return PRF data. Your authenticator may not support this feature.');
        }

        const prfB64 = arrayBufferToBase64(prfResult.results.first);
        const unlocked = await browser.runtime.sendMessage({
            action: 'syspass_unlock',
            args: [prfB64]
        });

        if (!unlocked) {
            throw new Error('Decryption failed. Wrong passkey?');
        }

        showState('unlock-success');
        setTimeout(() => window.close(), 1000);
    } catch (err) {
        document.getElementById('error-text').textContent = err.message || 'Unlock failed.';
        showState('unlock-error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('do-unlock').addEventListener('click', doUnlock);
    document.getElementById('retry-unlock').addEventListener('click', doUnlock);

    // Auto-start the unlock flow
    doUnlock();
});
