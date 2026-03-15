'use strict';

const options = {};
options.dropdownButton = null;
options.isFirefox = false;

const $ = function(elem) {
    return document.querySelector(elem);
};

options.initMenu = function() {
    const tabs = [].slice.call(document.querySelectorAll('div.tab'));
    const sideBarLinks = [].slice.call(document.querySelectorAll('.sidebar ul.nav li a'));

    sideBarLinks.forEach(function(elem) {
        elem.addEventListener('click', function(e) {
            sideBarLinks.forEach(t => t.parentElement.classList.remove('active'));
            elem.parentElement.classList.add('active');
            tabs.forEach(t => t.hide());

            const activatedTab = $('div.tab#tab-' + elem.getAttribute('href').substring(1));
            activatedTab.classList.remove('d-none');
            activatedTab.show();
        });
    });

    $('div.tab').show();

    if (window.location.hash !== '') {
        document.querySelector(`a[href='${window.location.hash}']`)?.click();
    }
};

options.saveSetting = async function(name) {
    const id = '#' + name;
    $(id).closest('.control-group').removeClass('error').addClass('success');
    setTimeout(() => {
        $(id).closest('.control-group').removeClass('success');
    }, 2500);

    await browser.storage.local.set({ 'settings': options.settings });
    await browser.runtime.sendMessage({
        action: 'load_settings'
    });
};

options.saveSettings = async function() {
    await browser.storage.local.set({ 'settings': options.settings });
    const settings = await browser.runtime.sendMessage({
        action: 'load_settings'
    });

    return settings;
};

options.saveKeyRing = async function() {
    await browser.storage.local.set({ 'keyRing': options.keyRing });
    await browser.runtime.sendMessage({
        action: 'load_keyring'
    });
};

