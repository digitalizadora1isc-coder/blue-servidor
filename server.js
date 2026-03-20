// server.js — Blue Comunicadores
// Guarda landing pages en GitHub y las sirve al cliente

const express = require('express');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

const GH_TOKEN = process.env.GITHUB_TOKEN;
const GH_OWNER = 'digitalizadora1isc-coder';
const GH_REPO  = 'blue-cotizaciones';
const GH_HEADERS = {
  'Authorization': 'token ' + GH_TOKEN,
  'Content-Type':  'application/json',
  'User-Agent':    'blue-servidor'
};

app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.get('/', (_req, res) => {
  res.json({ ok: true, mensaje: 'Blue Servidor OK ✅' });
});

// ── POST /guardar-cotizacion ─────────────────────────────────────────────────
// Recibe { id, html } y guarda el HTML como archivo en GitHub
app.post('/guardar-cotizacion', async (req, res) => {
  try {
    const { id, html } = req.body;
    if (!id || !html) return res.status(400).json({ ok: false, error: 'Falta id o html' });

    const safeId   = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = 'pages/' + safeId + '.html';
    const content  = Buffer.from(html).toString('base64');

    // Obtener SHA si el archivo ya existe (necesario para actualizarlo)
    let sha;
    const checkResp = await fetch(
      'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + filePath,
      { headers: GH_HEADERS }
    );
    if (checkResp.ok) {
      const checkData = await checkResp.json();
      sha = checkData.sha;
    }

    const body = { message: 'Cotización ' + safeId, content };
    if (sha) body.sha = sha;

    const uploadResp = await fetch(
      'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + filePath,
      { method: 'PUT', headers: GH_HEADERS, body: JSON.stringify(body) }
    );

    if (!uploadResp.ok) {
      const err = await uploadResp.json().catch(() => ({}));
      throw new Error('GitHub error: ' + (err.message || uploadResp.status));
    }

    const url = 'https://blue-servidor.onrender.com/cotizacion/' + safeId;
    res.json({ ok: true, url });

  } catch (e) {
    console.error('Error /guardar-cotizacion:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /cotizacion/:id ───────────────────────────────────────────────────────
// Sirve la landing page desde GitHub
app.get('/cotizacion/:id', async (req, res) => {
  try {
    const safeId = req.params.id.replace(/[^a-zA-Z0-9_-]/g, '_');

    const rawResp = await fetch(
      'https://raw.githubusercontent.com/' + GH_OWNER + '/' + GH_REPO + '/main/pages/' + safeId + '.html',
      { headers: { 'Authorization': 'token ' + GH_TOKEN, 'User-Agent': 'blue-servidor' } }
    );

    if (!rawResp.ok) {
      return res.status(404).send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Página no encontrada</title>
<style>body{font-family:Arial,sans-serif;background:#0f2744;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.box{background:#fff;border-radius:16px;padding:48px 40px;text-align:center;max-width:400px;}
h2{color:#0f2744;font-size:20px;margin-bottom:8px;}p{color:#9aa3b0;font-size:14px;}</style>
</head><body><div class="box"><h2>Cotización no encontrada</h2>
<p>Este enlace puede haber expirado o el ID no existe.<br>Solicita un nuevo enlace a Blue Comunicadores.</p></div></body></html>`);
    }

    const html = await rawResp.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);

  } catch (e) {
    console.error('Error /cotizacion/:id:', e.message);
    res.status(500).send('<h2>Error al cargar la cotización</h2>');
  }
});

app.listen(PORT, () => console.log('Blue Servidor corriendo en puerto', PORT));
