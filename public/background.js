chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONNECT') {
    // If the extension provides a specific proxyConfig (e.g. our local Anti-DPI proxy), use it.
    // Otherwise fallback to the actual server details.
    const scheme = message.proxyConfig ? message.proxyConfig.scheme : message.server.scheme;
    const host = message.proxyConfig ? message.proxyConfig.host : message.server.host;
    const port = message.proxyConfig ? message.proxyConfig.port : message.server.port;
    
    var config = {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: scheme,
          host: host,
          port: parseInt(port)
        },
        bypassList: ["localhost", "127.0.0.1"]
      }
    };

    chrome.proxy.settings.set(
      { value: config, scope: 'regular' },
      function() {
        console.log(`Connected to proxy: ${host}:${port}`);
        
        // Prevent IP leaks via WebRTC
        if (chrome.privacy && chrome.privacy.network) {
          chrome.privacy.network.webRTCIPHandlingPolicy.set({
            value: 'disable_non_proxied_udp'
          });
        }
        
        chrome.storage.local.set({ isConnected: true, connectedServer: message.server });
        sendResponse({ success: true });
      }
    );
    
    return true; // Indicates async response
  }
  
  if (message.type === 'FETCH_PROXIES') {
    fetch('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all')
      .then(res => res.text())
      .then(text => sendResponse({ success: true, text }))
      .catch(err => sendResponse({ success: false, error: err.toString() }));
    return true;
  }
  
  if (message.type === 'DISCONNECT') {
    var config = {
      mode: "direct"
    };
    
    chrome.proxy.settings.set(
      { value: config, scope: 'regular' },
      function() {
        console.log('Disconnected from proxy');
        
        // Restore default WebRTC policy
        if (chrome.privacy && chrome.privacy.network) {
          chrome.privacy.network.webRTCIPHandlingPolicy.set({
            value: 'default'
          });
        }
        
        chrome.storage.local.set({ isConnected: false, connectedServer: null });
        sendResponse({ success: true });
      }
    );
    
    return true; // Indicates async response
  }
});

// HEARTBEAT LOGIC: Keep the backend alive and scanning while Chrome is open
const sendHeartbeat = () => {
  fetch('http://127.0.0.1:8888/api/heartbeat', { method: 'POST' }).catch(() => {});
};

// Send immediately on start
sendHeartbeat();

// Periodic alarm for Manifest V3 reliability
if (chrome.alarms) {
  chrome.alarms.create('vpn_heartbeat', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'vpn_heartbeat') {
      sendHeartbeat();
    }
  });
}

// Fallback interval when service worker is awake
setInterval(sendHeartbeat, 30000);


