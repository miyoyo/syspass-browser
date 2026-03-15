# Extension Review Instructions

## Overview

sysPass-Browser is a browser extension that integrates with sysPass (https://www.syspass.org/), a self-hosted password manager. It fills login credentials from a user's own sysPass server.

This extension is an adaptation of the open-source keepassxc-browser project, modified to work with sysPass instead of KeePassXC.

## Test Environment Setup

**All testing should be done in a sandboxed browser profile or a virtual machine.**

### Prerequisites

- Docker or Podman installed
- The extension loaded (unpacked or from the .zip)

### Step 1: Start the test sysPass server

```bash
# Clone the repository
git clone https://github.com/miyoyo/syspass-browser.git
cd syspass-browser

# Run the setup script
./test-setup.sh
```

This starts a local sysPass instance at https://localhost:9443 with a self-signed certificate.

### Step 2: Configure sysPass (first time only)

1. Visit **https://localhost:9443** and accept the certificate warning
2. Complete the web installer with these values:
   - Admin user: `admin`
   - Admin password: `syspass12345`
   - Master password: `master12345`
   - Database host: `db`
   - Database admin user: `root`
   - Database admin password: `syspass`
   - Database name: `syspass`
3. Log in with `admin` / `syspass12345`
4. Navigate to **Users & Access > API Authorizations**
5. Click **New** to create an API authorization:
   - User: admin
   - Password: `apipass12345`
   - Enable actions: `account/search`, `account/viewPass`, `account/create`, `account/editPass`
6. Save and **copy the API token** shown

### Step 3: Create test accounts in sysPass

1. Go to **Accounts > New Account**
2. Create the following accounts:
   - **Name**: Example Login, **URL**: `https://example.com`, **User**: `testuser`, **Password**: `testpass123`, **Client**: Test, **Category**: Web
   - **Name**: GitHub Login, **URL**: `https://github.com`, **User**: `dev@example.com`, **Password**: `ghpass456`, **Client**: Test, **Category**: Web

### Step 4: Configure the extension

1. Click the sysPass-Browser icon in the toolbar, then the gear icon to open Settings
2. Go to the **Connected Databases** tab
3. Enter:
   - **sysPass API URL**: `https://localhost:9443/api.php`
   - **API Key**: (the token copied in step 2.6)
   - **API Key Password**: `apipass12345`
4. Click **Connect**
5. The status should change to "Connected"

## Testing Features

### Feature 1: Auto-fill credentials

1. Navigate to **https://example.com** (or any site with a login form)
2. The sysPass-Browser icon should appear in the username field
3. Click the icon to see matching credentials in a dropdown
4. Select an entry to fill in the username and password

### Feature 2: Save new credentials

1. Navigate to any website with a login form
2. Enter a username and password manually
3. Submit the form
4. A banner should appear at the top asking to save the credentials
5. Click **New** to save them to sysPass
6. While saving, a spinner should appear on the button

### Feature 3: Password generator

1. Navigate to any website with a password field
2. Click the key icon that appears in the password field
3. A password generator popup should appear
4. Click "Generate" and then "Fill" to use the generated password

### Feature 4: Passkey protection (lock/unlock)

1. Open the extension Settings > Connected Databases
2. Scroll to "Passkey Protection"
3. Set lock mode to "Timed" with a 1-minute timeout
4. Click "Set Up Passkey Protection" and complete the WebAuthn prompt
5. After 1 minute, the vault should lock automatically
6. The extension popup should show "Vault is locked" with an Unlock button
7. Clicking Unlock opens a dedicated page for WebAuthn authentication
8. Clicking the locked padlock icon in a credential field also opens the unlock page

### Feature 5: Keyboard shortcuts

- **Alt+Shift+U** (Ctrl+Shift+U on Mac): Fill username and password
- **Alt+Shift+P** (Ctrl+Shift+P on Mac): Fill password only
- **Alt+Shift+G** (Ctrl+Shift+G on Mac): Open password generator

## Stopping the Test Environment

```bash
cd docker
docker compose down      # Stop containers
docker compose down -v   # Stop and remove all data
```

## Credentials Summary

| Service          | Username          | Password       |
|------------------|-------------------|----------------|
| sysPass Admin    | admin             | syspass12345   |
| sysPass Master   | (master password) | master12345    |
| Database Root    | root              | syspass        |
| API Password     | (API auth)        | apipass12345   |
| Test Account 1   | testuser          | testpass123    |
| Test Account 2   | dev@example.com   | ghpass456      |

## Permission Justifications

### activeTab
Used to detect login forms on the currently active tab and fill credentials into them. The extension only accesses the active tab when the user explicitly interacts with it (clicking the icon, using keyboard shortcuts, or when auto-fill is enabled).
