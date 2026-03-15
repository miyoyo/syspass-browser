'use strict';

try {
    importScripts(
        '../common/browser-polyfill.min.js',
        '../common/global.js',
        '../common/sites.js',
        'syspass-client.js',
        'syspass-crypto.js',
        'keepass.js',
        'httpauth.js',
        'offscreen.js',
        'browserAction.js',
        'page.js',
        'event.js',
        'init.js'
    );
} catch (e) {
    console.log('Cannot import background scripts: ', e);
}
