# CSV File Watcher - Automatic Import

This Node.js script automatically monitors a folder for new CSV files and imports them into Supabase.

## Features

- 🔍 Watches a specified folder for new CSV files
- 📤 Automatically uploads transactions to Supabase
- 🔄 Real-time synchronization with the web app
- 📦 Optional: Move processed files to a separate folder
- 🛡️ Error handling and retry logic
- 📝 Detailed logging

## Setup

### 1. Install Dependencies

```bash
cd file-watcher
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
WATCH_FOLDER=/path/to/csv/folder
```

**Important:**
- Use the `service_role` key (NOT the `anon` key)
- Find it in Supabase Dashboard → Settings → API → `service_role` (click "Reveal")
- ⚠️ Keep this key secret! It has admin privileges

### 3. Set Watch Folder

The `WATCH_FOLDER` should be an absolute path to the folder where CSV files will appear.

Examples:
- `/Users/yourname/Downloads/CSV`
- `/Users/yourname/Dropbox/Finanse/CSV`
- `/Users/yourname/Google Drive/CSV`

**Tip:** If using a cloud sync folder (Dropbox, Google Drive), the watcher will automatically detect new files when they sync.

## Usage

### Start the Watcher

```bash
npm start
```

or

```bash
node watcher.js
```

You should see:
```
🚀 CSV File Watcher Started
📁 Watching folder: /path/to/folder
🔗 Connected to Supabase: https://...
⏳ Waiting for CSV files...
```

### Test It

1. Copy a CSV file to the watched folder
2. The watcher will detect it and process it automatically
3. Check the console for progress
4. Check your web app - transactions should appear automatically!

### Stop the Watcher

Press `Ctrl+C` to stop the watcher gracefully.

## Running as a Background Service (Optional)

### macOS (launchd)

Create a launch agent to run the watcher automatically on startup:

1. Create a plist file:

```bash
nano ~/Library/LaunchAgents/com.finance.csvwatcher.plist
```

2. Paste this content (adjust paths):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.finance.csvwatcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/yourname/Desktop/Finanse firma APP/file-watcher/watcher.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/csvwatcher.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/csvwatcher.error.log</string>
</dict>
</plist>
```

3. Load the service:

```bash
launchctl load ~/Library/LaunchAgents/com.finance.csvwatcher.plist
```

4. Check if it's running:

```bash
launchctl list | grep csvwatcher
```

5. View logs:

```bash
tail -f /tmp/csvwatcher.log
```

## Troubleshooting

### "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"
- Make sure `.env` file exists in the `file-watcher` folder
- Check that values are filled in correctly
- No quotes needed around values in `.env`

### "Watch folder does not exist"
- Make sure the path is absolute (starts with `/`)
- Check that the folder exists
- On macOS, you can drag a folder to Terminal to get its full path

### Files not being detected
- Check that files have `.csv` extension (lowercase)
- Make sure the watcher is running
- Check console for errors
- Try copying a file manually to test

### Supabase errors
- Verify your `service_role` key is correct
- Check that the database schema is set up (run `supabase-schema.sql`)
- Check Supabase Dashboard → Table Editor to see if data is being inserted

## CSV Format

The watcher expects CSV files with this format:

```
Date,Amount,Currency,Sender,Title
2024-01-15,1500.00,PLN,Jan Kowalski,Obóz letni
2024-01-16,-250.50,EUR,Sklep ABC,Zakup sprzętu
```

- **Date**: DD-MM-YYYY, DD.MM.YYYY, or YYYY-MM-DD
- **Amount**: Positive for income, negative for expenses
- **Currency**: PLN or EUR
- **Sender**: Name of sender/recipient
- **Title**: Transaction description

## Security Notes

⚠️ **Important:**
- Never commit `.env` file to git
- Never share your `service_role` key
- The `service_role` key has full admin access to your database
- If compromised, reset it immediately in Supabase Dashboard

## Support

If you encounter issues:
1. Check the console output for error messages
2. Verify your `.env` configuration
3. Check Supabase Dashboard for database errors
4. Review the logs if running as a service
