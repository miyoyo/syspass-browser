# sysPass Local Test Setup

## Start the containers

```bash
cd docker
docker compose up -d
```

Wait about 30 seconds for sysPass to initialize.

## Configure sysPass

1. Visit https://localhost:9443 in your browser
2. Complete the web installer:
   - **Admin user**: admin
   - **Admin password**: syspass123
   - **Master password**: master123
   - **Database host**: db
   - **Database admin user**: root
   - **Database admin password**: syspass
   - **Database name**: syspass
3. Log in with the admin credentials

## Set up API access

1. Go to **Users & Access > API Authorizations**
2. Click **New** to create an API authorization
3. Fill in:
   - **User**: Select the admin user
   - **Password**: Set a password (e.g. `apipass123`)
   - **Actions**: Enable `account/search`, `account/viewPass`, `account/create`, `account/edit`
4. Save and note the **API token** shown

## Create test accounts

1. Go to **Accounts > New Account**
2. Create a few accounts with recognizable hostnames:
   - Name: "Example Login", URL: `https://example.com`, User: `testuser`, Pass: `testpass123`
   - Name: "GitHub Login", URL: `https://github.com`, User: `dev@example.com`, Pass: `ghpass456`
   - Name: "localhost Test", URL: `http://localhost`, User: `admin`, Pass: `localpass`

## Configure the extension

1. Load the extension unpacked:
   - Chrome: `chrome://extensions` > Developer mode > Load unpacked > select `keepassxc-browser/`
   - Firefox: `about:debugging` > This Firefox > Load Temporary Add-on > select `keepassxc-browser/manifest.json`
2. Open extension options (click gear icon in popup)
3. Go to **Connected Databases** tab (or it opens automatically on first install)
4. Enter:
   - **sysPass API URL**: `https://localhost:9443/api.php`
   - **API Key**: (the token from step 4 above)
   - **API Key Password**: `apipass123`
5. Click **Connect**

## Stop

```bash
docker compose down
```

To remove all data:
```bash
docker compose down -v
```
