<p align="center">
  <img src="icons/icon128.png" width="80" alt="Auto Trigger" />
</p>

<h1 align="center">Auto Trigger</h1>

<p align="center">
  Record clicks once. Replay them forever.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com"><img src="https://img.shields.io/badge/Chrome%20Web%20Store-available-brightgreen?logo=googlechrome" alt="Chrome Web Store" /></a>
  <img src="https://img.shields.io/badge/manifest-v3-orange" alt="Manifest V3" />
</p>

---

Repetitive clicking is wasted time. Auto Trigger records any sequence of clicks on any website and replays it on demand — or automatically when a video ends.

---

## Features

| | |
|---|---|
| **Macro** | Repeat your recorded pattern N times with a configurable delay |
| **Auto Trigger** | Fires your pattern automatically when a video ends |
| **YouTube support** | Works on YouTube, Shorts, and most HTML5 video sites — not livestreams |
| **Sound alert** | Audio notification when a task completes, with volume control |
| **Trusted clicks** | Uses Chrome DevTools Protocol to simulate real mouse input (`isTrusted: true`) |
| **Auto reset** | Automatically resets if the page reloads or URL changes during recording |

---

## How it works

### 1. Record a pattern
Click **Record**, then click any elements on the page you want to automate. Click **Stop** when done. Use **Resume** to add more clicks.

### 2. Replay with Macro
Set a repeat count and delay, then click **Replay Pattern**. Your recorded sequence runs N times with the configured gap between each repeat.

### 3. Auto Trigger (video detection)
Click **Start Auto Trigger**. The extension watches the current tab for a video to end, then automatically fires your recorded pattern. Works on YouTube, YouTube Shorts, and most HTML5 video sites. Does **not** work on livestreams or Flash-based players.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Platform | Chrome Extension Manifest V3 |
| UI | Vanilla JS + CSS (no framework, no build step) |
| Click detection | Content script + `MutationObserver` |
| Click replay | Chrome DevTools Protocol (`Input.dispatchMouseEvent`) |
| Video detection | `ended` event + `timeupdate` fallback for YouTube |
| Sound | Web Audio API (`AudioContext`) |
| Storage | In-memory (session only) |

---

## Privacy

No data is collected, stored, or transmitted. Recorded patterns live in memory only and are cleared when the extension closes.