options.initGeneralSettings = async function() {
    const changeCheckboxValue = async function(e) {
        const name = e.currentTarget.name;
        const isChecked = e.currentTarget.checked;
        options.settings[name] = isChecked;

        // Default password manager setting relies on optional permission, and must be checked before saving options
        if (name === 'defaultPasswordManager') {
            const isDefaultPasswordManagerSet = await updateDefaultPasswordManager();
            options.settings[name] = isDefaultPasswordManagerSet;
            e.target.checked = isDefaultPasswordManagerSet;
        }

        const updated = await options.saveSettings();
        if (name === 'autoFillAndSend') {
            browser.runtime.sendMessage({ action: 'init_http_auth' });
        } else if (name === 'defaultGroupAlwaysAsk') {
            $('#defaultGroup').disabled = isChecked;
            $('#defaultGroupButton').disabled = isChecked;
            $('#defaultGroupButtonReset').disabled = isChecked;
        } else if (name === 'autoReconnect') {
            const message = updated.autoReconnect ? 'enable_automatic_reconnect' : 'disable_automatic_reconnect';
            browser.runtime.sendMessage({ action: message });
        } else if (name === 'passkeys') {
            $('#passkeysFallback').disabled = !isChecked;
        } else if (name === 'useMonochromeToolbarIcon') {
            browser.runtime.sendMessage({ action: 'update_popup' });
        }
    };

    const changeRadioValue = function(e) {
        options.settings[e.currentTarget.name] = Number(e.currentTarget.value);
        options.saveSettings();
    };

    $('#tab-general-settings select#colorTheme').value = options.settings['colorTheme'];

    const generalSettingsCheckboxes = document.querySelectorAll('#tab-general-settings input[type=checkbox]');
    for (const checkbox of generalSettingsCheckboxes) {
        checkbox.checked = options.settings[checkbox.name];
        if (checkbox.name === 'defaultGroupAlwaysAsk' && checkbox.checked) {
            $('#defaultGroup').disabled = true;
            $('#defaultGroupButton').disabled = true;
            $('#defaultGroupButtonReset').disabled = true;
        }

        checkbox.addEventListener('click', changeCheckboxValue);
    }

    $('#tab-general-settings input[type=radio]#checkUpdateThreeDays').value = CHECK_UPDATE_THREE_DAYS;
    $('#tab-general-settings input[type=radio]#checkUpdateOneWeek').value = CHECK_UPDATE_ONE_WEEK;
    $('#tab-general-settings input[type=radio]#checkUpdateOneMonth').value = CHECK_UPDATE_ONE_MONTH;
    $('#tab-general-settings input[type=radio]#checkUpdateNever').value = CHECK_UPDATE_NEVER;

    $('#tab-general-settings input[type=range]').value = options.settings['redirectAllowance'];
    $('#redirectAllowanceLabel').textContent = tr('optionsRedirectAllowance',
        options.settings['redirectAllowance'] === 11 ? 'Infinite' : String(options.settings['redirectAllowance']));

    $('#tab-general-settings select#credentialSorting').value = options.settings['credentialSorting'];
    $('#tab-general-settings select#afterFillSorting').value = options.settings['afterFillSorting'];
    $('#tab-general-settings select#afterFillSortingTotp').value = options.settings['afterFillSortingTotp'];
    $('#tab-general-settings input#defaultGroup').value = options.settings['defaultGroup'];
    $('#tab-general-settings input#defaultPasskeyGroup').value = options.settings['defaultPasskeyGroup'];
    $('#tab-general-settings input#clearCredentialTimeout').value = options.settings['clearCredentialsTimeout'];

    const generalSettingsRadioInputs = document.querySelectorAll('#tab-general-settings input[type=radio]');
    for (const radio of generalSettingsRadioInputs) {
        if (radio.value === String(options.settings[radio.name])) {
            radio.checked = true;
        }

        radio.addEventListener('click', changeRadioValue);
    }

    $('#tab-general-settings select#colorTheme').addEventListener('change', async function(e) {
        options.settings['colorTheme'] = e.currentTarget.value;
        // The theme is also stored in localStorage to prevent a white flash when the settings are first opened
        localStorage.setItem('colorTheme', options.settings['colorTheme']);
        await options.saveSettings();
        options.updateTheme();
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (options.settings['colorTheme'] === 'system') {
            options.updateTheme();
        }
    });

    $('#tab-general-settings select#credentialSorting').addEventListener('change', async function(e) {
        options.settings['credentialSorting'] = e.currentTarget.value;
        await options.saveSettings();
    });

    $('#tab-general-settings select#afterFillSorting').addEventListener('change', async function(e) {
        options.settings['afterFillSorting'] = e.currentTarget.value;
        await options.saveSettings();
    });

    $('#tab-general-settings select#afterFillSortingTotp').addEventListener('change', async function(e) {
        options.settings['afterFillSortingTotp'] = e.currentTarget.value;
        await options.saveSettings();
    });

    $('#tab-general-settings input#clearCredentialTimeout').addEventListener('change', async function(e) {
        if (e.target.valueAsNumber < 0 || e.target.valueAsNumber > 3600) {
            return;
        }

        options.settings['clearCredentialsTimeout'] = e.target.valueAsNumber;
        await options.saveSettings();
    });

    // Change label text dynamically with the range input
    $('#tab-general-settings input[type=range]').addEventListener('input', function(e) {
        const currentValue = e.target.valueAsNumber === 11 ? 'Infinite' : e.target.value;
        $('#redirectAllowanceLabel').textContent = tr('optionsRedirectAllowance', currentValue);
    });

    // Only save the setting when mouse is released from the range input
    $('#tab-general-settings input[type=range]').addEventListener('change', async function(e) {
        options.settings['redirectAllowance'] = e.target.valueAsNumber;
        await options.saveSettings();
    });

    await browser.runtime.sendMessage({
        action: 'get_keepassxc_versions'
    }).then(options.showKeePassXCVersions);

    $('#tab-general-settings button.checkUpdateKeePassXC').addEventListener('click', function(e) {
        e.preventDefault();
        e.disabled = true;

        browser.runtime.sendMessage({
            action: 'check_update_keepassxc'
        }).then(options.showKeePassXCVersions);
    });

    browser.commands.getAll().then(function(commands) {
        commands.forEach(function(command) {
            const shortcut = document.getElementById(`${command.name}-shortcut`);
            if (!shortcut) {
                return;
            }
            shortcut.textContent = command.shortcut || 'not configured';
        });
    });

    $('#configureCommands').addEventListener('click', function() {
        if (options.isFirefox) {
            if (typeof(browser.commands.openShortcutSettings) === 'function') {
                browser.commands.openShortcutSettings();
            } else {
                // TODO: Remove internal shortcuts page after Firefox ESR has support for openShortcutSettings()
                browser.tabs.create({
                    url: browser.runtime.getURL('options/shortcuts.html')
                });
            }
            return;
        }

        const scheme = isEdge() ? 'edge' : 'chrome';
        browser.tabs.create({
            url: `${scheme}://extensions/shortcuts`
        });
    });

    // Default group
    $('#defaultGroupButton').addEventListener('click', async function() {
        const value = $('#defaultGroup').value;
        options.settings['defaultGroup'] = (value.length > 0 ? value : '');
        await options.saveSettings();
    });

    $('#defaultGroupButtonReset').addEventListener('click', async function() {
        $('#defaultGroup').value = '';
        options.settings['defaultGroup'] = '';
        await options.saveSettings();
    });

    // Default passkey group
    $('#defaultPasskeyGroupButton').addEventListener('click', async function() {
        const value = $('#defaultPasskeyGroup').value;
        options.settings['defaultPasskeyGroup'] = (value.length > 0 ? value : '');
        await options.saveSettings();
    });

    $('#defaultPasskeyGroupButtonReset').addEventListener('click', async function() {
        $('#defaultPasskeyGroup').value = '';
        options.settings['defaultPasskeyGroup'] = '';
        await options.saveSettings();
    });

    $('#passkeysFallback').disabled = options.settings['passkeys'] === false;

    let temporarySettings;
    const dialogImportSettingsModal = new bootstrap.Modal('#dialogImportSettings',
        { keyboard: true, focus: false, backdrop: true });

    $('#dialogImportSettings').addEventListener('shown.bs.modal', function(modalEvent) {
        modalEvent.currentTarget.querySelector('.modal-footer button.yes').focus();
    });

    $('#importSettingsButton').addEventListener('click', function() {
        const link = document.createElement('input');
        link.setAttribute('type', 'file');
        link.onchange = function(e) {
            const reader = new FileReader();

            if (e.target.files.length > 0) {
                reader.readAsText(e.target.files[0]);
            }

            reader.onloadend = function(ev) {
                try {
                    const contents = JSON.parse(ev.target.result);

                    // A quick check that this is the KeePassXC-Browser settings file
                    if (contents['checkUpdateKeePassXC'] === undefined
                        || contents['autoCompleteUsernames'] === undefined
                        || contents['autoFillAndSend'] === undefined) {
                        console.log('Error: Not a KeePassXC-Browser settings file.');
                        return;
                    }

                    // Verify the import
                    temporarySettings = contents;
                    dialogImportSettingsModal.show();
                } catch (_err) {
                    console.log('Error loading JSON settings file.');
                }
            };
        };

        link.click();
    });

    $('#exportSettingsButton').addEventListener('click', function() {
        const link = document.createElement('a');
        const file = new Blob([ JSON.stringify(options.settings) ], { type: 'application/json' });
        link.href = URL.createObjectURL(file);
        link.download = 'keepassxc-browser_settings.json';
        link.click();
    });

    $('#dialogImportSettings .modal-footer button.yes').addEventListener('click', function(e) {
        dialogImportSettingsModal.hide();

        if (temporarySettings) {
            options.settings = temporarySettings;
            options.saveSettings();
        }
    });

    // Reset all settings modal
    const dialogResetSettingsModal = new bootstrap.Modal('#dialogResetSettings',
        { keyboard: true, focus: false, backdrop: true });

    $('#dialogResetSettings').addEventListener('shown.bs.modal', function(modalEvent) {
        modalEvent.currentTarget.querySelector('.modal-footer button.yes').focus();
    });

    $('#resetSettingsButton').addEventListener('click', function() {
        dialogResetSettingsModal.show();
    });

    $('#dialogResetSettings .modal-footer button.yes').addEventListener('click', function(e) {
        dialogResetSettingsModal.hide();
        browser.runtime.sendMessage({ action: 'reset_all_settings' });
        location.reload();
    });

    $('#copyVersionToClipboard').addEventListener('click', function () {
        const copyText = document.getElementById('versionInfo').innerText;
        navigator.clipboard.writeText(copyText);
    });

    // Add predefined sites to the <details> list
    const siteListing = $('#predefinedSiteList');
    if (siteListing) {
        // From sites.js
        for (const site of PREDEFINED_SITELIST) {
            const elem = document.createElement('span');
            elem.textContent = site;
            elem.classList.add('form-text');
            elem.classList.add('px-3');
            siteListing.append(elem);
            siteListing.append(document.createElement('br'));
        }
    }
};

