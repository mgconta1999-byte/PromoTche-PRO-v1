const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");

const WIDTH = 1080;
const HEIGHT = 1350;

function limpar(v) {
  if (v === undefined || v === null) return "";
  return String(v).replace(/^=/, "").trim();
}

function numeroBR(v) {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).replace(/^=/, "").replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function moeda(v) {
  return numeroBR(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function economia(precoAntigo, precoAtual) {
  const e = numeroBR(precoAntigo) - numeroBR(precoAtual);
  return e > 0 ? moeda(e) : "";
}

function normalizarCategoria(categoria, produto) {
  const t = `${limpar(categoria)} ${limpar(produto)}`.toLowerCase();
  if (t.match(/celular|smartphone|iphone|galaxy|motorola|xiaomi|redmi|samsung/)) return "celular";
  if (t.match(/notebook|laptop|macbook/)) return "notebook";
  if (t.match(/tv|smart tv|televis/)) return "tv";
  if (t.match(/geladeira|refrigerador|frost free|inverse/)) return "geladeira";
  if (t.match(/arm[aá]rio|guarda.?roupa|sof[aá]|mesa|cadeira|cama|rack|painel/)) return "moveis";
  if (t.match(/fog[aã]o|micro.?ondas|lavadora|m[aá]quina de lavar|air fryer|forno|ar condicionado/)) return "eletro";
  return "generico";
}

function quebrarTexto(texto, maxChars, maxLinhas = 3) {
  const words = limpar(texto).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = (line + " " + w).trim();
    if (test.length <= maxChars) line = test;
    else {
      if (line) lines.push(line);
      line = w;
    }
    if (lines.length === maxLinhas) break;
  }
  if (line && lines.length < maxLinhas) lines.push(line);
  return lines.slice(0, maxLinhas);
}

function tituloCurto(dados) {
  let t = limpar(dados.tituloCard) || limpar(dados.TituloCard) || limpar(dados.produto) || limpar(dados.Produto) || "Produto em oferta";
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > 52) {
    const palavras = t.split(" ");
    let out = "";
    for (const p of palavras) {
      if ((out + " " + p).trim().length > 52) break;
      out = (out + " " + p).trim();
    }
    t = out || t.slice(0, 52);
  }
  return t;
}

