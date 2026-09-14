const express = require('express');
const cors = require('cors');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { SocksClient } = require('socks');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

// Override console to prevent EBADF crash when running in hidden Window
const logFile = path.join(process.cwd(), 'backend_node.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
function safeLog(...args) {
  try {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
  } catch(e) {}
}
console.log = safeLog;
console.error = safeLog;

// Use process.cwd() to support writing outside the pkg snapshot
const PROXIES_FILE = path.join(process.cwd(), 'proxies.json');

let workingProxies = [];
let isTesting = false;
let activeUpstreamProxy = null;
let autoScanEnabled = true;
let lastHeartbeat = Date.now();

// Load saved proxies on startup
try {
  if (fs.existsSync(PROXIES_FILE)) {
    const data = fs.readFileSync(PROXIES_FILE, 'utf8');
    workingProxies = JSON.parse(data);
    console.log(`Loaded ${workingProxies.length} saved proxies from file.`);
  }
} catch (err) {
  console.error('Error loading proxies:', err);
}

function saveProxies() {
  try {
    fs.writeFileSync(PROXIES_FILE, JSON.stringify(workingProxies, null, 2));
  } catch (err) {
    console.error('Error saving proxies:', err);
  }
}
// Fetch static proxies from Multiple APIs
async function fetchGeoNodeProxies() {
  try {
    const urls = [
      'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=5000&country=all&ssl=all&anonymity=all',
      'https://proxylist.geonode.com/api/proxy-list?limit=200&page=1&sort_by=lastChecked&sort_type=desc&protocols=socks5',
      'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt'
    ];
    
    let allRaw = new Set();
    
    const results = await Promise.allSettled(urls.map(url => fetch(url).then(r => r.text())));
    
    results.forEach(res => {
      if (res.status === 'fulfilled' && res.value) {
        try {
          const data = JSON.parse(res.value);
          if (data && data.data) {
            data.data.forEach(p => allRaw.add(`${p.ip}:${p.port}`));
          }
        } catch(e) {
          const lines = res.value.split('\n');
          lines.forEach(line => {
            const match = line.match(/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+)/);
            if (match) allRaw.add(match[1]);
          });
        }
      }
    });
    
    return Array.from(allRaw);
  } catch (err) {
    console.error('Failed to fetch proxies:', err);
    return [];
  }
}