// Also hides/disables any options with KeePassXC versions that are too old
options.showKeePassXCVersions = async function(response) {
    if (response.current === '') {
        response.current = 'unknown';
    }
    if (response.latest === '') {
        response.latest = 'unknown';
    }

    $('#tab-general-settings .kphVersion span.yourVersion').textContent = response.current;
    $('#tab-general-settings .kphVersion span.latestVersion').textContent = response.latest;
    $('#tab-about span.versionKPH').textContent = response.current;
    $('#tab-about span.kpxcVersion').textContent = response.current;
    $('#tab-general-settings button.checkUpdateKeePassXC').disabled = false;

    const featureList = await browser.runtime.sendMessage({ action: 'get_features_list' });
    if (featureList?.requiredKeePassXCVersionFound) {
        $('#tab-general-settings #versionRequiredAlert').hide();
    } else {
        $('#tab-general-settings #showGroupNameInAutocomplete').disabled = true;
        $('#tab-general-settings #minimumVersionAlert').show();
    }

    if (!featureList?.downloadFaviconAfterSave) {
        $('#tab-general-settings #downloadFaviconAfterSaveFormGroup').hide();
    }

    if (!featureList?.passkeys) {
        $('#tab-general-settings #passkeysOptionsCard').hide();
    }

    if (!featureList?.passkeysDefaultGroup) {
        $('#tab-general-settings #passkeysDefaultGroup').hide();
    }
};

options.getPartiallyHiddenKey = function(key) {
    return !key ? 'Error' : (key.substr(0, 8) + '*'.repeat(10));
};

