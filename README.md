# Sort X

Sort any X (Twitter) profile's **Followers** or **Following** list by follower count **for free**, right in your browser.

> **Note:** It costs $5 (one-time) to publish on the Chrome Web Store and $100/year for Safari. Until then, please install manually using the instructions below.

---

## Install (Chrome / Edge / Brave / any Chromium browser)

1. Download the latest `sort-x-chromium-vX.X.X.zip` from [Releases](../../releases)
2. Unzip it anywhere
3. Go to `chrome://extensions` (or `edge://extensions`)
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select the unzipped folder

---

## How to use

1. Go to any X profile's **Followers** or **Following** page
2. Click the **⬇** button to auto-scroll and load all users
3. Click **Sort** to open the ranked list sorted by follower count

---

## Project structure

```
sort-x/
├── src/                    # Shared source (all browsers)
│   ├── content.js          # UI + sort panel (isolated world)
│   ├── inject.js           # Fetch/XHR interceptor (main world)
│   ├── styles.css
│   ├── popup.html
│   ├── popup.css
│   └── icons/
├── browsers/
│   └── chromium/
│       └── manifest.json   # Manifest V3 - Chromium-specific
├── dist/                   # Built output (gitignored)
│   └── chromium/           # Load this folder as an "unpacked extension"
├── build.js                # Build script (no dependencies)
├── package.json
└── .github/
    └── workflows/
        └── release.yml     # Auto-release on git tag push
```

## Development

```bash
# Build all targets
node build.js

# Build chromium only
node build.js --target chromium
```

Then load `dist/chromium/` as an unpacked extension.

## Releasing

Push a version tag to trigger a GitHub Release with all browser zips attached:

```bash
git tag v1.0.5
git push origin v1.0.5
```

The workflow builds, zips, and publishes automatically.
