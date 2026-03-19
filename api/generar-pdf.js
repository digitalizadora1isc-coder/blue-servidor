// api/generar-pdf.js

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const FormData = (...args) => import('form-data').then(({ default: F }) => new F(...args));

export default async function handler(req, res) {

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    // ── 1. PDFShift (SIMPLIFICADO Y CORRECTO) ─────────────────────────────
    const pdfshiftKey = process.env.PDFSHIFT_KEY;
    if (!pdfshiftKey) throw new Error('Falta PDFSHIFT_KEY');

    const pdfResponse = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from('api:' + pdfshiftKey).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: html
      })
    });

    // Validación REAL (esto evita PDFs corruptos 🔥)
    if (!pdfResponse.ok) {
      const errText = await pdfResponse.text();
      throw new Error('PDFShift error: ' + errText);
    }

    const contentType = pdfResponse.headers.get('content-type');

    if (!contentType || !contentType.includes('application/pdf')) {
      const text = await pdfResponse.text();
      throw new Error('PDFShift NO devolvió PDF: ' + text);
    }

    // Buffer correcto
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    // ── 2. Cloudinary ─────────────────────────────────────────────────────
    const cloudName = process.env.CLD_CLOUD;
    const uploadPreset = process.env.CLD_PRESET;

    if (!cloudName || !uploadPreset) {
      throw new Error('Faltan variables de Cloudinary');
    }

    const formData = new (require('form-data'))();

    formData.append('file', pdfBuffer, {
      filename: safeFilename + '.pdf',
      contentType: 'application/pdf'
    });

    formData.append('upload_preset', uploadPreset);
    formData.append('public_id', 'cotizaciones/' + safeFilename + '-' + Date.now());
    formData.append('resource_type', 'raw');

    const cldResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
      {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      }
    );

    if (!cldResponse.ok) {
      const err = await cldResponse.text();
      throw new Error('Cloudinary error: ' + err);
    }

    const cldData = await cldResponse.json();

    // URL FINAL (sin tocar 🔥)
    const publicUrl = cldData.secure_url;

    return res.status(200).json({
      ok: true,
      url: publicUrl
    });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
