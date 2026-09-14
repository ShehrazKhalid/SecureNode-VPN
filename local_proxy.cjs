const http = require('http');
const net = require('net');

// Create a basic HTTP/S tunnel proxy on port 8888
const server = http.createServer((req, res) => {
  // Handle HTTP requests
  const url = new URL(req.url);
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    res.end();
  });

  req.pipe(proxyReq, { end: true });
});

// Handle HTTPS CONNECT requests
server.on('connect', (req, clientSocket, head) => {
  const { port, hostname } = new URL(`http://${req.url}`);
  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                    'Proxy-agent: Node.js-Proxy\r\n' +
                    '\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  
  serverSocket.on('error', (err) => {
    clientSocket.end();
  });
  clientSocket.on('error', (err) => {
    serverSocket.end();
  });
});

const PORT = 8888;
server.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`✅ Local Proxy Server is running on port ${PORT}!`);
  console.log(`=================================================`);
  console.log(`Now open the VPN Extension, go to "Node Location", select`);
  console.log(`"My Local Server" and click Connect!`);
});
