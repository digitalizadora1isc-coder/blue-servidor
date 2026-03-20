// server.js — Blue Comunicadores
// Genera landing page, la guarda en GitHub y envía correo con Nodemailer

const express    = require('express');
const fetch      = require('node-fetch');
const nodemailer = require('nodemailer');

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

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || '"Blue Comunicadores" <administracion@bluecomunicadores.com>';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || n === '') return '';
  return Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Genera HTML de la landing page ────────────────────────────────────────────

function generarLandingHTML(d) {
  const servicios = (d.items || []).map(it => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e8edf4;font-size:14px;color:#2d3748;">${esc(it.desc)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8edf4;font-size:14px;color:#2d3748;text-align:center;">${esc(it.qty)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8edf4;font-size:14px;color:#2d3748;text-align:right;">S/ ${fmt(it.unit)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8edf4;font-size:14px;font-weight:600;color:#0f2744;text-align:right;">S/ ${fmt(it.total)}</td>
    </tr>`).join('');

  const consideraciones = (d.consideraciones || '')
    .split('\n')
    .filter(l => l.trim())
    .map(l => `<li style="margin-bottom:8px;color:#4a5568;font-size:14px;">${esc(l.replace(/^[•\-*]\s*/, ''))}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cotización ${esc(d.cotNum)} — Blue Comunicadores</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;color:#2d3748;}
  a{color:inherit;text-decoration:none;}
  .hero{background:linear-gradient(135deg,#0f2744 0%,#1a3d6e 60%,#1e6fb5 100%);padding:48px 24px 56px;text-align:center;}
  .hero-logo{width:64px;height:64px;background:#fff;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px;}
  .hero-logo svg{width:40px;height:40px;}
  .hero h1{font-size:28px;font-weight:700;color:#fff;margin-bottom:6px;letter-spacing:-0.5px;}
  .hero p{font-size:15px;color:#93c5fd;margin-bottom:0;}
  .badge{display:inline-block;background:rgba(255,255,255,0.15);color:#fff;font-size:12px;font-weight:600;padding:4px 14px;border-radius:20px;margin-top:12px;letter-spacing:0.5px;}
  .container{max-width:680px;margin:-32px auto 0;padding:0 16px 48px;}
  .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(15,39,68,0.10);overflow:hidden;margin-bottom:20px;}
  .card-header{background:#f7f9fc;padding:16px 24px;border-bottom:1px solid #e8edf4;display:flex;align-items:center;gap:10px;}
  .card-header svg{width:20px;height:20px;color:#1e6fb5;flex-shrink:0;}
  .card-header h2{font-size:15px;font-weight:700;color:#0f2744;text-transform:uppercase;letter-spacing:0.5px;}
  .card-body{padding:20px 24px;}
  .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .meta-item label{display:block;font-size:11px;font-weight:700;color:#9aa3b0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;}
  .meta-item span{font-size:14px;color:#2d3748;font-weight:500;}
  table{width:100%;border-collapse:collapse;}
  thead tr{background:#f7f9fc;}
  thead th{padding:10px 12px;font-size:11px;font-weight:700;color:#9aa3b0;text-transform:uppercase;letter-spacing:0.5px;text-align:left;}
  thead th:last-child,thead th:nth-child(3),thead th:nth-child(2){text-align:right;}
  thead th:nth-child(2){text-align:center;}
  .total-row{background:#0f2744;}
  .total-row td{padding:14px 12px;color:#fff;font-weight:700;font-size:16px;}
  .total-row td:last-child{text-align:right;font-size:20px;}
  ul{padding-left:20px;}
  .cta{text-align:center;padding:28px 24px;}
  .btn{display:inline-block;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;margin:6px;transition:opacity .2s;}
  .btn-wa{background:#25d366;color:#fff;}
  .btn-mail{background:#1e6fb5;color:#fff;}
  .btn:hover{opacity:.88;}
  .footer{text-align:center;padding:24px 16px;color:#9aa3b0;font-size:13px;}
  .footer strong{color:#0f2744;}
  @media(max-width:480px){
    .meta-grid{grid-template-columns:1fr;}
    .hero h1{font-size:22px;}
    .btn{display:block;width:100%;margin:6px 0;}
  }
</style>
</head>
<body>

<div class="hero">
  <div class="hero-logo">
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#0f2744"/>
      <path d="M10 20C10 14.477 14.477 10 20 10C25.523 10 30 14.477 30 20C30 25.523 25.523 30 20 30C14.477 30 10 25.523 10 20Z" fill="#1e6fb5"/>
      <path d="M16 20L19 23L24 17" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <h1>Blue Comunicadores</h1>
  <p>Tu cotización personalizada está lista</p>
  <span class="badge">COT-${esc(d.cotNum)}</span>
</div>

<div class="container">

  <!-- Info general -->
  <div class="card">
    <div class="card-header">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
      <h2>Información del cliente</h2>
    </div>
    <div class="card-body">
      <div class="meta-grid">
        <div class="meta-item"><label>Empresa</label><span>${esc(d.empresa)}</span></div>
        <div class="meta-item"><label>Contacto</label><span>${esc(d.contacto)}</span></div>
        <div class="meta-item"><label>N° Cotización</label><span>${esc(d.cotNum)}</span></div>
        <div class="meta-item"><label>Fecha</label><span>${esc(d.fecha)}</span></div>
        ${d.vigencia ? `<div class="meta-item"><label>Vigencia</label><span>${esc(d.vigencia)} días</span></div>` : ''}
        ${d.moneda ? `<div class="meta-item"><label>Moneda</label><span>${esc(d.moneda)}</span></div>` : ''}
      </div>
    </div>
  </div>

  <!-- Servicios -->
  <div class="card">
    <div class="card-header">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
      <h2>Detalle de servicios</h2>
    </div>
    <div class="card-body" style="padding:0;">
      <table>
        <thead><tr>
          <th style="padding-left:24px;">Descripción</th>
          <th>Cant.</th>
          <th>P. Unit.</th>
          <th style="padding-right:24px;">Total</th>
        </tr></thead>
        <tbody>${servicios}</tbody>
        <tfoot>
          ${d.subtotal ? `<tr><td colspan="3" style="padding:10px 12px;font-size:13px;color:#9aa3b0;text-align:right;">Subtotal</td><td style="padding:10px 12px;font-size:14px;font-weight:600;text-align:right;color:#0f2744;">S/ ${fmt(d.subtotal)}</td></tr>` : ''}
          ${d.igv ? `<tr><td colspan="3" style="padding:6px 12px;font-size:13px;color:#9aa3b0;text-align:right;">IGV (18%)</td><td style="padding:6px 12px;font-size:14px;font-weight:600;text-align:right;color:#0f2744;">S/ ${fmt(d.igv)}</td></tr>` : ''}
          <tr class="total-row">
            <td colspan="3" style="padding-left:24px;">TOTAL A PAGAR</td>
            <td style="padding-right:24px;">S/ ${fmt(d.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  ${consideraciones ? `
  <!-- Consideraciones -->
  <div class="card">
    <div class="card-header">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <h2>Consideraciones</h2>
    </div>
    <div class="card-body">
      <ul>${consideraciones}</ul>
    </div>
  </div>` : ''}

  <!-- CTA -->
  <div class="card">
    <div class="cta">
      <p style="font-size:15px;color:#4a5568;margin-bottom:20px;">¿Tienes alguna consulta? Contáctanos directamente.</p>
      <a class="btn btn-wa" href="https://wa.me/51${esc(d.whatsapp || '999999999')}?text=${encodeURIComponent('Hola, tengo una consulta sobre la cotización ' + d.cotNum)}">
        💬 WhatsApp
      </a>
      <a class="btn btn-mail" href="mailto:${esc(d.emailEmpresa || 'ventas@bluecomunicadores.com')}?subject=${encodeURIComponent('Consulta cotización ' + d.cotNum)}">
        ✉️ Enviar correo
      </a>
    </div>
  </div>

</div>

<div class="footer">
  <strong>Blue Comunicadores</strong> · Cotización válida por ${esc(d.vigencia || '30')} días<br>
  Este documento es de carácter confidencial y está dirigido exclusivamente al destinatario indicado.
</div>

</body>
</html>`;
}

// ── Genera HTML del correo ────────────────────────────────────────────────────

function generarEmailHTML(d, landingUrl) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cotización Blue Comunicadores</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#0f2744,#1e6fb5);border-radius:16px 16px 0 0;padding:36px 40px;text-align:center;">
        <div style="width:56px;height:56px;background:#fff;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
          <span style="font-size:28px;">📡</span>
        </div>
        <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;">Blue Comunicadores</h1>
        <p style="margin:8px 0 0;font-size:14px;color:#93c5fd;">Tu cotización está lista</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#fff;padding:36px 40px;">
        <p style="font-size:16px;color:#2d3748;margin:0 0 8px;">Hola, <strong>${esc(d.contacto || d.empresa)}</strong></p>
        <p style="font-size:14px;color:#4a5568;line-height:1.7;margin:0 0 24px;">
          Gracias por su interés en nuestros servicios. Adjuntamos la cotización
          <strong>COT-${esc(d.cotNum)}</strong> preparada especialmente para <strong>${esc(d.empresa)}</strong>.
        </p>

        <!-- Resumen -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border-radius:10px;margin-bottom:28px;">
          <tr>
            <td style="padding:16px 20px;border-bottom:1px solid #e8edf4;">
              <span style="font-size:11px;font-weight:700;color:#9aa3b0;text-transform:uppercase;letter-spacing:0.5px;">N° Cotización</span><br>
              <span style="font-size:15px;font-weight:600;color:#0f2744;">COT-${esc(d.cotNum)}</span>
            </td>
            <td style="padding:16px 20px;border-bottom:1px solid #e8edf4;">
              <span style="font-size:11px;font-weight:700;color:#9aa3b0;text-transform:uppercase;letter-spacing:0.5px;">Fecha</span><br>
              <span style="font-size:15px;font-weight:600;color:#0f2744;">${esc(d.fecha)}</span>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding:16px 20px;text-align:center;">
              <span style="font-size:12px;font-weight:700;color:#9aa3b0;text-transform:uppercase;letter-spacing:0.5px;">Total</span><br>
              <span style="font-size:28px;font-weight:800;color:#0f2744;">S/ ${fmt(d.total)}</span>
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr><td align="center">
            <a href="${landingUrl}" style="display:inline-block;background:linear-gradient(135deg,#0f2744,#1e6fb5);color:#fff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:10px;text-decoration:none;letter-spacing:0.3px;">
              Ver tu cotización completa →
            </a>
          </td></tr>
        </table>

        <p style="font-size:13px;color:#9aa3b0;text-align:center;margin:0 0 4px;">O copia este enlace en tu navegador:</p>
        <p style="font-size:12px;color:#1e6fb5;text-align:center;margin:0;word-break:break-all;">${landingUrl}</p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f7f9fc;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;border-top:1px solid #e8edf4;">
        <p style="margin:0;font-size:13px;color:#9aa3b0;">
          <strong style="color:#0f2744;">Blue Comunicadores</strong> · Cotización válida por ${esc(d.vigencia || '30')} días<br>
          Este correo es confidencial y está dirigido exclusivamente al destinatario indicado.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Guarda HTML en GitHub ─────────────────────────────────────────────────────

async function guardarEnGitHub(safeId, html) {
  const filePath = 'pages/' + safeId + '.html';
  const content  = Buffer.from(html).toString('base64');

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

  return 'https://blue-servidor.onrender.com/cotizacion/' + safeId;
}

// ── POST /enviar-cotizacion ───────────────────────────────────────────────────
// Recibe datos de la cotización, genera landing, la guarda en GitHub y envía correo

app.post('/enviar-cotizacion', async (req, res) => {
  try {
    const { cotData, toEmail } = req.body;
    if (!cotData || !toEmail) {
      return res.status(400).json({ ok: false, error: 'Falta cotData o toEmail' });
    }

    const safeId    = ('COT_' + (cotData.cotNum || 'x')).replace(/[^a-zA-Z0-9_-]/g, '_');
    const landingHtml = generarLandingHTML(cotData);
    const landingUrl  = await guardarEnGitHub(safeId, landingHtml);

    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    await transporter.sendMail({
      from: SMTP_FROM,
      to:   toEmail,
      subject: 'Cotización COT-' + cotData.cotNum + ' — Blue Comunicadores',
      html:    generarEmailHTML(cotData, landingUrl)
    });

    res.json({ ok: true, url: landingUrl });

  } catch (e) {
    console.error('Error /enviar-cotizacion:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /guardar-cotizacion ─────────────────────────────────────────────────
// Mantiene compatibilidad: solo guarda sin enviar correo

app.post('/guardar-cotizacion', async (req, res) => {
  try {
    const { id, html } = req.body;
    if (!id || !html) return res.status(400).json({ ok: false, error: 'Falta id o html' });

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const url    = await guardarEnGitHub(safeId, html);
    res.json({ ok: true, url });

  } catch (e) {
    console.error('Error /guardar-cotizacion:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /cotizacion/:id ───────────────────────────────────────────────────────

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
