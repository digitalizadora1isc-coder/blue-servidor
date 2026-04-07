// server.js — Blue Comunicadores v2
// Genera landing page, la guarda en GitHub y envía correo con Brevo API

const express = require('express');
const fetch   = require('node-fetch');
const { Pool } = require('pg');

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
const EMAIL_FROM = 'automatizacion@bluecomunicadores.com';

// ── Conexión PostgreSQL ───────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://blue_db_9kte_user:8yNtE5XlBjWCoTlbw7jZ0gyojuCQmFJo@dpg-d71fb0ffte5s73a1lkrg-a.oregon-postgres.render.com/blue_db_9kte',
  ssl: { rejectUnauthorized: false }
});

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
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

// ── ENDPOINTS POSTGRESQL ─────────────────────────────────────────────────────

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      empresa VARCHAR(200),
      contacto VARCHAR(200),
      cargo VARCHAR(200),
      email VARCHAR(200),
      telefono VARCHAR(50),
      creado_en TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cotizaciones (
      id SERIAL PRIMARY KEY,
      cot_num VARCHAR(50) NOT NULL,
      fecha_cot VARCHAR(100),
      fecha_input DATE,
      ciudad VARCHAR(100) DEFAULT 'Lima',
      cliente_id INT,
      empresa VARCHAR(200),
      contacto VARCHAR(200),
      cargo VARCHAR(200),
      email VARCHAR(200),
      telefono VARCHAR(50),
      firmante VARCHAR(200) DEFAULT 'ZARA ARKA',
      firmante_cargo VARCHAR(200),
      nota_interna TEXT,
      total DECIMAL(12,2) DEFAULT 0,
      estado VARCHAR(50) DEFAULT 'creado',
      creado_por VARCHAR(100),
      creado_en TIMESTAMP DEFAULT NOW(),
      modificado_por VARCHAR(100),
      modificado_en TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cotizacion_servicios (
      id SERIAL PRIMARY KEY,
      cotizacion_id INT NOT NULL,
      orden INT DEFAULT 0,
      codigo VARCHAR(50),
      nombre VARCHAR(300),
      descripcion TEXT,
      imagen_url TEXT,
      tarifa DECIMAL(12,2) DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cotizacion_consideraciones (
      id SERIAL PRIMARY KEY,
      cotizacion_id INT NOT NULL,
      orden INT DEFAULT 0,
      texto TEXT
    );
    CREATE TABLE IF NOT EXISTS cotizacion_columnas (
      id SERIAL PRIMARY KEY,
      cotizacion_id INT NOT NULL UNIQUE,
      col_item BOOLEAN DEFAULT TRUE,
      col_codigo BOOLEAN DEFAULT TRUE,
      col_servicio BOOLEAN DEFAULT TRUE,
      col_descripcion BOOLEAN DEFAULT TRUE,
      col_imagen BOOLEAN DEFAULT TRUE,
      col_tarifa BOOLEAN DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS cotizacion_timeline (
      id SERIAL PRIMARY KEY,
      cotizacion_id INT NOT NULL,
      texto VARCHAR(300),
      fecha VARCHAR(100),
      creado_en TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Tablas PostgreSQL listas ✅');
}
initDB().catch(console.error);

// POST /api/cotizacion/guardar
app.post('/api/cotizacion/guardar', async (req, res) => {
  const {
    cotNum, fechaCot, fechaInput, ciudad, empresa, contacto,
    cargo, email, telefono, firmanteCargo, notaInterna,
    total, estado, creadoPor, servicios, consideraciones, columnas
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let clienteId = null;
    if (empresa || contacto || email) {
      const r = await client.query('SELECT id FROM clientes WHERE email=$1 LIMIT 1', [email||'']);
      if (r.rows.length) {
        clienteId = r.rows[0].id;
        await client.query(
          'UPDATE clientes SET empresa=$1,contacto=$2,cargo=$3,telefono=$4 WHERE id=$5',
          [empresa,contacto,cargo,telefono,clienteId]
        );
      } else {
        const ins = await client.query(
          'INSERT INTO clientes(empresa,contacto,cargo,email,telefono) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [empresa,contacto,cargo,email,telefono]
        );
        clienteId = ins.rows[0].id;
      }
    }

    const existente = await client.query('SELECT id FROM cotizaciones WHERE cot_num=$1 LIMIT 1',[cotNum]);
    let cotId;
    const ahora = new Date().toLocaleString('es-PE');

    if (existente.rows.length) {
      cotId = existente.rows[0].id;
      await client.query(
        `UPDATE cotizaciones SET fecha_cot=$1,fecha_input=$2,ciudad=$3,cliente_id=$4,empresa=$5,
         contacto=$6,cargo=$7,email=$8,telefono=$9,firmante_cargo=$10,nota_interna=$11,
         total=$12,estado=$13,modificado_por=$14,modificado_en=NOW() WHERE id=$15`,
        [fechaCot,fechaInput||null,ciudad,clienteId,empresa,contacto,cargo,email,
         telefono,firmanteCargo,notaInterna,total||0,estado||'creado',creadoPor,cotId]
      );
      await client.query('DELETE FROM cotizacion_servicios WHERE cotizacion_id=$1',[cotId]);
      await client.query('DELETE FROM cotizacion_consideraciones WHERE cotizacion_id=$1',[cotId]);
      await client.query('DELETE FROM cotizacion_columnas WHERE cotizacion_id=$1',[cotId]);
      await client.query(
        'INSERT INTO cotizacion_timeline(cotizacion_id,texto,fecha) VALUES($1,$2,$3)',
        [cotId,'Modificado por '+creadoPor,ahora]
      );
    } else {
      const ins = await client.query(
        `INSERT INTO cotizaciones(cot_num,fecha_cot,fecha_input,ciudad,cliente_id,empresa,
         contacto,cargo,email,telefono,firmante_cargo,nota_interna,total,estado,creado_por)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [cotNum,fechaCot,fechaInput||null,ciudad,clienteId,empresa,contacto,cargo,
         email,telefono,firmanteCargo,notaInterna,total||0,estado||'creado',creadoPor]
      );
      cotId = ins.rows[0].id;
      await client.query(
        'INSERT INTO cotizacion_timeline(cotizacion_id,texto,fecha) VALUES($1,$2,$3)',
        [cotId,'Creado por '+creadoPor,ahora]
      );
    }

    if (servicios && servicios.length) {
      for (let i=0;i<servicios.length;i++) {
        const s=servicios[i];
        await client.query(
          'INSERT INTO cotizacion_servicios(cotizacion_id,orden,codigo,nombre,descripcion,imagen_url,tarifa) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [cotId,i,s.cod||'',s.nom||'',s.desc||'',s.img||'',s.tar||0]
        );
      }
    }

    if (consideraciones && consideraciones.length) {
      for (let i=0;i<consideraciones.length;i++) {
        await client.query(
          'INSERT INTO cotizacion_consideraciones(cotizacion_id,orden,texto) VALUES($1,$2,$3)',
          [cotId,i,consideraciones[i]]
        );
      }
    }

    if (columnas) {
      await client.query(
        'INSERT INTO cotizacion_columnas(cotizacion_id,col_item,col_codigo,col_servicio,col_descripcion,col_imagen,col_tarifa) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [cotId,!!columnas.item,!!columnas.codigo,!!columnas.servicio,!!columnas.desc,!!columnas.imagen,!!columnas.tarifa]
      );
    }

    await client.query('COMMIT');
    res.json({ ok:true, id:cotId });

  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Error /api/cotizacion/guardar:',e.message);
    res.status(500).json({ ok:false, error:e.message });
  } finally {
    client.release();
  }
});

// GET /api/cotizacion/listar
app.get('/api/cotizacion/listar', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id,cot_num,fecha_cot,empresa,contacto,total,estado,creado_por,creado_en,modificado_en
       FROM cotizaciones ORDER BY creado_en DESC`
    );
    const rows = r.rows;
    for (const cot of rows) {
      const tl = await pool.query(
        'SELECT texto,fecha FROM cotizacion_timeline WHERE cotizacion_id=$1 ORDER BY creado_en',[cot.id]
      );
      cot.timeline = tl.rows;
    }
    res.json({ ok:true, data:rows });
  } catch(e) {
    console.error('Error /api/cotizacion/listar:',e.message);
    res.status(500).json({ ok:false, error:e.message });
  }
});

// GET /api/cotizacion/ver/:id
app.get('/api/cotizacion/ver/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const r = await pool.query('SELECT * FROM cotizaciones WHERE id=$1',[id]);
    if (!r.rows.length) return res.status(404).json({ ok:false, error:'No encontrada' });
    const cot = r.rows[0];
    const servs = await pool.query('SELECT * FROM cotizacion_servicios WHERE cotizacion_id=$1 ORDER BY orden',[id]);
    const cons  = await pool.query('SELECT * FROM cotizacion_consideraciones WHERE cotizacion_id=$1 ORDER BY orden',[id]);
    const cols  = await pool.query('SELECT * FROM cotizacion_columnas WHERE cotizacion_id=$1',[id]);
    const tl    = await pool.query('SELECT * FROM cotizacion_timeline WHERE cotizacion_id=$1 ORDER BY creado_en',[id]);
    res.json({ ok:true, data:{...cot, servicios:servs.rows, consideraciones:cons.rows, columnas:cols.rows[0]||null, timeline:tl.rows }});
  } catch(e) {
    console.error('Error /api/cotizacion/ver:',e.message);
    res.status(500).json({ ok:false, error:e.message });
  }
});

// DELETE /api/cotizacion/:id
app.delete('/api/cotizacion/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM cotizacion_servicios WHERE cotizacion_id=$1',[id]);
    await pool.query('DELETE FROM cotizacion_consideraciones WHERE cotizacion_id=$1',[id]);
    await pool.query('DELETE FROM cotizacion_columnas WHERE cotizacion_id=$1',[id]);
    await pool.query('DELETE FROM cotizacion_timeline WHERE cotizacion_id=$1',[id]);
    await pool.query('DELETE FROM cotizaciones WHERE id=$1',[id]);
    res.json({ ok:true });
  } catch(e) {
    console.error('Error DELETE /api/cotizacion:',e.message);
    res.status(500).json({ ok:false, error:e.message });
  }
});

