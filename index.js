// server.js
// Servidor Blue Comunicadores — Railway
// Genera PDF con PDFShift y lo sube a Cloudinary

const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// Parsear JSON en el body
app.use(express.json({ limit: '10mb' }));

// CORS — permite llamadas desde cualquier origen
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ── Ruta de prueba ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'Servidor Blue Comunicadores funcionando ✅' });
});

// ── Ruta principal: generar PDF y subir a Cloudinary ─────────────────────────
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
      body: JSON.stringify({
        source: html,
        format: 'A4',
        margin: '0',
        use_print: false
      })
    });

    if (!pdfResponse.ok) {
      const errText = await pdfResponse.text();
      throw new Error('PDFShift error ' + pdfResponse.status + ': ' + errText);
    }

    const pdfBuffer = await pdfResponse.buffer();
    console.log('PDF generado, tamaño:', pdfBuffer.length, 'bytes');

    // ── PASO 2: Subir PDF a Cloudinary ────────────────────────────────────────
    const cloudName = process.env.CLD_CLOUD;
    const uploadPreset = process.env.CLD_PRESET;

    if (!cloudName || !uploadPreset) {
      throw new Error('Faltan CLD_CLOUD o CLD_PRESET en variables de entorno');
    }

    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: safeFilename + '.pdf',
      contentType: 'application/pdf'
    });
    formData.append('upload_preset', uploadPreset);
    formData.append('public_id', 'cotizaciones/' + safeFilename);
    formData.append('resource_type', 'raw');

    console.log('Subiendo a Cloudinary...');

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

    // URL pública — se abre en el navegador (no descarga)
    const publicUrl = cldData.secure_url.replace('/upload/', '/upload/fl_attachment:false/');

    return res.status(200).json({ ok: true, url: publicUrl });

  } catch (error) {
    console.error('Error en /generar-pdf:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ── Iniciar servidor ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('Servidor Blue Comunicadores corriendo en puerto', PORT);
});