// Test a single proxy
async function testProxy(proxyStr) {
  try {
    const startTime = Date.now();
    const [host, port] = proxyStr.split(':');
    const agent = new SocksProxyAgent(`socks5://${host}:${port}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 3500);
    
    // Test basic connectivity and IP
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json', { agent, signal: controller.signal });
    clearTimeout(timeout);
    
    if (res.ok) {
      const data = await res.json();
      const actualPing = Date.now() - startTime;
      
        return {
        proxy: proxyStr,
        ping: actualPing,
        country: data.country || 'Global',
        city: data.city || 'Unknown',
        exitIP: data.ip,
        testedAt: Date.now()
      };
    } else {
      console.log(`[DEBUG] Proxy ${proxyStr} failed geojs.io with status: ${res.status}`);
    }
  } catch (error) {
    console.log(`[DEBUG] Proxy ${proxyStr} fetch threw: ${error.message}`);
    return null;
  }
  return null;
}

// Background worker
async function refreshProxies(force = false) {
  if (isTesting) return;

  // Lifecycle check: only pause if we have enough working proxies AND no heartbeat for 30 minutes
  if (!force && workingProxies.length >= 20 && (Date.now() - lastHeartbeat > 30 * 60 * 1000)) {
    console.log(`[${new Date().toLocaleTimeString()}] Extension inactive (no heartbeat in 30m). Pausing auto-scan.`);
    return;
  }

  // Toggle check
  if (!autoScanEnabled && !force) {
    return;
  }

  isTesting = true;
  console.log(`[${new Date().toLocaleTimeString()}] Fetching new static SOCKS5 proxies... (force=${force})`);
  const rawProxies = await fetchGeoNodeProxies();
  // Shuffle and pick 150 proxies to avoid socket exhaustion and rate limits
  const shuffled = rawProxies.sort(() => 0.5 - Math.random());
  const selectedProxies = shuffled.slice(0, 150);
  
  console.log(`Found ${rawProxies.length} raw SOCKS5 proxies. Testing ${selectedProxies.length} randomly selected...`);
  
  const results = await Promise.all(selectedProxies.map(p => testProxy(p)));
  const valid = results.filter(r => r !== null);
  
  const now = Date.now();
  const proxyMap = new Map();
  
  // Retain existing proxies that are fresh (tested within last 2 hours)
  workingProxies.forEach(p => {
    if (p.testedAt && (now - p.testedAt < 2 * 60 * 60 * 1000)) {
      proxyMap.set(p.proxy, p);
    }
  });
  
  // Add new verified working proxies
  valid.forEach(p => proxyMap.set(p.proxy, p));
  
  // Sort by lowest latency and keep top 40
  workingProxies = Array.from(proxyMap.values())
    .sort((a, b) => a.ping - b.ping)
    .slice(0, 40);
    
  saveProxies();
  console.log(`✅ Found ${valid.length} new working proxies! Total fresh active: ${workingProxies.length}`);
  
  isTesting = false;
}

// API Endpoints
app.get('/api/proxies', (req, res) => {
  lastHeartbeat = Date.now();
  // If we have few proxies, automatically trigger fresh scan in background
  if (workingProxies.length < 15 && !isTesting) {
    setTimeout(() => refreshProxies(true), 200);
  }
  res.json({ success: true, count: workingProxies.length, proxies: workingProxies });
});

app.post('/api/set-proxy', (req, res) => {
  lastHeartbeat = Date.now();
  const { host, port } = req.body;
  if (host && port) {
    activeUpstreamProxy = { host, port: parseInt(port) };
    console.log(`[ANTI-DPI] Active upstream proxy set to: ${host}:${port}`);
    res.json({ success: true });
  } else {
    res.json({ success: false, error: "Missing host or port" });
  }
});

// Settings & Lifecycle API
app.post('/api/heartbeat', (req, res) => {
  lastHeartbeat = Date.now();
  res.json({ success: true });
});

app.get('/api/settings', (req, res) => {
  res.json({ autoScanEnabled });
});

app.post('/api/settings', (req, res) => {
  if (req.body.autoScanEnabled !== undefined) {
    autoScanEnabled = !!req.body.autoScanEnabled;
    console.log(`Auto-Scan turned ${autoScanEnabled ? 'ON' : 'OFF'}`);
  }
  res.json({ success: true });
});

app.post('/api/revalidate', async (req, res) => {
  lastHeartbeat = Date.now();
  if (isTesting) {
    return res.json({ success: false, error: 'Scanning in progress' });
  }
  isTesting = true;
  console.log(`Re-validating ${workingProxies.length} saved proxies...`);
  const results = await Promise.all(workingProxies.map(p => testProxy(p.proxy)));
  const valid = results.filter(r => r !== null).sort((a, b) => a.ping - b.ping);
  
  workingProxies = valid;
  saveProxies();
  console.log(`Re-validation complete. ${valid.length} proxies are still alive.`);
  isTesting = false;
  
  // Immediately trigger fresh scan to replenish proxies
  setTimeout(() => refreshProxies(true), 500);
  
  res.json({ success: true, count: workingProxies.length, proxies: workingProxies });
});

// Start Management API
app.listen(8888, () => {
  console.log('\n=================================================');
  console.log('✅ Smart Proxy Server running on port 8888!');
  console.log('API Endpoint: http://127.0.0.1:8888/api/proxies');
  console.log('=================================================');
  
  // Initial immediate run on startup
  setTimeout(() => refreshProxies(true), 1500);
  setInterval(() => refreshProxies(false), 3 * 60 * 1000);
});

// ==========================================
// LOCAL ANTI-DPI PROXY SERVER (Port 8889)
// ==========================================
const dpiProxy = http.createServer();

process.on('uncaughtException', (err) => {
  console.log('[Global Uncaught Exception]', err.message);
});
process.on('unhandledRejection', (err) => {
  console.log('[Global Unhandled Rejection]', err);
});

dpiProxy.on('connect', async (req, clientSocket, head) => {
  clientSocket.on('error', () => { /* ignore */ });
  if (!activeUpstreamProxy) {
    if (!clientSocket.destroyed) {
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.end();
    }
    return;
  }

  const { port, hostname } = new URL(`http://${req.url}`);

  try {
    const info = await SocksClient.createConnection({
      proxy: { host: activeUpstreamProxy.host, port: activeUpstreamProxy.port, type: 5 },
      command: 'connect',
      destination: { host: hostname, port: parseInt(port) },
      timeout: 15000
    });

    const upstreamSocket = info.socket;
    upstreamSocket.setNoDelay(true);
    clientSocket.setNoDelay(true);

    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    
    let isFirstPacket = true;
    
    const handleChunk = (chunk) => {
      // ANTI-DPI FRAGMENTATION for HTTPS Traffic
      if (isFirstPacket && parseInt(port) === 443 && chunk.length > 5) {
        isFirstPacket = false;
        upstreamSocket.write(chunk.slice(0, 5)); // Send TLS Record Header
        
        setTimeout(() => {
          if (!upstreamSocket.destroyed) upstreamSocket.write(chunk.slice(5)); // Send SNI separately
        }, 50);
      } else {
        if (!upstreamSocket.destroyed) upstreamSocket.write(chunk);
      }
    };
    
    if (head && head.length > 0) handleChunk(head);
    
    clientSocket.on('data', handleChunk);

    upstreamSocket.on('data', chunk => clientSocket.write(chunk));
    
    clientSocket.on('error', () => { if (!upstreamSocket.destroyed) upstreamSocket.destroy(); });
    upstreamSocket.on('error', () => { if (!clientSocket.destroyed) clientSocket.destroy(); });
    clientSocket.on('close', () => { if (!upstreamSocket.destroyed) upstreamSocket.destroy(); });
    upstreamSocket.on('close', () => { if (!clientSocket.destroyed) clientSocket.destroy(); });

  } catch (err) {
    console.log(`[PROXY FAIL] Upstream ${activeUpstreamProxy ? activeUpstreamProxy.host + ':' + activeUpstreamProxy.port : 'none'} for ${hostname}:${port} failed: ${err.message}`);
    if (!clientSocket.destroyed) {
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.end();
    }
  }
});

// Handle plain HTTP traffic through proxy
dpiProxy.on('request', async (req, res) => {
  req.on('error', () => {});
  res.on('error', () => {});
  if (!activeUpstreamProxy) {
    if (!res.headersSent) res.writeHead(502);
    return res.end();
  }
  
  const { pathname, search, hostname, port } = new URL(req.url);
  try {
    const info = await SocksClient.createConnection({
      proxy: { host: activeUpstreamProxy.host, port: activeUpstreamProxy.port, type: 5 },
      command: 'connect',
      destination: { host: hostname, port: parseInt(port || 80) },
      timeout: 15000
    });

    const upstreamSocket = info.socket;
    const path = (pathname || '/') + (search || '');
    
    // Reconstruct headers with Anti-DPI Fragmentation for HTTP
    let methodLine = `${req.method} ${path} HTTP/${req.httpVersion}\r\n`;
    let restHeaders = '';
    
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (req.rawHeaders[i].toLowerCase() !== 'host') {
        restHeaders += `${req.rawHeaders[i]}: ${req.rawHeaders[i+1]}\r\n`;
      }
    }
    restHeaders += '\r\n';
    
    upstreamSocket.setNoDelay(true);
    
    // Fragment the Host header to bypass DPI matching "Host: example.com"
    upstreamSocket.write(methodLine + "Ho");
    setTimeout(() => {
      if (!upstreamSocket.destroyed) {
        upstreamSocket.write("st: " + hostname + "\r\n" + restHeaders);
      }
    }, 50);
    
    req.pipe(upstreamSocket);
    upstreamSocket.pipe(res.socket);
  } catch (err) {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  }
});

dpiProxy.listen(8889, () => {
  console.log('✅ Local Anti-DPI Proxy Server running on port 8889!');
});
