const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const slugify = require("slugify");
const { gerarCard } = require("./cardGenerator");
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const generatedDir = path.join(__dirname, "..", "generated");
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use("/cards", express.static(generatedDir));

app.get("/", (req, res) => res.json({ ok:true, app:"PromoTche PRO", rota:"POST /api/gerar-card" }));

app.post("/api/gerar-card", async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.produto || !d.imagemProduto) return res.status(400).json({ok:false, erro:"Informe produto e imagemProduto"});
    const slug = slugify(String(d.produto), {lower:true, strict:true}).slice(0,60) || "oferta";
    const filename = `${Date.now()}-${slug}.jpg`;
    const outputPath = path.join(generatedDir, filename);
    await gerarCard({
      produto:d.produto,
      precoAtual:d.precoAtual || d.PrecoAtual || "",
      precoAntigo:d.precoAntigo || d.PrecoAntigo || "",
      desconto:d.desconto || d.Desconto || "",
      cupom:d.cupom || d.Cupom || "",
      linkAfiliado:d.linkAfiliado || d.LinkAfiliado || "",
      imagemProduto:d.imagemProduto || d.ImagemProduto || "",
      outputPath
    });
    res.json({ok:true, imagemCard:`${BASE_URL}/cards/${filename}`, arquivo:filename});
  } catch(e) {
    console.error(e);
    res.status(500).json({ok:false, erro:e.message});
  }
});

app.listen(PORT, () => console.log(`PromoTche PRO rodando em ${BASE_URL}`));