// PATCH /api/cotizacion/estado
app.patch('/api/cotizacion/estado', async (req, res) => {
  const { id, estado, usuario } = req.body;
  try {
    await pool.query(
      'UPDATE cotizaciones SET estado=$1,modificado_por=$2,modificado_en=NOW() WHERE id=$3',
      [estado,usuario,id]
    );
    const ahora = new Date().toLocaleString('es-PE');
    await pool.query(
      'INSERT INTO cotizacion_timeline(cotizacion_id,texto,fecha) VALUES($1,$2,$3)',
      [id,'Estado cambiado a "'+estado+'" por '+usuario,ahora]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('Error PATCH /api/cotizacion/estado:',e.message);
    res.status(500).json({ ok:false, error:e.message });
  }
});

// ── Genera HTML de la landing page ────────────────────────────────────────────

function generarLandingHTML(d) {
  const LOGO     = 'https://res.cloudinary.com/dmuj4p26r/image/upload/v1774045127/Blue_Negativo_eztxez.png';
  const LOGO_HDR = 'https://res.cloudinary.com/dmuj4p26r/image/upload/v1774045127/Blue_Negativo_eztxez.png';
  const PHOTOS   = [
    'https://res.cloudinary.com/dmuj4p26r/image/upload/v1774041183/ips_lv02je.png',
    'https://res.cloudinary.com/dmuj4p26r/image/upload/v1774041183/cuaderno_b2bfk3.png',
    'https://res.cloudinary.com/dmuj4p26r/image/upload/v1774041184/pc_cpwtrr.png',
    'https://res.cloudinary.com/dmuj4p26r/image/upload/v1774041183/paco_maxtut.png',
    'https://res.cloudinary.com/dmuj4p26r/image/upload/v1774041184/cel_aennen.png'
  ];

  const photosCells = PHOTOS.map(url =>
    `<div style="flex:1;min-width:0;overflow:hidden;">
       <img src="${url}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">
     </div>`
  ).join('');

  const cols = d.cols || { item:true, codigo:true, servicio:true, desc:true, imagen:false, tarifa:true };

  const thS = 'background:#4EB5EF;color:#fff;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;padding:11px 12px;border:1px solid #3aa0d8;vertical-align:middle;';
  const theadRow = `<tr>
    ${cols.item     ? `<th style="${thS}text-align:center;width:36px;">#</th>` : ''}
    ${cols.codigo   ? `<th style="${thS}">Código</th>` : ''}
    ${cols.servicio ? `<th style="${thS}">Servicio</th>` : ''}
    ${cols.desc     ? `<th style="${thS}">Descripción</th>` : ''}
    ${cols.imagen   ? `<th style="${thS}text-align:center;width:110px;">Imagen</th>` : ''}
    ${cols.tarifa   ? `<th style="${thS}text-align:right;white-space:nowrap;">Tarifa</th>` : ''}
  </tr>`;

  let colCount = [cols.item, cols.codigo, cols.servicio, cols.desc, cols.imagen, cols.tarifa].filter(Boolean).length;

  const rows = (d.items || []).map((it, idx) => {
    const bg  = idx % 2 === 1 ? '#f5f9fd' : '#ffffff';
    const tar = it.tar || it.total || 0;
    return `<tr>
      ${cols.item     ? `<td style="background:${bg};padding:11px 12px;border:1px solid #4EB5EF;font-weight:700;font-size:12px;color:#000;text-align:center;vertical-align:top;">${it.num||idx+1}</td>` : ''}
      ${cols.codigo   ? `<td style="background:${bg};padding:11px 12px;border:1px solid #4EB5EF;font-size:10px;color:#1a75b8;font-weight:700;vertical-align:top;white-space:nowrap;">${esc(it.cod||'')}</td>` : ''}
      ${cols.servicio ? `<td style="background:${bg};padding:11px 12px;border:1px solid #4EB5EF;font-weight:700;font-size:11px;text-transform:uppercase;color:#000;vertical-align:top;line-height:1.4;">${esc(it.nom||'')}</td>` : ''}
      ${cols.desc     ? `<td style="background:${bg};padding:11px 12px;border:1px solid #4EB5EF;font-size:10.5px;color:#333;vertical-align:top;line-height:1.55;white-space:pre-line;">${esc(it.desc||'')}</td>` : ''}
      ${cols.imagen   ? `<td style="background:${bg};padding:11px 12px;border:1px solid #4EB5EF;text-align:center;vertical-align:top;">${it.img ? `<img src="${it.img}" style="max-width:90px;max-height:70px;border-radius:4px;display:block;margin:0 auto;">` : '<span style="font-size:10px;color:#aaa;">—</span>'}</td>` : ''}
      ${cols.tarifa   ? `<td style="background:${bg};padding:11px 12px;border:1px solid #4EB5EF;font-weight:700;font-size:12px;color:#000;text-align:right;vertical-align:top;white-space:nowrap;">S/${fmt(tar)}</td>` : ''}
    </tr>`;
  }).join('');

  const consItems = (d.consideraciones || '').split('\n').filter(l => l.trim())
    .map(l => `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
      <span style="color:#4EB5EF;font-weight:700;font-size:12px;flex-shrink:0;margin-top:1px;">-</span>
      <span style="font-size:11px;line-height:1.55;color:#222;">${esc(l.replace(/^[•\-*]\s*/, ''))}</span>
    </div>`)
    .join('');

  const cargoHtml = d.cargo
    ? `<p style="font-size:11px;color:#555;margin:1px 0 8px;font-family:Montserrat,Arial,sans-serif;">${esc(d.cargo)}</p>`
    : `<div style="margin-bottom:8px;"></div>`;
  const firmCargoHtml = d.firmanteCargo
    ? `<p style="font-size:10px;color:#555;margin:2px 0 0;">${esc(d.firmanteCargo)}</p>` : '';

  const waText   = encodeURIComponent('Hola, tengo una consulta sobre la cotización Cot. ' + (d.cotNum||''));
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
body{font-family:Montserrat,Arial,sans-serif;background:#d8e3ee;color:#222;}
a{text-decoration:none;color:inherit;}
.page{max-width:800px;margin:20px auto 40px;background:#fff;box-shadow:0 6px 40px rgba(0,0,0,0.15);}
.hdr{display:flex;align-items:stretch;min-height:110px;border-bottom:3px solid #4EB5EF;}
.hdr-logo{background:#4EB5EF;padding:14px 18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;width:160px;}
.hdr-photos{flex:1;display:flex;overflow:hidden;}
.cli{padding:16px 28px 6px;}
.cli-empresa{font-size:14px;font-weight:700;color:#000;line-height:1.3;margin-bottom:1px;}
.cli-contacto{font-size:13px;font-weight:600;color:#000;line-height:1.3;margin-bottom:1px;}
.cli-fecha{font-size:11px;color:#444;line-height:1.3;margin-bottom:3px;}
.cli-cotnum{font-size:12px;font-weight:700;color:#000;display:inline-block;border-bottom:2px solid #aaa;padding-bottom:2px;margin-top:4px;}
.svc-wrap{padding:10px 28px 0;}
.svc-franja{background:#4EB5EF;padding:12px 28px 11px;margin-bottom:10px;}
.svc-franja-title{color:#fff;font-weight:800;font-size:13px;text-align:center;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;font-family:Montserrat,Arial,sans-serif;}
.svc-franja-sub{color:#fff;font-size:9.5px;font-style:italic;text-align:center;opacity:0.95;line-height:1.5;font-family:Montserrat,Arial,sans-serif;}
.svc-table-wrap{border:2px solid #4EB5EF;border-radius:12px;overflow:hidden;margin-bottom:14px;}
.svc-table{width:100%;border-collapse:collapse;font-family:Montserrat,Arial,sans-serif;}
.cons-wrap{padding:0 28px 6px;}
.cons-title{font-weight:700;font-size:11px;color:#4EB5EF;text-decoration:underline;margin-bottom:8px;font-family:Montserrat,Arial,sans-serif;}
.cierre{padding:0 28px 16px;}
.firma-name{font-weight:700;color:#4EB5EF;font-size:13px;margin-top:2px;font-family:Montserrat,Arial,sans-serif;}
.cta-section{background:#f0f6fc;border-top:3px solid #4EB5EF;padding:18px 28px;text-align:center;}
.btn-wa{display:inline-block;background:#25d366;color:#fff;font-weight:700;font-size:13px;padding:11px 26px;border-radius:7px;margin:5px;font-family:Montserrat,Arial,sans-serif;}
.btn-mail{display:inline-block;background:#4EB5EF;color:#fff;font-weight:700;font-size:13px;padding:11px 26px;border-radius:7px;margin:5px;font-family:Montserrat,Arial,sans-serif;}
.ftr-social{background:#fff;border-top:1px solid #dde5ef;padding:10px 28px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.ftr-icon{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;background:#0f2744;}
.ftr-icon:hover{background:#4EB5EF;}
.ftr-main{background:#4EB5EF;padding:14px 28px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;}
.ftr-info{font-size:9.5px;color:#fff;line-height:2;font-weight:600;font-family:Montserrat,Arial,sans-serif;}
.ftr-banks{display:flex;flex-direction:column;gap:8px;align-items:flex-end;}
.bank-row{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.18);border-radius:8px;padding:6px 12px;}
.bank-data{font-size:9px;font-weight:600;color:#fff;line-height:1.6;text-align:right;}
@media(max-width:600px){
  .hdr-logo{width:120px;padding:10px 12px;}
  .cli,.svc-wrap,.cons-wrap,.cierre,.cta-section,.ftr-social{padding-left:16px;padding-right:16px;}
  .ftr-main{flex-direction:column;}
  .ftr-banks{align-items:flex-start;}
  .bank-row{flex-wrap:wrap;}
  .btn-wa,.btn-mail{display:block;width:100%;margin:4px 0;}
  table{font-size:10px;}
}
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <div class="hdr-logo">
      <img src="${LOGO_HDR}" style="max-height:82px;max-width:130px;width:auto;height:auto;display:block;" alt="Blue Comunicadores">
    </div>
    <div class="hdr-photos">${photosCells}</div>
  </div>
  <div class="cli">
    <p class="cli-empresa">${esc(d.empresa)}</p>
    <p class="cli-contacto">${esc(d.contacto)}</p>
    ${cargoHtml}
    <p class="cli-fecha">${esc(d.ciudad||'Lima')}, ${esc(d.fecha)}</p>
    <span class="cli-cotnum">Cot. ${esc(d.cotNum)}</span>
  </div>
  <div class="svc-franja">
    <p class="svc-franja-title">PRESUPUESTO DE SERVICIO</p>
    <p class="svc-franja-sub">La presente comunicación busca hacerle llegar nuestros costos de las soluciones solicitadas a continuación:</p>
  </div>
  <div class="svc-wrap">
    <div class="svc-table-wrap">
      <table class="svc-table">
        <thead>${theadRow}</thead>
        <tbody>
          ${rows}
          <tr>
            ${cols.tarifa ? `<td colspan="${colCount - 1}" style="background:#4EB5EF;padding:11px 12px;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#fff;text-align:right;border:1px solid #3aa0d8;">TOTAL</td>
            <td style="background:#4EB5EF;padding:11px 12px;font-weight:800;font-size:14px;color:#fff;text-align:right;border:1px solid #3aa0d8;white-space:nowrap;">S/${fmt(d.total)}</td>`
            : `<td colspan="${colCount}" style="background:#4EB5EF;padding:11px 12px;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#fff;text-align:right;border:1px solid #3aa0d8;">TOTAL: S/${fmt(d.total)}</td>`}
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  ${consItems ? `<div class="cons-wrap">
    <p class="cons-title">CONSIDERACIONES:</p>
    <div style="margin-bottom:12px;">${consItems}</div>
  </div>` : ''}
  <div class="cierre">
    <p style="font-size:10.5px;margin-bottom:10px;color:#000;line-height:1.6;">Estamos seguros de poder ofrecerle un servicio de calidad; quedamos a la espera de cualquier consulta o inquietud, sin otro particular.</p>
    <p style="font-size:10.5px;margin-bottom:4px;color:#000;">Atentamente,</p>
    <div style="height:44px;"></div>
    <p class="firma-name">${esc(d.firmante||'ZARA ARKA')}</p>
    ${firmCargoHtml}
  </div>
  <div class="cta-section">
    <p style="font-size:12px;color:#555;margin-bottom:14px;">¿Tienes alguna consulta sobre esta cotización?</p>
    <a class="btn-wa" href="https://wa.me/51${esc(d.whatsapp||'985568329')}?text=${waText}">💬 WhatsApp</a>
    <a class="btn-mail" href="mailto:automatizacion@bluecomunicadores.com?subject=${mailSubj}">✉️ Enviar correo</a>
  </div>
  <div class="ftr-social">
    <a class="ftr-icon" href="https://www.tiktok.com/@bluecomunicadores" target="_blank" title="TikTok">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.78a4.85 4.85 0 01-1.01-.09z"/></svg>
    </a>
    <a class="ftr-icon" href="https://www.instagram.com/bluecomunicadores" target="_blank" title="Instagram">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
    </a>
    <a class="ftr-icon" href="https://www.facebook.com/share/17Fw4Ac97v/" target="_blank" title="Facebook">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
    </a>
    <a class="ftr-icon" href="https://www.linkedin.com/company/bluecomunicadores/" target="_blank" title="LinkedIn">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
    </a>
    <a href="https://www.bluecomunicadores.com" target="_blank" style="font-size:10px;font-weight:700;color:#0f2744;letter-spacing:0.5px;margin-left:6px;text-decoration:underline;">WWW.BLUECOMUNICADORES.COM</a>
  </div>
  <div class="ftr-main">
    <div class="ftr-info">
      Calle Las Acacias 270 Miraflores · Lima, Perú<br>
      C +51 985 568 329<br>
      automatizacion@bluecomunicadores.com<br>
      administracion@bluecomunicadores.com
    </div>
    <div class="ftr-banks">
      <div class="bank-row">
        <div class="bank-data">BCP · Cuenta Soles<br>194-7124953020</div>
      </div>
      <div class="bank-row">
        <div class="bank-data">BBVA · Cta. Dólares 0011-0317020033771250<br>BBVA · Cta. Soles 0011-0876-0200016193-01</div>
      </div>
    </div>
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
      <tr><td style="background:#4EB5EF;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
        <img src="https://res.cloudinary.com/dmuj4p26r/image/upload/v1774045127/Blue_Negativo_eztxez.png" alt="Blue Comunicadores" style="height:120px;width:auto;display:block;margin:0 auto 14px;">
        <p style="margin:0;font-size:14px;color:#fff;font-weight:600;opacity:.9;">Tu cotización está lista</p>
      </td></tr>
      <tr><td style="background:#fff;padding:36px 40px;">
        <p style="font-size:16px;color:#2d3748;margin:0 0 8px;">Hola, <strong>${esc(d.contacto || d.empresa)}</strong></p>
        <p style="font-size:14px;color:#4a5568;line-height:1.7;margin:0 0 24px;">
          Gracias por su interés en nuestros servicios. Adjuntamos la cotización
          <strong>COT-${esc(d.cotNum)}</strong> preparada especialmente para <strong>${esc(d.empresa)}</strong>.
        </p>
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
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr><td align="center">
            <a href="${landingUrl}" style="display:inline-block;background:#4EB5EF;color:#fff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:10px;text-decoration:none;letter-spacing:0.3px;">
              Ver tu cotización completa →
            </a>
          </td></tr>
        </table>
        <p style="font-size:13px;color:#9aa3b0;text-align:center;margin:0 0 4px;">O copia este enlace en tu navegador:</p>
        <p style="font-size:12px;color:#1e6fb5;text-align:center;margin:0;word-break:break-all;">${landingUrl}</p>
      </td></tr>
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

app.post('/enviar-cotizacion', async (req, res) => {
  try {
    const { cotData, toEmail } = req.body;
    if (!cotData || !toEmail) {
      return res.status(400).json({ ok: false, error: 'Falta cotData o toEmail' });
    }

    const safeId      = ('COT_' + (cotData.cotNum || 'x')).replace(/[^a-zA-Z0-9_-]/g, '_');
    const landingHtml = generarLandingHTML(cotData);
    const landingUrl  = await guardarEnGitHub(safeId, landingHtml);

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

    res.json({ ok: true, url: landingUrl });

  } catch (e) {
    console.error('Error /enviar-cotizacion:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /guardar-cotizacion ──────────────────────────────────────────────────

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
<title>Página no encontrada</title>
<style>body{font-family:Arial,sans-serif;background:#0f2744;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.box{background:#fff;border-radius:16px;padding:48px 40px;text-align:center;max-width:400px;}
h2{color:#0f2744;font-size:20px;margin-bottom:8px;}p{color:#9aa3b0;font-size:14px;}</style>
</head><body><div class="box"><h2>Cotización no encontrada</h2>
<p>Este enlace puede haber expirado o el ID no existe.</p></div></body></html>`);
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
