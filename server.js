// server.js — Blue Comunicadores
// Genera landing page, la guarda en GitHub y envía correo con Brevo API

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

const BREVO_KEY  = process.env.BREVO_API_KEY;
const EMAIL_FROM = 'digitalizadora1.isc@gmail.com';

app.use(express.json({ limit: '10mb' }));
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
  const logoTag = d.logoSrc
    ? `<img src="${d.logoSrc}" style="height:80px;width:auto;display:block;" alt="BLUE COMUNICADORES">`
    : `<span style="font-size:22px;font-weight:900;color:#0f2744;letter-spacing:-1px;font-family:Montserrat,Arial,sans-serif;">BLUE<br>COMUNICADORES</span>`;

  const rows = (d.items || []).map((it, idx) => {
    const bg = idx % 2 === 1 ? '#f7f7f7' : '#ffffff';
    return `<tr>
      <td style="background:${bg};padding:8px 10px;border:1px solid #bbb;font-weight:700;font-size:13px;color:#000;text-align:center;vertical-align:top;width:32px;">${it.num || idx+1}</td>
      ${it.cod ? `<td style="background:${bg};padding:8px 10px;border:1px solid #bbb;font-weight:700;font-size:11px;color:#000;vertical-align:top;white-space:nowrap;">${esc(it.cod)}</td>` : ''}
      <td style="background:${bg};padding:8px 10px;border:1px solid #bbb;font-weight:700;font-size:11px;text-transform:uppercase;color:#000;vertical-align:top;line-height:1.4;">${esc(it.nom||'')}</td>
      <td style="background:${bg};padding:8px 10px;border:1px solid #bbb;font-size:11px;color:#000;vertical-align:top;line-height:1.5;white-space:pre-line;">${esc(it.desc||'')}</td>
      <td style="background:${bg};padding:8px 10px;border:1px solid #bbb;font-weight:700;font-size:12px;color:#000;text-align:right;vertical-align:top;white-space:nowrap;">S/${fmt(it.tar||it.total||0)}</td>
    </tr>`;
  }).join('');

  const consList = (d.consideraciones || '').split('\n').filter(l => l.trim())
    .map(l => `<li style="font-size:12px;margin-bottom:5px;line-height:1.5;color:#222;">${esc(l.replace(/^[•\-*]\s*/, ''))}</li>`)
    .join('');

  const cargoHtml = d.cargo ? `<p style="font-size:12px;color:#555;margin:2px 0 10px;font-family:Montserrat,Arial,sans-serif;">${esc(d.cargo)}</p>` : `<div style="margin-bottom:10px;"></div>`;
  const firmCargoHtml = d.firmanteCargo ? `<p style="font-size:11px;color:#555;margin:2px 0 0;font-family:Montserrat,Arial,sans-serif;">${esc(d.firmanteCargo)}</p>` : '';

  const waText = encodeURIComponent('Hola, tengo una consulta sobre la cotización Cot. ' + (d.cotNum||''));
  const mailSubj = encodeURIComponent('Consulta cotización Cot. ' + (d.cotNum||''));

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cotización ${esc(d.cotNum)} — Blue Comunicadores</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Montserrat,Arial,sans-serif;background:#e8edf4;color:#222;}
  a{text-decoration:none;color:inherit;}
  .page{max-width:780px;margin:24px auto;background:#fff;box-shadow:0 4px 32px rgba(0,0,0,0.13);}

  /* HEADER */
  .hdr{background:#fff;padding:14px 28px;display:flex;align-items:center;justify-content:flex-end;border-bottom:3px solid #4EB5EF;}

  /* BANNER (placeholder fotos) */
  .banner{height:80px;background:linear-gradient(90deg,#0f2744 0%,#1a5a9a 40%,#4EB5EF 70%,#0f2744 100%);display:flex;align-items:center;justify-content:center;gap:16px;overflow:hidden;}
  .banner-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.35);}

  /* BODY */
  .body{padding:20px 32px 10px;}
  .cli-empresa{font-size:14px;font-weight:700;color:#000;line-height:1.3;}
  .cli-contacto{font-size:13px;font-weight:600;color:#000;margin-top:1px;line-height:1.3;}
  .cli-ciudad{font-size:11px;color:#555;margin-top:2px;line-height:1.3;}
  .cotnum{font-size:13px;font-weight:700;color:#000;border-bottom:2px solid #aaa;display:inline-block;padding-bottom:2px;margin:6px 0 14px;}

  /* TABLA SERVICIOS */
  .svc-table{width:100%;border-collapse:collapse;border:2px solid #aaa;margin-bottom:16px;}
  .svc-table td{padding:8px 10px;border:1px solid #bbb;vertical-align:top;color:#000;}
  .svc-head-title{background:#1a1a1a;color:#fff;text-align:center;padding:9px;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:1px;}
  .svc-head-intro{background:#fff;color:#333;font-size:10px;padding:8px 10px;border-bottom:1px solid #bbb;}

  /* CONSIDERACIONES */
  .cons-title{font-weight:700;font-size:11px;color:#4EB5EF;text-decoration:underline;margin-bottom:6px;}
  .cons-list{padding-left:18px;margin-bottom:14px;}

  /* FIRMA */
  .firma-name{font-weight:700;color:#4EB5EF;font-size:13px;margin:2px 0 0;}

  /* CTA BOTONES (solo web) */
  .cta-section{background:#f4f8fc;border-top:2px solid #e0eaf4;padding:20px 32px;text-align:center;margin-top:10px;}
  .cta-title{font-size:13px;color:#555;margin-bottom:14px;}
  .btn-wa{display:inline-block;background:#25d366;color:#fff;font-weight:700;font-size:13px;padding:11px 28px;border-radius:8px;margin:5px;}
  .btn-mail{display:inline-block;background:#1e6fb5;color:#fff;font-weight:700;font-size:13px;padding:11px 28px;border-radius:8px;margin:5px;}

  /* FOOTER */
  .ftr{background:#4EB5EF;padding:16px 28px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;}
  .ftr-left,.ftr-right{font-size:10px;color:#fff;line-height:1.9;font-weight:600;}
  .ftr-right{text-align:right;}
  .ftr-social{background:#3ca8e0;padding:10px 28px;display:flex;justify-content:center;align-items:center;gap:24px;flex-wrap:wrap;}
  .ftr-social a{color:#fff;font-size:11px;font-weight:700;opacity:.9;display:flex;align-items:center;gap:6px;}
  .ftr-social a:hover{opacity:1;}

  @media(max-width:600px){
    .body{padding:16px 16px 8px;}
    .cta-section{padding:16px;}
    .ftr{flex-direction:column;}
    .ftr-right{text-align:left;}
    .btn-wa,.btn-mail{display:block;width:100%;margin:4px 0;}
  }
</style>
</head>
<body>

<div class="page">

  <!-- HEADER -->
  <div class="hdr">${logoTag}</div>

  <!-- BANNER (placeholder fotos de trabajos) -->
  <div class="banner">
    <div class="banner-dot"></div><div class="banner-dot"></div>
    <span style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Blue Comunicadores · Trabajos realizados</span>
    <div class="banner-dot"></div><div class="banner-dot"></div>
  </div>

  <!-- BODY -->
  <div class="body">
    <p class="cli-empresa">${esc(d.empresa)}</p>
    <p class="cli-contacto">${esc(d.contacto)}</p>
    ${cargoHtml}
    <p class="cli-ciudad">${esc(d.ciudad||'Lima')}, ${esc(d.fecha)}</p>
    <p class="cotnum">Cot. ${esc(d.cotNum)}</p>

    <!-- TABLA SERVICIOS -->
    <table class="svc-table">
      <tbody>
        <tr><td colspan="5" class="svc-head-title">PRESUPUESTO DE SERVICIO</td></tr>
        <tr><td colspan="5" class="svc-head-intro">La presente comunicación busca hacerle llegar nuestros costos de los servicios solicitados:</td></tr>
        ${rows}
        <tr>
          <td colspan="4" style="background:#1a1a1a;padding:10px;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#fff;text-align:right;border:1px solid #aaa;">TOTAL</td>
          <td style="background:#1a1a1a;padding:10px;font-weight:800;font-size:14px;color:#4EB5EF;text-align:right;border:1px solid #aaa;white-space:nowrap;">S/${fmt(d.total)}</td>
        </tr>
      </tbody>
    </table>

    ${consList ? `
    <p class="cons-title">CONSIDERACIONES:</p>
    <ul class="cons-list">${consList}</ul>` : ''}

    <p style="font-size:11px;margin-bottom:12px;color:#000;line-height:1.6;">Estamos seguros de poder ofrecerle un servicio de calidad; quedamos a la espera de cualquier consulta o inquietud, sin otro particular.</p>
    <p style="font-size:11px;margin-bottom:4px;color:#000;">Atentamente,</p>
    <div style="height:48px;"></div>
    <p class="firma-name">${esc(d.firmante||'ZARA ARKA')}</p>
    ${firmCargoHtml}
  </div>

  <!-- CTA (solo web, no aparece en PDF) -->
  <div class="cta-section">
    <p class="cta-title">¿Tienes alguna consulta sobre esta cotización?</p>
    <a class="btn-wa" href="https://wa.me/51${esc(d.whatsapp||'985568329')}?text=${waText}">💬 WhatsApp</a>
    <a class="btn-mail" href="mailto:sara@bluecomunicadores.com?subject=${mailSubj}">✉️ Enviar correo</a>
  </div>

  <!-- FOOTER -->
  <div class="ftr">
    <div class="ftr-left">
      Calle Las Acacias 270 Miraflores · Lima, Perú<br>
      C +51 985 568 329<br>
      sara@bluecomunicadores.com<br>
      administracion@bluecomunicadores.com
    </div>
    <div class="ftr-right">
      R.U.C. 20546289436<br>
      BCP: Cta. Soles 194-7124953020<br>
      BBVA: Cta. Dólares 0011-0317020033771250<br>
      BBVA: Cta. Soles 0011-0876-0200016193-01
    </div>
  </div>
  <div class="ftr-social">
    <a href="https://www.tiktok.com/@bluecomunicadores" target="_blank">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.78a4.85 4.85 0 01-1.01-.09z"/></svg>
      TikTok
    </a>
    <a href="https://www.instagram.com/bluecomunicadores" target="_blank">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
      Instagram
    </a>
    <a href="https://www.facebook.com/share/17Fw4Ac97v/" target="_blank">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      Facebook
    </a>
  </div>

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

    console.log('Enviando correo vía Brevo API a:', toEmail);
    const brevoResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'api-key':      BREVO_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender:      { name: 'Blue Comunicadores', email: EMAIL_FROM },
        to:          [{ email: toEmail }],
        subject:     'Cotización COT-' + cotData.cotNum + ' — Blue Comunicadores',
        htmlContent: generarEmailHTML(cotData, landingUrl)
      })
    });

    if (!brevoResp.ok) {
      const errData = await brevoResp.json().catch(() => ({}));
      throw new Error('Brevo error: ' + (errData.message || brevoResp.status));
    }
    console.log('Correo enviado a:', toEmail);

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