options.initConnectedDatabases = function() {
    const statusEl = $('#syspass-status');
    const connectionInfo = $('#syspass-connection-info');
    const connectBtn = $('#syspass-connect-button');
    const disconnectBtn = $('#syspass-disconnect-button');

    const showStatus = function(message, type) {
        statusEl.textContent = message;
        statusEl.className = 'alert mb-3 alert-' + type;
    };

    const hideStatus = function() {
        statusEl.className = 'alert d-none mb-3';
    };

    const updateConnectionDisplay = function() {
        const keys = Object.keys(options.keyRing);
        if (keys.length > 0) {
            const entry = options.keyRing[keys[0]];
            $('#sysPassURL').value = entry.id || '';
            $('#sysPassAPIKey').value = entry.hash || '';
            $('#sysPassAPIKeyPass').value = '';

            $('#syspass-info-url').textContent = entry.id;
            $('#syspass-info-key').textContent = options.getPartiallyHiddenKey(entry.hash);
            $('#syspass-info-lastused').textContent = entry.lastUsed
                ? new Date(entry.lastUsed).toLocaleString() : 'never';
            $('#syspass-info-created').textContent = entry.created
                ? new Date(entry.created).toLocaleDateString() : 'unknown';

            connectionInfo.classList.remove('d-none');
            disconnectBtn.classList.remove('d-none');
        } else {
            connectionInfo.classList.add('d-none');
            disconnectBtn.classList.add('d-none');
        }
    };

    updateConnectionDisplay();

    connectBtn.addEventListener('click', async function() {
        const url = $('#sysPassURL').value.trim();
        const apiKey = $('#sysPassAPIKey').value.trim();
        const apiPass = $('#sysPassAPIKeyPass').value.trim();

        if (!url || !apiKey || !apiPass) {
            showStatus('Please fill in all fields.', 'warning');
            return;
        }

        showStatus('Connecting...', 'info');
        connectBtn.disabled = true;

        try {
            // Save to keyRing
            options.keyRing = {};
            options.keyRing[apiKey] = {
                id: url,
                key: apiPass,
                hash: apiKey,
                created: new Date().valueOf(),
                lastUsed: new Date().valueOf()
            };

            await options.saveKeyRing();

            // Test the connection
            const result = await browser.runtime.sendMessage({ action: 'reconnect' });

            if (result && result.keePassXCAvailable) {
                showStatus('Connected to sysPass successfully!', 'success');
                updateConnectionDisplay();
            } else if (result && result.error) {
                showStatus('Connection failed: ' + result.error, 'danger');
            } else {
                showStatus('Connected to sysPass.', 'success');
                updateConnectionDisplay();
            }
        } catch (err) {
            showStatus('Connection failed: ' + err.message, 'danger');
        } finally {
            connectBtn.disabled = false;
        }
    });

    disconnectBtn.addEventListener('click', async function() {
        options.keyRing = {};
        await options.saveKeyRing();
        await browser.runtime.sendMessage({ action: 'syspass_clear_crypto' }).catch(() => {});
        await browser.runtime.sendMessage({ action: 'reconnect' }).catch(() => {});
        browser.runtime.sendMessage({ action: 'update_popup' });

        connectionInfo.classList.add('d-none');
        disconnectBtn.classList.add('d-none');
        hideStatus();

        $('#sysPassURL').value = '';
        $('#sysPassAPIKey').value = '';
        $('#sysPassAPIKeyPass').value = '';
    });

    // Passkey protection setup
    options.initPasskeyProtection();
};

options.initPasskeyProtection = async function() {
    const setupBtn = $('#passkey-setup-button');
    const removeBtn = $('#passkey-remove-button');
    const statusEl = $('#passkey-status');
    const unsupportedEl = $('#passkey-unsupported');
    const lockModeSelect = $('#passkeyLockMode');
    const timeoutInput = $('#passkeyLockTimeout');
    const timeoutGroup = $('#passkeyTimeoutGroup');

    const showPasskeyStatus = function(message, type) {
        statusEl.textContent = message;
        statusEl.className = 'alert mb-3 alert-' + type;
    };

    // Check PRF support
    const prfSupported = await checkPrfSupport();
    if (!prfSupported) {
        unsupportedEl.classList.remove('d-none');
        setupBtn.disabled = true;
    }

    // Load current state
    const cryptoState = await browser.runtime.sendMessage({ action: 'syspass_get_crypto_state' }).catch(() => null);
    if (cryptoState) {
        lockModeSelect.value = cryptoState.lockSettings?.mode || 'session';
        timeoutInput.value = cryptoState.lockSettings?.timeout || 15;
        timeoutGroup.style.display = lockModeSelect.value === 'timed' ? 'block' : 'none';

        if (cryptoState.state !== 'not_configured') {
            setupBtn.classList.add('d-none');
            removeBtn.classList.remove('d-none');
            showPasskeyStatus('Passkey protection is active. State: ' + cryptoState.state, 'success');
        }
    }

    lockModeSelect.addEventListener('change', function() {
        timeoutGroup.style.display = this.value === 'timed' ? 'block' : 'none';
        browser.runtime.sendMessage({
            action: 'syspass_save_lock_settings',
            args: [this.value, parseInt(timeoutInput.value)]
        });
    });

    timeoutInput.addEventListener('change', function() {
        browser.runtime.sendMessage({
            action: 'syspass_save_lock_settings',
            args: [lockModeSelect.value, parseInt(this.value)]
        });
    });

    setupBtn.addEventListener('click', async function() {
        if (Object.keys(options.keyRing).length === 0) {
            showPasskeyStatus('Connect to sysPass first before setting up passkey protection.', 'warning');
            return;
        }

        try {
            showPasskeyStatus('Creating passkey...', 'info');

            // Create a PRF-capable credential
            const credential = await navigator.credentials.create({
                publicKey: {
                    rp: { name: 'sysPass-Browser Extension', id: location.hostname || 'syspass-browser' },
                    user: {
                        id: crypto.getRandomValues(new Uint8Array(32)),
                        name: 'syspass-browser-key',
                        displayName: 'sysPass Browser Encryption Key'
                    },
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    pubKeyCredParams: [
                        { type: 'public-key', alg: -7 },
                        { type: 'public-key', alg: -257 }
                    ],
                    extensions: {
                        prf: {
                            eval: {
                                first: new TextEncoder().encode('syspass-browser-prf-v1')
                            }
                        }
                    },
                    authenticatorSelection: {
                        userVerification: 'required',
                        residentKey: 'required',
                        requireResidentKey: true
                    }
                }
            });

            if (!credential) {
                showPasskeyStatus('Passkey creation was cancelled.', 'warning');
                return;
            }

            // Get PRF output
            const prfResult = credential.getClientExtensionResults()?.prf;
            if (!prfResult?.results?.first) {
                showPasskeyStatus('Your authenticator does not support PRF. Credentials will remain unencrypted.', 'warning');
                return;
            }

            // Save lock settings first
            await browser.runtime.sendMessage({
                action: 'syspass_save_lock_settings',
                args: [lockModeSelect.value, parseInt(timeoutInput.value)]
            });

            // Encrypt and store
            const prfB64 = arrayBufferToBase64(prfResult.results.first);
            const credIdB64 = arrayBufferToBase64(credential.rawId);

            const success = await browser.runtime.sendMessage({
                action: 'syspass_encrypt_keyring',
                args: [prfB64, credIdB64]
            });

            if (success) {
                showPasskeyStatus('Passkey protection set up successfully!', 'success');
                setupBtn.classList.add('d-none');
                removeBtn.classList.remove('d-none');
            } else {
                showPasskeyStatus('Failed to encrypt credentials.', 'danger');
            }
        } catch (err) {
            showPasskeyStatus('Passkey setup failed: ' + err.message, 'danger');
        }
    });

    removeBtn.addEventListener('click', async function() {
        await browser.runtime.sendMessage({ action: 'syspass_clear_crypto' });
        showPasskeyStatus('Passkey protection removed. Credentials are now stored unencrypted.', 'info');
        removeBtn.classList.add('d-none');
        setupBtn.classList.remove('d-none');
    });
};

