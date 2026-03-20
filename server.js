// server.js
// Servidor Blue Comunicadores — Render
// Genera PDF con PDFShift y lo sube a Cloudinary con signed upload

const crypto  = require('crypto');
const express = require('express');
const fetch   = require('node-fetch');
const FormData = require('form-data');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Genera la firma SHA-256 requerida por Cloudinary para signed uploads
function cloudinarySign(params, apiSecret) {
  const str = Object.keys(params).sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha256').update(str + apiSecret).digest('hex');
}

app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'Servidor Blue Comunicadores funcionando ✅' });
});

app.post('/generar-pdf', async (req, res) => {
  const { html, filename } = req.body;

  if (!html) {
    return res.status(400).json({ ok: false, error: 'Falta el HTML' });
  }

  const safeFilename = (filename || 'cotizacion').replace(/[^a-zA-Z0-9_-]/g, '_');

  try {
    // ── PASO 1: Generar PDF con PDFShift ──────────────────────────────────────
    const pdfshiftKey = process.env.PDFSHIFT_KEY;
    if (!pdfshiftKey) throw new Error('Falta PDFSHIFT_KEY en variables de entorno');

    console.log('Generando PDF para:', safeFilename);

    const pdfResponse = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from('api:' + pdfshiftKey).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ source: html, format: 'A4', margin: '0', use_print: false })
    });

    if (!pdfResponse.ok) {
      const errText = await pdfResponse.text();
      throw new Error('PDFShift error ' + pdfResponse.status + ': ' + errText);
    }

    const pdfBuffer = await pdfResponse.buffer();
    console.log('PDF generado, tamaño:', pdfBuffer.length, 'bytes');

    // ── PASO 2: Signed upload a Cloudinary ───────────────────────────────────
    const cloudName  = process.env.CLD_CLOUD;
    const apiKey     = process.env.CLD_API_KEY;
    const apiSecret  = process.env.CLD_API_SECRET;
    const preset     = process.env.CLD_PRESET;

    if (!cloudName || !apiKey || !apiSecret || !preset) {
      throw new Error('Faltan variables de entorno: CLD_CLOUD, CLD_API_KEY, CLD_API_SECRET o CLD_PRESET');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId  = 'cotizaciones/' + safeFilename + '.pdf';

    // Solo se firman los parámetros que se envían al API (excepto file y api_key)
    const paramsToSign = {
      access_mode:    'public',
      public_id:      publicId,
      timestamp:      timestamp,
      upload_preset:  preset
    };

    const signature = cloudinarySign(paramsToSign, apiSecret);

    const formData = new FormData();
    formData.append('file', pdfBuffer, { filename: safeFilename + '.pdf', contentType: 'application/pdf' });
    formData.append('api_key',      apiKey);
    formData.append('timestamp',    timestamp);
    formData.append('signature',    signature);
    formData.append('upload_preset', preset);
    formData.append('public_id',    publicId);
    formData.append('access_mode',  'public');

    console.log('Subiendo a Cloudinary (signed)...');

    const cldResponse = await fetch(
      'https://api.cloudinary.com/v1_1/' + cloudName + '/raw/upload',
      { method: 'POST', body: formData, headers: formData.getHeaders() }
    );

    if (!cldResponse.ok) {
      const cldErr = await cldResponse.json().catch(() => ({}));
      throw new Error('Cloudinary error: ' + (cldErr.error?.message || cldResponse.status));
    }

    const cldData = await cldResponse.json();
    console.log('Subido a Cloudinary:', cldData.secure_url);

    return res.status(200).json({ ok: true, url: cldData.secure_url });

  } catch (error) {
    console.error('Error en /generar-pdf:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('Servidor Blue Comunicadores corriendo en puerto', PORT);
});
