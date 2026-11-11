// Independent preview server. The integration owner can mount the same router in server.js.
require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const { createAssistantRouter } = require('./assistant/router');

const app = express();
app.use(cors());
app.use(express.json({ limit: '16kb' }));
app.use('/api/assistant', createAssistantRouter());
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  return res.status(error.status === 413 ? 413 : 400).json({ error: 'invalid_request' });
});

const host = process.env.ASSISTANT_HOST || '127.0.0.1';
const port = Number(process.env.ASSISTANT_PORT || 3001);
app.listen(port, host, () => console.log(`Assistant preview: http://${host}:${port}/api/assistant/health`));
