# sysPass-Browser

Browser extension for [sysPass](https://syspass.org/).

Based on the [KeePassXC](https://keepassxc.org/) Team's [KeePassXC-Browser](https://github.com/keepassxreboot/keepassxc-browser) extension.

Itself based on [pfn](https://github.com/pfn)'s [chromeIPass](https://github.com/pfn/passifox).

Some changes merged also from [smorks](https://github.com/smorks)' [KeePassHttp-Connector](https://github.com/smorks/keepasshttp-connector).

## Download and use

This extension has not been published yet, you will need to build it yourself, see "Development and Testing" to build it.

To use it, you will need to create an API key on sysPass:
* Log into sysPass with an account that has the "API Authorizations" permissions
* Select "Users and accesses" in the top right
* Select the "API Authorizations" tab
* Click the "+" Button
  * Create two authorizations per user, one with "Search for Accounts" and another with "View Password" actions.
  * Use the same password for both of the Authorizations.
* Click on the eye next to one of the authorizations of the concerned user to see the API Key.
* Click on the sysPass extension, and, in the popup, click "Settings"
* Go into the "Connected Databases" and
  * Fill sysPass URL with the URL you can use to access the API, for example, "https://syspass.lan/api.php"
  * Fill the API key with the one you copied in the above steps
  * Fill the API key password with the one used in the creation of both authorizations
* Click connect, if there are no issues joining sysPass, the extension should now work.
  

## Requested permissions

KeePassXC-Browser extension requests the following permissions:

| Name  | Reason |
| ----- | ----- |
| `activeTab`               | To get URL of the current tab |
| `contextMenus`            | To show context menu items |
| `clipboardWrite`          | Allows password to be copied from password generator to clipboard |
| `notifications`           | To show browser notifications |
| `storage`                 | For storing extension settings to localStorage |
| `tabs`                    | To request tab URL's and other info |
| `webNavigation`           | To show browser notifications on install or update |
| `webRequest`              | For handling HTTP Basic Auth |
| `webRequestBlocking`      | For handling HTTP Basic Auth |
| `http://*/*`              | To allow using KeePassXC-Browser on all websites |
| `https://*/*`             | To allow using KeePassXC-Browser on all websites |

This last permission will be removed soon.

## Translations

This project is currently only available in English.

## Development and testing

See KeePassXC's [wiki](https://github.com/keepassxreboot/keepassxc-browser/wiki/Loading-the-extension-manually).
Skip the steps about translations.
