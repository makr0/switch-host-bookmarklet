# Switch Host

A [Tampermonkey](https://www.tampermonkey.net/) userscript that switches between old and new host names on the current page — useful when a site moves to a new hostname but you want to stay on the same path.

## How it works

- On trigger, the script looks up the current `window.location.host` in its pair list (`{from, to}`).
  - If found as `from`, it switches to `to`.
  - If found as `to`, it switches back to `from`.
- Unknown hosts: you're prompted for a target host; the answer is remembered and saved.
- Pairs are stored with `GM_setValue`/`GM_getValue`, so they are shared across all pages (unlike `localStorage`, which is scoped per origin) — switching back works automatically without storing duplicate pairs.

## Install

1. [Install Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open the raw script URL in your browser and click **Install**, or paste the file contents into *Tampermonkey → Create new script*.

```
https://raw.githubusercontent.com/makr0/switch-host-bookmarklet/main/switch-host.user.js
```

## Usage

- Right-click on any page → **Tampermonkey** → **Switch host**, or
- keep a bookmarklet with the body: `javascript:switchHost()`

A short overlay shows the target host before the redirect.

## Updates

The script contains an `@updateURL` pointing at this repo, so Tampermonkey checks for updates automatically (default every 10 minutes). To ship changes: bump `@version` in the header and push — no reinstall needed.
