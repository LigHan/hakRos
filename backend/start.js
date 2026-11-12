'use strict';

// Node loads additional trusted certificates only at startup. Launch the API
// in a child process so the certificate is present before TLS is initialized.
const { spawn } = require('node:child_process');
const path = require('node:path');

const env = { ...process.env };
if (!env.NODE_EXTRA_CA_CERTS) {
  env.NODE_EXTRA_CA_CERTS = path.join(__dirname, 'certificates', 'russian-trusted-root-ca.pem');
}
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('error', () => { console.error('Не удалось запустить API.'); process.exitCode = 1; });
server.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