async function checkPrfSupport() {
    try {
        if (!window.PublicKeyCredential) {
            return false;
        }
        // Basic check that the WebAuthn API is available
        return typeof navigator.credentials?.create === 'function';
    } catch {
        return false;
    }
}

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

options.initCustomLoginFields = function() {
    const dialogDeleteCustomLoginFieldsModal = new bootstrap.Modal('#dialogDeleteCustomLoginFields',
        { keyboard: true, focus: false, backdrop: true });

    $('#dialogDeleteCustomLoginFields').addEventListener('shown.bs.modal', function(modalEvent) {
        modalEvent.currentTarget.querySelector('.modal-footer button.yes').focus();
    });

    const removeButtonClicked = function(e) {
        e.preventDefault();

        const closestTr = this.closest('tr');
        $('#dialogDeleteCustomLoginFields').setAttribute('url', closestTr.getAttribute('url'));
        $('#dialogDeleteCustomLoginFields').setAttribute('tr-id', closestTr.getAttribute('id'));
        $('#dialogDeleteCustomLoginFields .modal-body strong').textContent = closestTr.children[0].textContent;

        dialogDeleteCustomLoginFieldsModal.show();
    };

    $('#dialogDeleteCustomLoginFields .modal-footer button.yes').addEventListener('click', function(e) {
        dialogDeleteCustomLoginFieldsModal.hide();

        const url = $('#dialogDeleteCustomLoginFields').getAttribute('url');
        const trId = $('#dialogDeleteCustomLoginFields').getAttribute('tr-id');
        $('#tab-custom-fields #' + trId).remove();

        delete options.settings['defined-custom-fields'][url];
        options.saveSettings();
    });

    const rowClone = $('#tab-custom-fields table tr.clone').cloneNode(true);
    rowClone.classList.remove('clone', 'd-none');
    let counter = 1;

    for (const url in options.settings['defined-custom-fields']) {
        const row = rowClone.cloneNode(true);
        row.setAttribute('url', url);
        row.setAttribute('id', 'tr-clf' + counter);
        ++counter;

        row.children[0].textContent = url;
        row.children[1].addEventListener('click', removeButtonClicked);
        $('#tab-custom-fields table tbody').append(row);
    }
};