function extrairSpecs(produto, categoria) {
  const p = limpar(produto);
  const low = p.toLowerCase();
  const specs = [];
  const add = (label, regex) => { const m = p.match(regex); if (m && m[1]) specs.push(`${label}: ${m[1].trim().toUpperCase()}`); };
  if (categoria === "celular") {
    add("Armazenamento", /(\d+\s*(?:gb|tb))/i);
    add("Memória RAM", /(\d+\s*gb)\s*ram/i);
    add("Câmera", /(?:c[aâ]m(?:era)?(?: de)?\s*)(\d+\s*mp)/i);
    add("Tela", /(?:tela\s*)([\d,.]+\s*(?:pol|polegadas|["”]|'|super amoled|amoled|lcd|ips)[^,]*)/i);
    add("Bateria", /(\d{4,5}\s*mah)/i);
  } else if (categoria === "tv") {
    add("Tamanho", /(\d+\s*(?:pol|polegadas|["”]))/i);
    if (low.includes("4k")) specs.push("Resolução: 4K");
    if (low.includes("smart")) specs.push("Smart TV");
  } else if (categoria === "geladeira") {
    add("Capacidade", /(\d+\s*l(?:itros)?)/i);
    if (low.includes("frost free")) specs.push("Frost Free");
    if (low.includes("inverse")) specs.push("Inverse");
  } else if (categoria === "moveis") {
    add("Portas", /(\d+\s*portas?)/i);
    add("Gavetas", /(\d+\s*gavetas?)/i);
  }
  if (!specs.length) return quebrarTexto(p, 31, 3);
  return specs.slice(0, 4);
}

async function baixarImagem(url) {
  url = limpar(url);
  if (!url || !/^https?:\/\//i.test(url)) throw new Error(`URL da imagem inválida: ${url}`);
  const r = await axios.get(url, { responseType: "arraybuffer", timeout: 30000, headers: { "User-Agent": "Mozilla/5.0 PromoTcheBot/2.0", "Accept": "image/*,*/*;q=0.8" } });
  return Buffer.from(r.data);
}

async function carregarLogo() {
  const candidatos = [
    path.join(__dirname, "..", "assets", "logo-promotche.webp"),
    path.join(__dirname, "..", "assets", "logo.webp"),
    path.join(__dirname, "..", "assets", "logo.png"),
    path.join(__dirname, "assets", "logo-promotche.webp"),
    path.join(__dirname, "assets", "logo.webp"),
    path.join(__dirname, "assets", "logo.png"),
  ];
  for (const p of candidatos) {
    if (fs.existsSync(p)) {
      try { return await sharp(p).resize(190, 190, { fit: "contain" }).png().toBuffer(); } catch (e) {}
    }
  }
  return null;
}

function esc(s) {
  return limpar(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textLines(lines, x, y, size, weight = 900, fill = "#111", step = null) {
  step = step || Math.round(size * 1.12);
  return lines.map((l, i) => `<text x="${x}" y="${y + i * step}" font-size="${size}" font-weight="${weight}" fill="${fill}" font-family="Arial Black, Arial, Helvetica, sans-serif">${esc(l)}</text>`).join("\n");
}

function fitTitleFont(lines) {
  const maxLen = Math.max(...lines.map(l => l.length));
  if (maxLen > 20) return 48;
  if (maxLen > 15) return 56;
  return 64;
}

async function gerarCard(dados = {}) {
  const produto = limpar(dados.produto || dados.Produto);
  const categoria = normalizarCategoria(dados.categoria || dados.Categoria, produto);
  const marca = limpar(dados.marca || dados.Marca).toUpperCase();
  const titulo = tituloCurto(dados);
  const tituloLines = quebrarTexto(titulo.toUpperCase(), 16, 3);
  const specs = extrairSpecs(produto || titulo, categoria);
  const precoAtual = dados.precoAtual ?? dados.PrecoAtual;
  const precoAntigo = dados.precoAntigo ?? dados.PrecoAntigo;
  const desconto = limpar(dados.desconto ?? dados.Desconto);
  const cupom = limpar(dados.cupom ?? dados.Cupom);
  const imagemProduto = limpar(dados.imagemProduto || dados.ImagemProduto);
  const precoAtualFmt = moeda(precoAtual);
  const precoAntigoFmt = moeda(precoAntigo);
  const economiaFmt = economia(precoAntigo, precoAtual);
  const titleFont = fitTitleFont(tituloLines);
  const labelCategoria = categoria === "generico" ? "OFERTA" : categoria.toUpperCase();

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#050505"/><stop offset="58%" stop-color="#111"/><stop offset="100%" stop-color="#ffcc00"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.32"/></filter></defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <path d="M0,0 H1080 V230 C760,190 410,250 0,190 Z" fill="#ffcc00"/>
    <path d="M0,0 H245 C200,70 180,145 210,228 C120,215 55,202 0,190 Z" fill="#050505"/>
    <text x="270" y="88" font-size="72" font-weight="900" font-style="italic" fill="#080808" font-family="Arial Black, Arial">PROMO TCHÊ</text>
    <rect x="300" y="112" width="520" height="44" rx="22" fill="#050505"/>
    <text x="365" y="142" font-size="27" font-weight="800" fill="#fff" font-family="Arial">OFERTAS TODOS OS DIAS!</text>
    <path d="M850,0 H1080 V210 L965,165 L850,210 Z" fill="#e80016"/>
    <text x="895" y="76" font-size="44" font-weight="900" fill="#fff" font-family="Arial Black, Arial">OFERTA</text>
    <text x="875" y="126" font-size="40" font-weight="900" fill="#ffd000" font-family="Arial Black, Arial">RELÂMPAGO</text>
    <rect x="36" y="230" width="1008" height="860" rx="42" fill="#fff" filter="url(#shadow)"/>
    <rect x="54" y="248" width="972" height="824" rx="36" fill="#fff" stroke="#ffcc00" stroke-width="5"/>
    <rect x="520" y="320" width="455" height="540" rx="34" fill="#fff"/>
    <ellipse cx="750" cy="858" rx="180" ry="22" fill="#000" opacity="0.10"/>
    <rect x="84" y="315" width="190" height="46" rx="10" fill="#ffcc00"/>
    <text x="105" y="347" font-size="28" font-weight="900" fill="#111" font-family="Arial Black, Arial">${esc(labelCategoria)}</text>
    ${marca ? `<text x="84" y="418" font-size="34" font-weight="800" fill="#666" font-family="Arial">${esc(marca)}</text>` : ""}
    ${textLines(tituloLines, 84, marca ? 482 : 440, titleFont, 900, "#070707", Math.round(titleFont * 1.05))}
    <line x1="84" y1="675" x2="475" y2="675" stroke="#ffcc00" stroke-width="5"/>
    ${specs.map((s, i) => `<text x="84" y="730" dy="${i * 45}" font-size="30" font-weight="${i === 0 ? 800 : 600}" fill="#333" font-family="Arial">• ${esc(s)}</text>`).join("\n")}
    ${desconto ? `<circle cx="910" cy="320" r="78" fill="#0a9f23" stroke="#fff" stroke-width="8" filter="url(#shadow)"/><text x="910" y="305" text-anchor="middle" font-size="48" font-weight="900" fill="#fff" font-family="Arial Black, Arial">${esc(desconto)}%</text><text x="910" y="355" text-anchor="middle" font-size="44" font-weight="900" fill="#ffd000" font-family="Arial Black, Arial">OFF</text>` : ""}
    <rect x="68" y="910" width="944" height="220" rx="28" fill="#080808"/>
    <line x1="590" y1="940" x2="590" y2="1110" stroke="#666" stroke-dasharray="7 7" stroke-width="2"/>
    <text x="110" y="970" font-size="34" font-weight="900" fill="#ddd" font-family="Arial Black, Arial">DE:</text>
    <text x="205" y="970" font-size="38" font-weight="900" fill="#bfbfbf" text-decoration="line-through" font-family="Arial Black, Arial">${esc(precoAntigoFmt)}</text>
    <text x="110" y="1048" font-size="38" font-weight="900" fill="#ff1d25" font-family="Arial Black, Arial">POR:</text>
    <text x="210" y="1063" font-size="62" font-weight="900" fill="#ffd000" font-family="Arial Black, Arial">${esc(precoAtualFmt)}</text>
    ${economiaFmt ? `<rect x="110" y="1088" width="395" height="50" rx="10" fill="#e80016"/><text x="135" y="1123" font-size="30" font-weight="900" fill="#ffd000" font-family="Arial Black, Arial">ECONOMIZE ${esc(economiaFmt)}</text>` : ""}
    <text x="640" y="975" font-size="36" font-weight="900" fill="#fff" font-family="Arial Black, Arial">USE O CUPOM:</text>
    <rect x="640" y="1015" width="330" height="82" rx="14" fill="#e80016" stroke="#fff" stroke-width="3" stroke-dasharray="9 7"/>
    <text x="805" y="1068" text-anchor="middle" font-size="${cupom.length > 14 ? 30 : 38}" font-weight="900" fill="#ffd000" font-family="Arial Black, Arial">${esc(cupom || "OFERTA")}</text>
    <text x="95" y="1210" font-size="32" font-weight="800" fill="#fff" font-family="Arial">🔗 LINK NA LEGENDA • OFERTAS TODOS OS DIAS</text>
    <rect x="680" y="1164" width="320" height="82" rx="18" fill="#ffcc00"/>
    <text x="840" y="1197" text-anchor="middle" font-size="26" font-weight="900" fill="#111" font-family="Arial Black, Arial">CORRE QUE É</text>
    <text x="840" y="1230" text-anchor="middle" font-size="26" font-weight="900" fill="#111" font-family="Arial Black, Arial">POR TEMPO LIMITADO!</text>
  </svg>`;

  const produtoBuffer = await baixarImagem(imagemProduto);
  const produtoPng = await sharp(produtoBuffer).resize(430, 510, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  const composites = [{ input: Buffer.from(svg), top: 0, left: 0 }, { input: produtoPng, top: 350, left: 540 }];
  const logo = await carregarLogo();
  if (logo) composites.push({ input: logo, top: 28, left: 35 });
  else composites.push({ input: Buffer.from(`<svg width="190" height="190" xmlns="http://www.w3.org/2000/svg"><circle cx="95" cy="95" r="88" fill="#050505" stroke="#ffcc00" stroke-width="6"/><text x="95" y="80" text-anchor="middle" font-size="30" font-weight="900" fill="#fff" font-family="Arial Black">PROMO</text><text x="95" y="120" text-anchor="middle" font-size="36" font-weight="900" fill="#ffcc00" font-family="Arial Black">TCHÊ</text></svg>`), top: 28, left: 35 });

  const buffer = await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: "#ffffff" } }).composite(composites).jpeg({ quality: 92 }).toBuffer();
  const pasta = path.join(__dirname, "..", "generated", "cards");
  fs.mkdirSync(pasta, { recursive: true });
  const slug = titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "produto";
  const arquivo = `${Date.now()}-${slug}.jpg`;
  const caminho = path.join(pasta, arquivo);
  fs.writeFileSync(caminho, buffer);
  return { ok: true, arquivo, caminho };
}

module.exports = { gerarCard };
