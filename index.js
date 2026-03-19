import express from "express";
import PDFDocument from "pdfkit";

const app = express();

app.use(express.json());

// Ruta base
app.get("/", (req, res) => {
  res.send("Servidor funcionando 🚀");
});

// 👉 NUEVA ruta PDF
app.post("/generar-pdf", (req, res) => {
  const { html, filename } = req.body;

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${filename || "archivo"}.pdf`
  );

  doc.pipe(res);

  // 👇 aquí puedes personalizar
  doc.fontSize(20).text(html || "PDF generado correctamente");

  doc.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});
