# SecureNode — Dynamic Proxy VPN & Chrome Extension

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite-61dafb.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20Daemon-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

> **SecureNode** is a high-performance, cybernetic-themed VPN Chrome Extension powered by an autonomous background proxy relay daemon. It dynamically harvests, benchmarks, and orchestrates live global SOCKS5 proxies for low-latency, zero-leak anonymous browsing.

---

## 🚀 Key Features

- **⚡ Instant 1-Click Connection:** One-tap connect and disconnect with cybernetic UI animations and live status feedback.
- **🛰️ Automated Proxy Harvester:** Continuously ingests fresh SOCKS5 proxy feeds from multiple global endpoints.
- **🎯 Concurrent Latency Benchmarking:** Multi-threaded TCP handshake and ping validation worker automatically filters out slow or dead nodes.
- **🌍 Multi-Region Geo-Routing:** Filter and select high-speed nodes across the US, Europe, Asia, and global locations with verified exit IPs.
- **🛡️ WebRTC & DNS Leak Prevention:** Enforces strict Chrome privacy network policies (`disable_non_proxied_udp`) to prevent real IP disclosure.
- **🔄 Self-Healing Failover:** Silently switches client traffic to the next healthiest backup node if an active connection drops.
- **⚙️ Local Proxy Fallback:** Includes a standalone local HTTP/HTTPS CONNECT tunnel proxy (`local_proxy.cjs` on port 8888).

---

## 🏗️ System Architecture

```
+-------------------------------------------------------------+
|                      Google Chrome                          |
|  +-------------------------------------------------------+  |
|  |           SecureNode Extension (Manifest V3)          |  |
|  |  - React 19 Cyberpunk Popup UI                        |  |
|  |  - Background Service Worker (chrome.proxy API)       |  |
|  |  - WebRTC IP Leak Shield                              |  |
|  +---------------------------+---------------------------+  |
+------------------------------|------------------------------+
                               | Local REST API (Port 3001)
                               v
+-------------------------------------------------------------+
|                   Backend Daemon (Node.js)                  |
|  +-------------------------------------------------------+  |
|  | Multi-Source SOCKS5 Proxy Harvester                   |  |
|  | Concurrent TCP Ping & GeoIP Validator                 |  |
|  | Self-Healing Health Check & Auto-Failover             |  |
|  +---------------------------+---------------------------+  |
+------------------------------|------------------------------+
                               | SOCKS5 Tunnel
                               v
               [ Verified Global Proxy Nodes ]
```

---

## 📦 Tech Stack

- **Extension Frontend:** React 19, Vite, Lucide Icons, Modern CSS Cybernetic theme
- **Extension Platform:** Chrome Extension Manifest V3 (`chrome.proxy`, `chrome.storage`, `chrome.privacy`)
- **Backend Relay:** Node.js, Express, `socks-proxy-agent`, `geoip-lite`, `node-fetch`
- **Packaging Tools:** `esbuild` for bundling, `pkg` for standalone Windows binaries

---

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher)
- Google Chrome, Brave, Microsoft Edge, or any Chromium-based browser

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/ShehrazKhalid/SecureNode-VPN.git
cd SecureNode-VPN
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Start the Backend Daemon
In your terminal, start the proxy harvester daemon:
```bash
npm run backend
```
> The backend server will start on `http://localhost:3001`, harvest live SOCKS5 proxies, and benchmark their latency.

*(Optional)* For the standalone local HTTP tunnel:
```bash
npm run local-proxy
```

### Step 4: Build the Chrome Extension
Build the production-ready extension package:
```bash
npm run build
```
This generates the optimized `dist/` folder containing the Manifest V3 extension.

### Step 5: Load Extension into Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `dist/` folder located inside the `SecureNode-VPN` project directory.
5. Pin **SecureNode** to your toolbar and click the icon to launch!

---

## 📜 Available NPM Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `vite` | Starts the Vite development server for UI development |
| `npm run build` | `vite build` | Compiles the React UI and extension assets into `dist/` |
| `npm run backend` | `node vpn_backend.cjs` | Runs the Node.js SOCKS5 proxy harvester and API daemon |
| `npm run local-proxy` | `node local_proxy.cjs` | Runs the local HTTP/HTTPS CONNECT proxy on port 8888 |
| `npm run bundle:backend` | `esbuild ...` | Bundles the backend script into a single file with esbuild |
| `npm run build:exe` | `pkg ...` | Packages the backend daemon into a standalone Windows `.exe` |

---

## 🔒 Privacy & Security

SecureNode sets Chrome's WebRTC handling policy to `disable_non_proxied_udp` while connected. This guarantees that your true public IP address is never leaked through STUN/TURN requests while browsing.

---

## 👨‍💻 Author

**Shehraz Khalid**
- GitHub: [@ShehrazKhalid](https://github.com/ShehrazKhalid)
- Portfolio: [Shehraz Khalid Portfolio](https://portfolio-dot-net-alpha.vercel.app/index.html)

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
