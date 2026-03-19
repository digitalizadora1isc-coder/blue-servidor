// api/generar-pdf.js
// Servidor Blue Comunicadores — Vercel Serverless Function
// Genera PDF con PDFShift y lo sube a Cloudinary

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const FormData = (...args) => import('form-data').then(({default: F}) => new F(...args));

export default async function handler(req, res) {

  // CORS — permite llamadas desde cualquier origen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { html, filename } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'Falta el HTML' });
  }

  const safeFilename = (filename || 'cotizacion').replace(/[^a-zA-Z0-9_-]/g, '_');

  try {

    // ── PASO 1: Generar PDF con PDFShift ──────────────────────────────────
    const pdfshiftKey = process.env.PDFSHIFT_KEY;
    if (!pdfshiftKey) throw new Error('Falta PDFSHIFT_KEY en variables de entorno');

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

    // ── PASO 2: Subir PDF a Cloudinary ────────────────────────────────────
    const cloudName = process.env.CLD_CLOUD;
    const uploadPreset = process.env.CLD_PRESET;
    if (!cloudName || !uploadPreset) throw new Error('Faltan CLD_CLOUD o CLD_PRESET en variables de entorno');

    const formData = new (require('form-data'))();
    formData.append('file', pdfBuffer, {
      filename: safeFilename + '.pdf',
      contentType: 'application/pdf'
    });
    formData.append('upload_preset', uploadPreset);
    formData.append('public_id', 'cotizaciones/' + safeFilename + '-' + Date.now());
    formData.append('resource_type', 'raw');

    const cldResponse = await fetch(
      'https://api.cloudinary.com/v1_1/' + cloudName + '/raw/upload',
      { method: 'POST', body: formData, headers: formData.getHeaders() }
    );

    if (!cldResponse.ok) {
      const cldErr = await cldResponse.json().catch(() => ({}));
      throw new Error('Cloudinary error: ' + (cldErr.error?.message || cldResponse.status));
    }

    const cldData = await cldResponse.json();

    // URL pública — se abre en el navegador (no descarga)
    const publicUrl = cldData.secure_url;
    return res.status(200).json({
      ok: true,
      url: publicUrl
    });

  } catch (error) {
    console.error('Error en generar-pdf:', error.message);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
