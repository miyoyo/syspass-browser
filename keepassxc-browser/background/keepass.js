const keepass = {
    isKeePassXCAvailable: false,

    keyRing: {
        //Example:
        //"apikey-here-0000-0000-000000000000": {
        //    "id":"syspass-01.abc",
        //    "key":"password",
        //    "hash": "apikey-here-0000-0000-000000000000",
        //    "created": 1234,
        //    "lastUsed": 2345
        //}
    },

    get address() {
        return keepass.keyRing[Object.keys(keepass.keyRing)[0]].id;
    },

    get apiKey() {
        return keepass.keyRing[Object.keys(keepass.keyRing)[0]].hash;
    },

    get apiPass() {
        return keepass.keyRing[Object.keys(keepass.keyRing)[0]].key;
    },

    get databaseHash() {
        return keepass.apiKey;
    },

    associated: {
        get hash() {
            return Object.keys(keepass.keyRing).length > 0 ? Object.keys(keepass.keyRing)[0] : ""
        },
    
        get databaseHash() {
            return Object.keys(keepass.keyRing).length > 0 ? Object.keys(keepass.keyRing)[0] : ""
        },
    }
}

browser.storage.local.get('keyRing').then((item) => {
    if("keyRing" in item)
        keepass.keyRing = item.keyRing;
    else
        browser.storage.local.set({'keyRing': {}})
});

// Show a dialog that requests website details
keepass.associate = async function () {
}

// Contact the database and grab it's hash
keepass.checkDatabaseHash = async function () { }

// Contact the database and grab it's hash
keepass.getDatabaseHash = async function () { }

keepass.getIsKeePassXCAvailable = async function () { 
    return keepass.isKeePassXCAvailable;
}

// The database has been contacted successfully previously
keepass.isAssociated = function () {
    if (!keepass.isConfigured()) {
        return false;
    }

    return keepass.isKeePassXCAvailable;
}

// A database hash is known, and is in the keyring
keepass.isConfigured = async function () {
    return Object.keys(keepass.keyRing).length > 0;
}

// Ask the database for credentials based on some kind of request
keepass.retrieveCredentials = async function (tab, args = []) {
    try {
        const [ url, submiturl, triggerUnlock = false, httpAuth = false ] = args;
        let target = new URL(url);
        
        let accountListPromise = await fetch(keepass.address, {
            method: "POST",
            body: JSON.stringify({
                "jsonrpc": "2.0",
                "method": "account/search",
                "params": {
                    "authToken": keepass.apiKey,
                    "text": target.hostname,
                },
                "id": 1
            })
        });

        let accountList = await accountListPromise.json();

        let accountListWithPass = await Promise.all(
            accountList.result.result.map(async (account)=>{
                let passwordPromise = await fetch(keepass.address, {
                    method: "POST",
                    body: JSON.stringify({
                        "jsonrpc": "2.0",
                        "method": "account/viewPass",
                        "params": {
                            "authToken": keepass.apiKey,
                            "tokenPass": keepass.apiPass,
                            "id": account.id
                        },
                        "id": 1
                    })
                });

                let password = await passwordPromise.json();

                account['password'] = password.result.result.password;

                return {
                    "group": "",
                    "login": account.login,
                    "name": account.name,
                    "password": account.password,
                    "uuid": account.id,
                    "stringFields": []
                }
            })
        )

        return accountListWithPass;

    } catch (err) {
        console.log('retrieveCredentials failed: ', err);
        return [];
    }
}

// Check if the association with the database is valid
keepass.testAssociation = async function (tab) {
    page.tabs[tab.id].errorMessage = null;

    if (!keepass.isConfigured()) {
        page.tabs[tab.id].errorMessage = "No Configuration Found."
        return false;
    }

    try {
        let accountListPromise = await fetch(keepass.address || undefined, {
            method: "POST",
            body: JSON.stringify({
                "jsonrpc": "2.0",
                "method": "account/search",
                "params": {
                    "authToken": keepass.apiKey,
                    "tokenPass": keepass.apiPass,
                    "id": 170000,
                },
                "id": 1
            })
        });

        let body = await accountListPromise.json()

        if("error" in body) {
            throw "Failed to verify API Key."
        }

        if(body["result"]["result"].length === 0) {
            throw "No accounts available to test API key Password.<br>Please create at least 1 Account."
        }

        let showPassPromise = await fetch(keepass.address || undefined, {
            method: "POST",
            body: JSON.stringify({
                "jsonrpc": "2.0",
                "method": "account/viewPass",
                "params": {
                    "authToken": keepass.apiKey,
                    "tokenPass": keepass.apiPass,
                    "id": body["result"]["result"][0]["id"],
                },
                "id": 1
            })
        });

        let passBody = await showPassPromise.json()

        if("error" in passBody) {
            throw "Failed to verify API Key Password."
        }

        keepass.isKeePassXCAvailable = showPassPromise.ok;

        return keepass.isKeePassXCAvailable;
    } catch (err) {
        keepass.isKeePassXCAvailable = false;

        if(tab !== undefined){
            page.tabs[tab.id].errorMessage = "Unable to contact sysPass, check configuration (Settings -> Connected Databases).";

            if(typeof err === 'string') {
                page.tabs[tab.id].errorMessage += "<br>"+err;
            }
        }        
        console.log(err)
        return false;
    }
}

// To do, stub for now

keepass.addCredentials = async function () { }

keepass.createNewGroup = async function () { }

keepass.getDatabaseGroups = async function () { }

keepass.updateCredentials = async function () { }

// Partial Stub

keepass.generatePassword = async function () {
    const length = 32
    var uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var lowercase = 'abcdefghijklmnopqrstuvwxyz';
    var numbers = '0123456789';
    var symbols = '!$&*=?_';
    var all = uppercase + lowercase + numbers + symbols;
    var password = '';
    for (var index = 0; index < length; index++) {
        var character = Math.floor(Math.random() * all.length);
        password += all.substring(character, character + 1);
    }
    return [{
        "password": password,
        "login": 0,
        "entropy": 0
    }];
}

// Full stub, not to be implemented

keepass.currentKeePassXC = "Not Applicable";

keepass.isDatabaseClosed = false;

keepass.isEncryptionKeyUnrecognized = false;

keepass.latestKeePassXC = { "version": "Not Applicable" };

keepass.checkForNewKeePassXCVersion = async function () { }

keepass.disableAutomaticReconnect = async function () { }

keepass.enableAutomaticReconnect = async function () { }

keepass.getTotp = async function () { }

keepass.keePassXCUpdateAvailable = async function () {
    return false;
}

keepass.lockDatabase = async function () { }

keepass.migrateKeyRing = async function () { }

keepass.reconnect = async function () { }

keepass.updateDatabase = async function () { }
