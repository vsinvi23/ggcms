const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

function getToken() {
  return execSync('CLOUDSDK_PYTHON=~/portable-python3/python/bin/python3 ~/google-cloud-sdk/bin/gcloud auth print-identity-token', { encoding: 'utf8' }).trim();
}

const targetHost = 'gg-cms-backend-274495931884.us-central1.run.app';
const PORT = 8085;

const server = http.createServer((req, res) => {
  let token;
  try {
    token = getToken();
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end("Failed to fetch gcloud token: " + e.message);
    return;
  }

  const headers = { ...req.headers };
  headers.host = targetHost;
  headers.authorization = `Bearer ${token}`;

  const options = {
    hostname: targetHost,
    port: 443,
    path: req.url,
    method: req.method,
    headers: headers
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy Error: ' + err.message);
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, () => {
  console.log(`Local authenticated proxy running on http://localhost:${PORT}`);
});
