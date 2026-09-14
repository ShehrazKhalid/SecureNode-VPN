import React, { useState, useEffect, useMemo } from 'react';
import { Power, Shield, ShieldCheck, ShieldAlert, RefreshCw, Globe, MapPin, Settings2 } from 'lucide-react';
import './index.css';

const FALLBACK_SERVERS = [
  { id: 'tested-1', name: 'Global Backup Node', scheme: 'socks5', host: '8.221.138.111', port: 18080, country: 'Global', city: 'Unknown' },
];

function App() {
  const [status, setStatus] = useState('disconnected');
  const [servers, setServers] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('Global');
  const [selectedServerId, setSelectedServerId] = useState('');
  const [currentIP, setCurrentIP] = useState('127.0.0.1');
  const [loadingServers, setLoadingServers] = useState(true);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);

  const groupedServers = useMemo(() => {
    const groups = {};
    servers.forEach(server => {
      const country = server.country || 'Unknown';
      if (!groups[country]) {
        groups[country] = { servers: [], fastestPing: server.ping || 9999 };
      }
      groups[country].servers.push(server);
      if (server.ping && server.ping < groups[country].fastestPing) {
        groups[country].fastestPing = server.ping;
      }
    });
    return groups;
  }, [servers]);

  const countries = Object.keys(groupedServers).sort();

  const handleProxyData = (data) => {
    if (data && data.success && data.proxies && data.proxies.length > 0) {
      const newServers = data.proxies.map((p, index) => {
        const [host, port] = p.proxy.split(':');
        return {
          id: `smart-${index}`,
          name: `${p.city} Node`,
          scheme: 'socks5',
          host: host,
          port: parseInt(port),
          country: p.country,
          city: p.city,
          ping: p.ping,
          exitIP: p.exitIP
        };
      });

      setServers(newServers);
      
      const availableCountries = [...new Set(newServers.map(s => s.country))].sort();
      const defaultCountry = availableCountries.includes('US') ? 'US' : availableCountries[0];
      const firstServer = newServers.find(s => s.country === defaultCountry);

      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['isConnected', 'connectedServer'], (result) => {
          if (result.isConnected && result.connectedServer) {
            setSelectedCountry(result.connectedServer.country);
            setSelectedServerId(result.connectedServer.id);
          } else {
            setSelectedCountry(defaultCountry);
            setSelectedServerId(firstServer ? firstServer.id : newServers[0].id);
          }
        });
      } else {
        setSelectedCountry(defaultCountry);
        setSelectedServerId(firstServer ? firstServer.id : newServers[0].id);
      }
    } else {
      setServers(FALLBACK_SERVERS);
      setSelectedCountry('Global');
      setSelectedServerId(FALLBACK_SERVERS[0].id);
    }
  };

  const fetchProxies = async () => {
    setLoadingServers(true);
    try {
      const response = await fetch('http://127.0.0.1:8888/api/proxies');
      const data = await response.json();
      handleProxyData(data);
    } catch (error) {
      console.error('Failed to reach local smart backend:', error);
      setServers(FALLBACK_SERVERS);
    }
    setLoadingServers(false);
  };

  const revalidateProxies = async () => {
    setLoadingServers(true);
    try {
      const response = await fetch('http://127.0.0.1:8888/api/revalidate', { method: 'POST' });
      const data = await response.json();
      handleProxyData(data);
    } catch (error) {
      console.error('Failed to revalidate:', error);
    }
    setLoadingServers(false);
  };

  const toggleAutoScan = async () => {
    const newVal = !autoScanEnabled;
    setAutoScanEnabled(newVal);
    try {
      await fetch('http://127.0.0.1:8888/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoScanEnabled: newVal })
      });
    } catch (err) {
      console.error('Failed to toggle auto scan', err);
    }
  };

  useEffect(() => {
    fetchProxies();
    
    fetch('http://127.0.0.1:8888/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && data.autoScanEnabled !== undefined) {
          setAutoScanEnabled(data.autoScanEnabled);
        }
      }).catch(() => {});

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['isConnected', 'connectedServer'], (result) => {
        if (result.isConnected && result.connectedServer) {
          setStatus('connected');
          setSelectedCountry(result.connectedServer.country);
          setSelectedServerId(result.connectedServer.id);
          setCurrentIP(result.connectedServer.exitIP || result.connectedServer.host);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (groupedServers[selectedCountry] && groupedServers[selectedCountry].servers.length > 0) {
      const currentServerValid = groupedServers[selectedCountry].servers.find(s => s.id === selectedServerId);
      if (!currentServerValid) {
        setSelectedServerId(groupedServers[selectedCountry].servers[0].id);
      }
    }
  }, [selectedCountry, groupedServers]);

  const handleConnect = async () => {
    if (status === 'connected') {
      setStatus('disconnected');
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: 'DISCONNECT' });
      }
      return;
    }

    const serverToConnect = servers.find(s => s.id === selectedServerId);
    if (!serverToConnect) return;

    setStatus('connecting');
    
    try {
      await fetch('http://127.0.0.1:8888/api/set-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: serverToConnect.host, port: serverToConnect.port })
      });
    } catch (err) {
      console.error('Failed to set upstream proxy:', err);
      setStatus('disconnected');
      return;
    }

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(
        { 
          type: 'CONNECT', 
          server: serverToConnect,
          proxyConfig: { scheme: 'http', host: '127.0.0.1', port: 8889 } 
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            setStatus('disconnected');
          } else if (response && response.success) {
            setStatus('connected');
            setCurrentIP(serverToConnect.exitIP || serverToConnect.host);
          } else {
            setStatus('disconnected');
          }
        }
      );
    } else {
      setTimeout(() => {
        setStatus('connected');
        setCurrentIP(serverToConnect.exitIP || serverToConnect.host);
      }, 1500);
    }
  };

  const getStatusText = () => {
    if (status === 'connected') return 'SECURE';
    if (status === 'connecting') return 'CONNECTING...';
    return 'UNPROTECTED';
  };

  const getShieldIcon = () => {
    if (status === 'connected') return <ShieldCheck size={20} className="logo-icon" />;
    if (status === 'connecting') return <Shield size={20} className="logo-icon" />;
    return <ShieldAlert size={20} className="logo-icon" style={{color: 'var(--text-muted)'}} />;
  };

  return (
    <>
      <div className="cyber-lines"></div>
      
      <div className="header">
        <div className="logo-container">
          {getShieldIcon()}
          <span className="app-title">Sci-Fi VPN</span>
        </div>
        <div className={`status-badge ${status}`}>
          {getStatusText()}
        </div>
      </div>

      <div className="ip-display">
        <div className="ip-label">Visible IP Address</div>
        <div className="ip-address">{status === 'connecting' ? '...' : currentIP}</div>
      </div>

      <div className="connect-container">
        <button 
          className={`connect-btn ${status === 'connected' ? 'is-connected' : ''}`}
          onClick={handleConnect}
          disabled={status === 'connecting' || servers.length === 0}
        >
          <Power className="power-icon" />
        </button>
      </div>

      <div className="server-selector">
        <div className="selector-label" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div><Globe size={12} style={{marginRight: '5px', display: 'inline'}}/> Select Country</div>
          <button 
            onClick={revalidateProxies} 
            disabled={loadingServers || status !== 'disconnected'}
            style={{background: 'transparent', border: 'none', color: 'var(--neon-blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px'}}
            title="Check Saved Nodes"
          >
            <RefreshCw size={12} className={loadingServers ? 'spinning' : ''} />
            CHECK SAVED
          </button>
        </div>
        <select 
          className="custom-select" 
          style={{marginBottom: '15px'}}
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          disabled={status !== 'disconnected' || loadingServers}
        >
          {loadingServers ? (
            <option>Checking Nodes...</option>
          ) : countries.map(country => (
            <option key={country} value={country}>
              {country} {groupedServers[country].fastestPing !== 9999 ? `(~${groupedServers[country].fastestPing}ms)` : ''}
            </option>
          ))}
        </select>

        <div className="selector-label" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div><MapPin size={12} style={{marginRight: '5px', display: 'inline'}}/> Select City / Node</div>
        </div>
        <select 
          className="custom-select" 
          value={selectedServerId}
          onChange={(e) => setSelectedServerId(e.target.value)}
          disabled={status !== 'disconnected' || loadingServers}
          style={{marginBottom: '15px'}}
        >
          {loadingServers ? (
            <option>Checking Nodes...</option>
          ) : (groupedServers[selectedCountry]?.servers || []).map(server => (
            <option key={server.id} value={server.id}>
              {server.city} {server.ping ? `(${server.ping}ms)` : ''} - {server.exitIP || server.host}
            </option>
          ))}
        </select>
        
        {/* Toggle Settings */}
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(0, 243, 255, 0.1)'}}>
          <div className="selector-label" style={{margin: 0, display: 'flex', alignItems: 'center', gap: '5px'}}>
            <Settings2 size={12} /> Auto-Scan New Nodes
          </div>
          <label className="switch">
            <input type="checkbox" checked={autoScanEnabled} onChange={toggleAutoScan} disabled={status !== 'disconnected'} />
            <span className="slider round"></span>
          </label>
        </div>
      </div>
    </>
  );
}

export default App;