options.initSitePreferences = function() {
    if (!options.settings['sitePreferences']) {
        options.settings['sitePreferences'] = [];
    }

    const dialogDeleteSiteModal = new bootstrap.Modal('#dialogDeleteSite',
        { keyboard: true, focus: false, backdrop: true });

    $('#dialogDeleteSite').addEventListener('shown.bs.modal', function(modalEvent) {
        modalEvent.currentTarget.querySelector('.modal-footer button.yes').focus();
    });

    const settingsButtonClicked = function(e) {
        e.preventDefault();

        const closestTr = e.target.closest('tr');
        const url = closestTr.getAttribute('url');
        const sitePreferences = options.settings['sitePreferences']?.find((pref) => pref?.url === url);
        const usernameOnly = sitePreferences.usernameOnly;
        const improvedFieldDetection = sitePreferences.improvedFieldDetection;
        const allowIframes = sitePreferences.allowIframes;

        const dropdown = $('.settings-dropdown');
        if (dropdown?.style?.display !== 'block'
            || (dropdown?.style?.display === 'block' && e.target !== options.dropdownButton)) {
            if (options.dropdownButton) {
                options.dropdownButton.classList.remove('active');
                // Update number of enabled settings to the old Settings button
                const checkboxValues = Array.from(dropdown?.querySelectorAll('input[type=checkbox]')).map(c => c.checked);
                updateSettingsButtonText(options.dropdownButton, checkboxValues);
            }

            // Apply current settings to the dropdown
            dropdown.querySelector('#usernameOnly').checked = usernameOnly;
            dropdown.querySelector('#improvedFieldDetection').checked = improvedFieldDetection;
            dropdown.querySelector('#allowIframes').checked = allowIframes;

            dropdown?.show();
            updateDropdownPosition(e, dropdown);
            options.dropdownButton = e.target;
            options.dropdownButton.classList.add('active');
        } else {
            dropdown?.hide();
            options.dropdownButton.classList.remove('active');
            updateSettingsButtonText(options.dropdownButton, [ usernameOnly, improvedFieldDetection, allowIframes ]);
            options.dropdownButton = null;
        }
    };

    const removeButtonClicked = function(e) {
        e.preventDefault();

        const closestTr = e.target.closest('tr');
        $('#dialogDeleteSite').setAttribute('url', closestTr.getAttribute('url'));
        $('#dialogDeleteSite').setAttribute('tr-id', closestTr.getAttribute('id'));
        $('#dialogDeleteSite .modal-body strong').textContent = closestTr.getAttribute('url');

        dialogDeleteSiteModal.show();
    };

    // Shows or hides Cancel / Save buttons on row
    const enterEditMode = function(e, row, inputField, editButton, cancelButton, saveButton) {
        e.preventDefault();
        if (!row || !inputField) {
            return;
        }

        if (inputField.disabled) {
            inputField.disabled = false;
            cancelButton.show();
            saveButton.show();
            saveButton.disabled = true;
            editButton.hide();
            inputField.focus();
            inputField.setSelectionRange(inputField.value?.length || 0, inputField.value?.length || 0);
        }
    };

    const exitEditMode = function(e, row, inputField, editButton, cancelButton, saveButton) {
        e.preventDefault();
        if (!row || !inputField) {
            return;
        }

        if (!inputField.disabled) {
            inputField.disabled = true;
            inputField.value = row.getAttribute('url');
            cancelButton.hide();
            saveButton.hide();
            editButton.show();
        }
    };

    const saveModifiedUrl = function(e, row, inputField, editButton, cancelButton, saveButton) {
        e.preventDefault();
        if (!row || !inputField) {
            return;
        }

        const currentUrl = row.getAttribute('url');
        for (const site of options.settings['sitePreferences']) {
            if (site.url === currentUrl && inputField.validity.valid && inputField.value !== currentUrl) {
                if (slashNeededForUrl(inputField.value)) {
                    inputField.value += '/';
                }
                site.url = inputField.value;
                row.setAttribute('url', inputField.value);
                exitEditMode(e, row, inputField, editButton, cancelButton, saveButton);
                options.saveSettings();
                return;
            }
        }
    };

    const checkboxClicked = async function(e) {
        const closestTr = options?.dropdownButton?.closest('tr');
        const url = closestTr.getAttribute('url');

        for (const site of options.settings['sitePreferences']) {
            if (site.url === url) {
                if (e.target.name === SitePreferences.USERNAME_ONLY) {
                    site.usernameOnly = e.target.checked;
                } else if (e.target.name === SitePreferences.IMPROVED_FIELD_DETECTION) {
                    site.improvedFieldDetection = e.target.checked;
                } else if (e.target.name === SitePreferences.ALLOW_IFRAMES) {
                    site.allowIframes = e.target.checked;
                }
            }
        }

        options.saveSettings();
    };

    const selectionChanged = function() {
        const closestTr = this.closest('tr');
        const url = closestTr.getAttribute('url');

        for (const site of options.settings['sitePreferences']) {
            if (site.url === url) {
                site.ignore = this.value;
            }
        }

        options.saveSettings();
    };

    const dropdown = $('.settings-dropdown');
    dropdown.querySelector('#usernameOnly').addEventListener('change', checkboxClicked);
    dropdown.querySelector('#improvedFieldDetection').addEventListener('change',checkboxClicked);
    dropdown.querySelector('#allowIframes').addEventListener('change', checkboxClicked);

    const addNewRow = function(rowClone, newIndex, url, ignore, usernameOnly, improvedFieldDetection, allowIframes) {
        const row = rowClone.cloneNode(true);
        row.setAttribute('url', url);
        row.setAttribute('id', 'tr-scf' + newIndex);

        // Handle listeners for Edit/Cancel/Save buttons
        const inputField = row?.querySelector('input#editUrl');
        const editButton = row?.querySelector('button#sitePreferencesEditUrl');
        const cancelButton = row?.querySelector('button#sitePreferencesCancelEdit');
        const saveButton = row?.querySelector('button#sitePreferencesSaveEdit');
        inputField?.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                saveModifiedUrl(e, row, inputField, editButton, cancelButton, saveButton);
            } else if (e.key === 'Escape') {
                exitEditMode(e, row, inputField, editButton, cancelButton, saveButton);
            } else {
                saveButton.disabled = !inputField.validity.valid || inputField.value === url;
            }
        });
        editButton?.addEventListener('click', (e) =>
            enterEditMode(e, row, inputField, editButton, cancelButton, saveButton)
        );
        cancelButton?.addEventListener('click', (e) =>
            exitEditMode(e, row, inputField, editButton, cancelButton, saveButton)
        );
        saveButton?.addEventListener('click', (e) =>
            saveModifiedUrl(e, row, inputField, editButton, cancelButton, saveButton)
        );

        // Page URL
        row.children[0].children[0].children[0].value = url;
        row.children[0].children[0]?.addEventListener('dblclick', (e) =>
            enterEditMode(e, row, inputField, editButton, cancelButton, saveButton)
        );

        // Settings
        const settings = row.children[1];
        updateSettingsButtonText(settings.querySelector('#settings-button'),
            [ usernameOnly, improvedFieldDetection, allowIframes ]);
        settings.querySelector('#settings-button').addEventListener('click', (e) => settingsButtonClicked(e));

        // Ignore
        const ignoreSelect = row.children[2];
        ignoreSelect.querySelector('#ignore-select').value = ignore;
        ignoreSelect.querySelector('#ignore-select').addEventListener('change', selectionChanged);

        // Remove button
        row.children[3].addEventListener('click', removeButtonClicked);

        $('#tab-site-preferences table tbody').append(row);
    };

    $('#dialogDeleteSite .modal-footer button.yes').addEventListener('click', function(e) {
        dialogDeleteSiteModal.hide();

        const url = $('#dialogDeleteSite').getAttribute('url');
        const trId = $('#dialogDeleteSite').getAttribute('tr-id');
        $('#tab-site-preferences #' + trId).remove();

        for (let i = 0; i < options.settings['sitePreferences'].length; ++i) {
            if (options.settings['sitePreferences'][i].url === url) {
                options.settings['sitePreferences'].splice(i, 1);
            }
        }

        options.saveSettings();
    });

    $('#manualUrl').addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            $('#sitePreferencesManualAdd').click();
        }
    });

    $('#sitePreferencesManualAdd').addEventListener('click', function(e) {
        const manualUrl = document.querySelector('#manualUrl');
        if (!manualUrl) {
            return;
        }

        // Show error for invalid input
        if (!manualUrl.validity.valid) {
            options.createWarning(manualUrl, tr('optionsErrorInvalidURL'));
            return;
        }

        let value = manualUrl.value;

        // Fills the last / char if needed. This ensures the compatibility with Match Patterns
        if (slashNeededForUrl(value)) {
            value += '/';
        }

        // Check if the URL is already in the list
        if (options.settings['sitePreferences'].some(s => s.url === value)) {
            options.createWarning(manualUrl, tr('optionsErrorValueExists'));
            return;
        }

        if (options.settings['sitePreferences'] === undefined) {
            options.settings['sitePreferences'] = [];
        }

        const newIndex = options.settings['sitePreferences'].length + 1;
        const rowClone = $('#tab-site-preferences table tr.clone').cloneNode(true);
        rowClone.classList.remove('clone', 'd-none');

        addNewRow(rowClone, newIndex, value, IGNORE_NOTHING, false, false, false);
        $('#tab-site-preferences table tbody tr.empty').hide();

        options.settings['sitePreferences'].push({
            allowIframes: false,
            ignore: IGNORE_NOTHING,
            improvedFieldDetection: false,
            url: value,
            usernameOnly: false,
        });
        options.saveSettings();
        manualUrl.value = '';
    });

    const rowClone = $('#tab-site-preferences table tr.clone').cloneNode(true);
    rowClone.classList.remove('clone', 'd-none');
    let counter = 1;
    if (options.settings['sitePreferences']) {
        for (const site of options.settings['sitePreferences']) {
            addNewRow(
                rowClone,
                counter,
                site.url,
                site.ignore,
                site.usernameOnly,
                site.improvedFieldDetection,
                site.allowIframes,
            );
            ++counter;
        }
    }
};

