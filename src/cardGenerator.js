const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

const WIDTH = 1080;
const HEIGHT = 1350;

function limpar(v) {
  return String(v ?? '').replace(/^=/, '').trim();
}

function normalizarNumero(v) {
  if (v === null || v === undefined || v === '') return 0;
  let s = limpar(v).replace(/R\$/gi, '').replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function moeda(v) {
  const n = normalizarNumero(v);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeXml(s) {
  return limpar(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(s) {
  return limpar(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'produto';
}

function linhas(texto, maxChars = 22, maxLines = 3) {
  const words = limpar(texto).split(/\s+/).filter(Boolean);
  const out = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (test.length > maxChars && line) {
      out.push(line);
      line = w;
      if (out.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && out.length < maxLines) out.push(line);
  return out;
}

function extrairSpecs(produto, categoria) {
  const p = limpar(produto);
  const specs = [];
  const storage = p.match(/(\d+\s?(gb|tb))/i)?.[1];
  const ram = p.match(/(\d+\s?gb)\s*ram/i)?.[1];
  const camera = p.match(/(\d+\s?mp)/i)?.[1];
  const tela = p.match(/(\d+[,.]?\d*)\s?(pol|polegadas|\")/i)?.[1];

  if (/cel|smartphone|iphone|galaxy/i.test(categoria + ' ' + p)) {
    if (camera) specs.push(`Câmera de ${camera.toUpperCase()}`);
    if (tela) specs.push(`Tela ${tela.replace('.', ',')}”`);
    if (ram || storage) specs.push(`${ram ? ram.toUpperCase() + ' RAM' : ''}${ram && storage ? ' • ' : ''}${storage ? storage.toUpperCase() : ''}`);
  }
  if (!specs.length) {
    if (storage) specs.push(`Armazenamento: ${storage.toUpperCase()}`);
    if (camera) specs.push(`Câmera: ${camera.toUpperCase()}`);
  }
  return specs.slice(0, 3);
}

async function baixarImagem(url) {
  url = limpar(url);
  if (!/^https?:\/\//i.test(url)) throw new Error('ImagemProduto inválida: ' + url);
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 25000,
    headers: { 'User-Agent': 'Mozilla/5.0 PromoTcheBot/2.0' }
  });
  return Buffer.from(r.data);
}

async function gerarCard(dados, baseUrl = '') {
  const produtoCompleto = limpar(dados.produto);
  const titulo = limpar(dados.tituloCard) || produtoCompleto;
  const marca = limpar(dados.marca).toUpperCase();
  const categoriaRaw = limpar(dados.categoria);
  const categoria = categoriaRaw ? categoriaRaw.toUpperCase() : 'OFERTA';
  const precoAtualN = normalizarNumero(dados.precoAtual);
  const precoAntigoN = normalizarNumero(dados.precoAntigo);
  const desconto = Math.max(0, Math.round(normalizarNumero(dados.desconto)));
  const cupom = limpar(dados.cupom) || 'OFERTA';
  const economia = Math.max(0, precoAntigoN - precoAtualN);
  const specs = categoriaRaw ? extrairSpecs(produtoCompleto, categoriaRaw) : [];

  const productBuffer = await baixarImagem(dados.imagemProduto);
  const produtoPng = await sharp(productBuffer)
    .resize(450, 470, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  const produtoBase64 = produtoPng.toString('base64');

  const tituloLines = linhas(titulo.toUpperCase(), 18, 3);
  const tituloSvg = tituloLines.map((l, i) =>
    `<text x="70" y="${410 + i * 58}" font-size="52" font-weight="900" fill="#111">${escapeXml(l)}</text>`
  ).join('');
  const specsSvg = specs.length ? specs.map((s, i) =>
    `<text x="88" y="${610 + i * 50}" font-size="28" font-weight="700" fill="#333">• ${escapeXml(s)}</text>`
  ).join('') : `<text x="88" y="610" font-size="30" font-weight="700" fill="#333">Oferta selecionada Promo Tchê</text>`;

  const svg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#050505"/>
        <stop offset="0.55" stop-color="#111"/>
        <stop offset="1" stop-color="#ffcc00"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity="0.28"/>
      </filter>
    </defs>

    <rect width="1080" height="1350" fill="url(#bg)"/>

    <path d="M0,0 H1080 V205 Q720,180 0,205 Z" fill="#ffcc00"/>
    <text x="260" y="92" font-size="66" font-family="Arial Black, Arial" font-weight="900" font-style="italic" fill="#111">PROMO TCHÊ</text>
    <rect x="300" y="118" width="420" height="42" rx="21" fill="#060606"/>
    <text x="342" y="147" font-size="24" font-weight="800" fill="#fff">OFERTAS TODOS OS DIAS!</text>
    <circle cx="120" cy="100" r="76" fill="#070707" stroke="#ffcc00" stroke-width="4"/>
    <text x="78" y="86" font-size="28" font-weight="800" fill="#fff">PROMO</text>
    <text x="82" y="124" font-size="34" font-weight="900" fill="#ffcc00">TCHÊ</text>

    <path d="M835,0 H1080 V190 L950,155 L835,190 Z" fill="#e50914"/>
    <text x="895" y="75" font-size="38" font-weight="900" fill="#fff">OFERTA</text>
    <text x="870" y="125" font-size="42" font-weight="900" fill="#ffcc00">RELÂMPAGO</text>

    <rect x="40" y="225" width="1000" height="875" rx="34" fill="#fff" stroke="#ffcc00" stroke-width="6" filter="url(#shadow)"/>

    <rect x="70" y="280" width="195" height="48" rx="10" fill="#ffcc00"/>
    <text x="96" y="313" font-size="30" font-weight="900" fill="#111">${escapeXml(categoria)}</text>

    ${marca ? `<text x="70" y="380" font-size="34" font-weight="800" fill="#777">${escapeXml(marca)}</text>` : ''}
    ${tituloSvg}
    <line x1="70" y1="570" x2="430" y2="570" stroke="#ffcc00" stroke-width="6"/>
    ${specsSvg}

    <image href="data:image/png;base64,${produtoBase64}" x="560" y="330" width="420" height="470" preserveAspectRatio="xMidYMid meet"/>

    ${desconto ? `<circle cx="930" cy="300" r="76" fill="#08a31b" stroke="#fff" stroke-width="9" filter="url(#shadow)"/>
      <text x="887" y="285" font-size="50" font-weight="900" fill="#fff">${desconto}%</text>
      <text x="884" y="342" font-size="50" font-weight="900" fill="#ffcc00">OFF</text>` : ''}

    <rect x="70" y="835" width="940" height="220" rx="25" fill="#070707"/>
    <line x1="600" y1="865" x2="600" y2="1030" stroke="#777" stroke-dasharray="8 8" stroke-width="2"/>

    <text x="110" y="900" font-size="34" font-weight="900" fill="#fff">DE:</text>
    <text x="205" y="900" font-size="42" font-weight="900" fill="#bdbdbd" text-decoration="line-through">${moeda(precoAntigoN)}</text>
    <text x="110" y="970" font-size="34" font-weight="900" fill="#ff1c1c">POR:</text>
    <text x="205" y="980" font-size="66" font-weight="900" fill="#ffcc00">${moeda(precoAtualN)}</text>
    ${economia ? `<rect x="110" y="1003" width="390" height="50" rx="12" fill="#e50914"/>
      <text x="135" y="1037" font-size="29" font-weight="900" fill="#ffcc00">ECONOMIZE ${moeda(economia)}</text>` : ''}

    <text x="650" y="900" font-size="34" font-weight="900" fill="#fff">USE O CUPOM:</text>
    <rect x="650" y="930" width="320" height="82" rx="16" fill="#e50914" stroke="#fff" stroke-dasharray="8 7" stroke-width="4"/>
    <text x="675" y="983" font-size="34" font-weight="900" fill="#ffcc00">${escapeXml(cupom).slice(0, 16)}</text>

    <rect x="70" y="1150" width="690" height="50" rx="25" fill="#080808" opacity="0.95"/>
    <text x="105" y="1184" font-size="28" font-weight="900" fill="#fff">LINK NA BIO • OFERTAS TODOS OS DIAS</text>
    <rect x="760" y="1125" width="250" height="82" rx="22" fill="#ffcc00"/>
    <text x="788" y="1160" font-size="26" font-weight="900" fill="#111">CORRE QUE É</text>
    <text x="788" y="1193" font-size="26" font-weight="900" fill="#111">POR TEMPO LIMITADO!</text>
  </svg>`;

  const outDir = path.join(__dirname, '..', 'generated', 'cards');
  fs.mkdirSync(outDir, { recursive: true });
  const arquivo = `${Date.now()}-${slugify(titulo)}.jpg`;
  const caminho = path.join(outDir, arquivo);

  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(caminho);

  const publicUrl = `${limpar(baseUrl).replace(/\/$/, '')}/cards/${arquivo}`;
  return { ok: true, arquivo, imagemCard: publicUrl, caminho };
}

module.exports = { gerarCard };
