# DevPocket · Developer Toolbox

[简体中文](README.md) · [User guide](docs/user-guide.en.md) · [Product introduction](docs/product-introduction.en.md) · [Screenshots](docs/screenshots/README.md)

**Frontend debugging, in your pocket.**

Edit a request header. Swap a live JavaScript resource for your local build. Mock an API response or find the difference between two JSON payloads. DevPocket brings 17 everyday frontend tools into a compact workspace in your browser toolbar.

Headers, resource proxying, request blocking, API Mock, and manual API requests cover request debugging. JSON structure comparison, text Diff, regex, URL parameters, JWT decoding, timestamps, codecs, colors, and hashing handle data inspection. Site storage, cache cleanup, and page debugging let you work on the current page.

Rule changes save automatically. Each rule has an independent switch and settings dialog. Import/export module configurations, search all tools, and reorder all 17. The first four become toolbar shortcuts; moving tools preserves their configurations and drafts.

![DevPocket workspace](docs/screenshots/guide-headers.png)

![JSON structure comparison](docs/screenshots/guide-json-compare.png)

## Build and install

```bash
npm install
npm run build
```

Dependencies are installed from the public npm registry configured in `.npmrc`.

1. Open your browser's extensions page.
2. Enable Developer mode and select Load unpacked.
3. Choose `dist`, then pin DevPocket to the toolbar.

For packaged builds, unzip the archive and load the enclosed `dist` folder. After code changes, rebuild and reload the extension in its manager.

## Development and validation

```bash
npm run dev
npm run check
npm run package
```

Open `http://127.0.0.1:5173/popup.html` for the current popup preview. Preview drafts are isolated from extension data; a fresh extension installation has no rules. The macOS package script outputs `artifacts/devpocket-0.1.0.zip` for local unpacked installation.

React 19, Vite 6, TypeScript, lucide-react, local CSS, Manifest V3, dynamic request rules, and local extension storage. No remote scripts or fonts are required.

## Documentation and release status

The [English user guide](docs/user-guide.en.md) covers all 17 tools, setup, backups, and troubleshooting. The interface is currently Chinese; the guide supplies matching Chinese control labels. Documentation screenshots use demonstration data in a web preview and are not native MV3 network validation.

Third-party notices ship in `dist/THIRD_PARTY_NOTICES.txt`. Before distribution, resolve the [release review findings](docs/store-readiness-review.md), including cross-site Mock configuration delivery, privacy disclosures, permissions, and native browser validation. No store publication has been performed.