options.initAbout = function() {
    const version = browser.runtime.getManifest().version;
    let platform = navigator.platform;
    if (platform === 'Win32' && (navigator.userAgent.includes('x64') || navigator.userAgent.includes('WOW64'))) {
        platform = 'Win64';
    }

    $('#tab-about span.versionCIP').textContent = version;
    $('#tab-about span.kpxcbrVersion').textContent = version;
    $('#tab-about span.kpxcbrOS').textContent = platform;
    $('#tab-about span.kpxcbrBrowser').textContent = getBrowserId(navigator.userAgent);
};

options.updateTheme = function() {
    let theme = options.settings['colorTheme'];
    if (theme === 'system') {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-bs-theme', theme);
    browser.runtime.sendMessage({ action: 'update_popup' });
};

options.createWarning = function(elem, text) {
    const banner = document.createElement('div');
    banner.classList.add('alert', 'alert-dismissible', 'alert-danger', 'mt-2');
    banner.style.position = 'relative';
    banner.style.marginBottom = '0px';
    banner.style.width = '100%';
    banner.textContent = text;
    banner.setAttribute('role', 'alert');
    elem.parentElement.append(banner);

    // Destroy the warning after five seconds
    setTimeout(() => {
        elem.parentElement.removeChild(banner);
    }, 5000);
};

options.hideUnsupportedFeatures = function() {
    if (isSafari()) {
        $('#tab-general-settings div#keyboardShortcuts').hide();
        $('#tab-general-settings div#autoFillHttpAuth').hide();
    }
};

const getBrowserId = function(userAgent) {
    const browserQueries = [
        { findStr: 'Firefox', name: 'Mozilla Firefox' },
        { findStr: 'Edg', name: 'Microsoft Edge' },
        { findStr: 'OPR', name: 'Opera' },
        { findStr: 'Chrome', name: 'Chrome/Chromium' },
        { findStr: 'Version/', name: 'Safari' }
    ];

    const getVersion = (agent, findStr) => {
        const match = agent?.match(new RegExp(`(?:${findStr})\/([\\d.]+)`));
        return match ? match[1] : 'Unknown version';
    };

    for (const query of browserQueries) {
        if (userAgent?.indexOf(query.findStr) > -1) {
            return `${query.name} ${getVersion(userAgent, query.findStr)}`;
        }
    }

    return 'Other/Unknown';
};

// Update the number of enabled settings to the button text
const updateSettingsButtonText = function(buttonElement, enabledOptions = []) {
    const numberOfEnabledOptions = enabledOptions.filter(o => o === true).length;
    const buttonText = buttonElement.querySelector('span');

    if (numberOfEnabledOptions > 0) {
        buttonText.textContent =
            `${browser.i18n.getMessage('optionsSitePreferencesSettings')} (${numberOfEnabledOptions})`;
    } else {
        buttonText.textContent = browser.i18n.getMessage('optionsSitePreferencesSettings');
    }
};

// Updates settings dropdown menu position
const updateDropdownPosition = function(e, dropdown) {
    if (!dropdown) {
        dropdown = $('.settings-dropdown');
    }

    const settingsButton = e?.target ?? options.dropdownButton;
    const rect = settingsButton?.getClientRects()?.[0];
    if (!rect) {
        return;
    }

    const zoom = getComputedStyle(document.body).zoom || 1;
    const scrollTop = document.defaultView.scrollY / zoom;
    const scrollLeft = document.defaultView?.scrollX / zoom;

    // If dropdown does not fit to the bottom of the screen -> show it at the top of the settings button
    const dropdownRect = dropdown.getBoundingClientRect();
    const totalHeight = dropdownRect.height + rect.height;
    const offset = (totalHeight + rect.y) / zoom > window.self.visualViewport.height ? totalHeight / zoom : 0;

    dropdown.style.left = Pixels(rect.left / zoom + scrollLeft);
    dropdown.style.top = Pixels(rect.bottom / zoom + scrollTop - offset);
};

// Hides the settings dropdown when clicked outside of it
document.addEventListener('mouseup', function(e) {
    if (!e.isTrusted) {
        return;
    }

    const dropdown = $('.settings-dropdown');
    if (dropdown?.style?.display !== 'block') {
        return;
    }

    const rect = dropdown?.getClientRects()?.[0];
    if (!rect) {
        return;
    }

    if ((e.x > rect.right || e.x < rect.x) || (e.y > rect.bottom || e.y < rect.y)
        && e.target.nodeName !== 'BUTTON') {
        dropdown?.hide();
        const checkboxValues = Array.from(dropdown?.querySelectorAll('input[type=checkbox]')).map(c => c.checked);
        updateSettingsButtonText(options.dropdownButton, checkboxValues);
        options.dropdownButton.classList.remove('active');
        options.dropdownButton = null;
    }
});

// Handle dropdown position on window resize
window.addEventListener('resize', function() {
    updateDropdownPosition();
});

// Handle dropdown position on scroll
window.addEventListener('scroll', function() {
    updateDropdownPosition();
});

(async() => {
    try {
        // We eagerly load the theme here to avoid a white flash
        let theme = localStorage.getItem('colorTheme') || 'system';
        if (theme === 'system') {
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-bs-theme', theme);

        const settings = await browser.runtime.sendMessage({ action: 'load_settings' });
        options.settings = settings;

        const keyRing = await browser.runtime.sendMessage({ action: 'load_keyring' });
        options.keyRing = keyRing;
        options.isFirefox = isFirefox();

        options.initMenu();
        await options.initGeneralSettings();
        options.initConnectedDatabases();
        options.initCustomLoginFields();
        options.initSitePreferences();
        options.initAbout();
        options.hideUnsupportedFeatures();

        // The form-switch transitions should complete in 150 ms
        setTimeout(() => {
            document.body.classList.remove('no-transitions');
        }, 200);
    } catch (err) {
        console.log('Error loading options page: ' + err);
    }
})();
