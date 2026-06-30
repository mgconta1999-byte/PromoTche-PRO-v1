const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

const WIDTH = 1080;
const HEIGHT = 1350;

function safe(v, fallback = '') {
  return (v === undefined || v === null ? fallback : String(v)).trim();
}

function slugify(text) {
  return safe(text, 'produto')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'produto';
}

function numberBR(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return numberBR(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeXml(str) {
  return safe(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function splitWords(text, maxChars = 16, maxLines = 2) {
  const words = safe(text).toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (test.length <= maxChars || !line) line = test;
    else { lines.push(line); line = w; }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

function detectCategoria(cat, produto) {
  const c = safe(cat).toLowerCase();
  const p = safe(produto).toLowerCase();
  if (c) return c;
  if (/celular|smartphone|galaxy|iphone|motorola|xiaomi/.test(p)) return 'celular';
  if (/tv|televis|smart tv/.test(p)) return 'tv';
  if (/notebook|laptop/.test(p)) return 'notebook';
  if (/geladeira|refrigerador|freezer/.test(p)) return 'geladeira';
  return 'oferta';
}

function categoriaLabel(cat) {
  const c = safe(cat).toLowerCase();
  if (c.includes('cel')) return 'CELULAR';
  if (c.includes('tv')) return 'TV';
  if (c.includes('note')) return 'NOTEBOOK';
  if (c.includes('gelad') || c.includes('refrig')) return 'GELADEIRA';
  if (c.includes('mov') || c.includes('arm')) return 'MÓVEIS';
  return 'OFERTA';
}

function getBullets(produto, categoria) {
  const p = safe(produto).toUpperCase();
  const cat = safe(categoria).toLowerCase();
  const bullets = [];

  const cam = p.match(/(\d+\s?MP)/i);
  const ram = p.match(/(\d+\s?GB)\s*RAM/i) || p.match(/RAM\s*(\d+\s?GB)/i);
  const storage = p.match(/(\d+\s?GB|\d+\s?TB)/i);
  const polegadas = p.match(/(\d{2,3})\s?("|POL|POLEGADAS)/i);
  const litros = p.match(/(\d{2,4})\s?L/i);

  if (cat.includes('cel')) {
    if (cam) bullets.push(`Câmera de ${cam[1].replace(/\s/g, '')}`);
    if (ram || storage) bullets.push(`${ram ? ram[1].replace(/\s/g, '') + ' RAM' : 'Ótimo desempenho'}${storage ? ' • ' + storage[1].replace(/\s/g, '') : ''}`);
  } else if (cat.includes('tv')) {
    if (polegadas) bullets.push(`Smart TV ${polegadas[1]}”`);
    bullets.push(p.includes('4K') ? 'Imagem 4K UHD' : 'Imagem de alta qualidade');
  } else if (cat.includes('gelad')) {
    if (litros) bullets.push(`${litros[1]} Litros`);
    bullets.push(p.includes('FROST') ? 'Frost Free' : 'Oferta para casa');
  } else {
    bullets.push('Oferta selecionada');
    bullets.push('Promoção por tempo limitado');
  }
  return bullets.slice(0, 2);
}

async function baixar(url) {
  const u = safe(url);
  if (!u) return null;
  const clean = u.replace(/^=+/, '').trim();
  const r = await axios.get(clean, {
    responseType: 'arraybuffer',
    timeout: 25000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  return Buffer.from(r.data);
}

async function logoComposite() {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'logo-promotche.webp'),
    path.join(__dirname, '..', 'assets', 'logo.webp'),
    path.join(__dirname, '..', 'assets', 'logo.png'),
    path.join(__dirname, '..', 'assets', 'promotche.png')
  ];
  const logoPath = candidates.find(fs.existsSync);
  if (!logoPath) return [];

  const size = 185;
  const inner = 171;
  const raw = await sharp(logoPath)
    .resize(inner, inner, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();

  const mask = Buffer.from(`<svg width="${inner}" height="${inner}" xmlns="http://www.w3.org/2000/svg"><circle cx="${inner/2}" cy="${inner/2}" r="${inner/2}" fill="white"/></svg>`);

  const clipped = await sharp({ create: { width: inner, height: inner, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: raw, left: 0, top: 0 }, { input: mask, left: 0, top: 0, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const base = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <filter id="s"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-opacity="0.35"/></filter>
    <circle cx="${size/2}" cy="${size/2}" r="${size/2-4}" fill="#050505" stroke="#ffcc00" stroke-width="5" filter="url(#s)"/>
  </svg>`);

  const finalLogo = await sharp(base)
    .composite([{ input: clipped, left: 7, top: 7 }])
    .png()
    .toBuffer();

  return [{ input: finalLogo, left: 28, top: 18 }];
}
function svgTemplate(d) {
  const produtoLines = splitWords(d.titulo, 15, 2);
  const marca = safe(d.marca, '').toUpperCase();
  const cat = categoriaLabel(d.categoria);
  const desconto = Math.max(0, Math.round(numberBR(d.desconto)));
  const precoAtual = money(d.precoAtual);
  const precoAntigo = money(d.precoAntigo);
  const economia = numberBR(d.precoAntigo) > numberBR(d.precoAtual) ? money(numberBR(d.precoAntigo) - numberBR(d.precoAtual)) : '';
  const cupom = safe(d.cupom, '').toUpperCase();
  const bullets = getBullets(d.produto, d.categoria);

  const titleSvg = produtoLines.map((l, i) => `<text x="70" y="${505 + i * 78}" class="produto">${escapeXml(l)}</text>`).join('');
  const bulletSvg = bullets.map((b, i) => `
    <circle cx="78" cy="${765 + i * 58}" r="8" fill="#ffcc00"/>
    <text x="105" y="${777 + i * 58}" class="bullet">${escapeXml(b)}</text>`).join('');

  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#030303"/><stop offset="0.65" stop-color="#060606"/><stop offset="1" stop-color="#ffd000"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-opacity="0.25"/></filter>
    <style>
      .topTitle{font-family:'DejaVu Sans Condensed','Liberation Sans Narrow',Arial,sans-serif;font-size:64px;font-style:italic;font-weight:900;fill:#050505;letter-spacing:0px}
      .white{font-family:'DejaVu Sans Condensed','Liberation Sans Narrow',Arial,sans-serif;font-weight:900;fill:white}
      .cat{font-family:'DejaVu Sans Condensed','Liberation Sans Narrow',Arial,sans-serif;font-size:32px;font-weight:900;fill:#050505}
      .marca{font-family:'DejaVu Sans Condensed','Liberation Sans Narrow',Arial,sans-serif;font-size:40px;font-weight:900;fill:#777;letter-spacing:1px}
      .produto{font-family:'DejaVu Sans Condensed','Liberation Sans Narrow',Arial,sans-serif;font-size:68px;font-weight:900;fill:#050505;letter-spacing:-1px}
      .bullet{font-family:'DejaVu Sans Condensed','Liberation Sans Narrow',Arial,sans-serif;font-size:31px;font-weight:900;fill:#080808}
      .price{font-family:'DejaVu Sans Condensed','Liberation Sans Narrow',Arial,sans-serif;font-size:74px;font-weight:900;fill:#ffd000;letter-spacing:-1px}
      .old{font-family:'DejaVu Sans Condensed','Liberation Sans Narrow',Arial,sans-serif;font-size:34px;font-weight:900;fill:#aaa}
      .small{font-family:'DejaVu Sans Condensed','Liberation Sans Narrow',Arial,sans-serif;font-size:31px;font-weight:900;fill:white}
      .red{fill:#f00010}.yellow{fill:#ffcc00}.black{fill:#050505}
    </style>
  </defs>

  <rect width="1080" height="1350" fill="url(#bg)"/>
  <path d="M205 0 H830 L775 210 H0 V0 Z" fill="#ffcc00"/>
  <text x="300" y="88" class="topTitle">PROMO TCHÊ</text>
  <rect x="300" y="122" width="470" height="48" rx="24" fill="#050505"/>
  <text x="350" y="156" class="white" font-size="28">OFERTAS TODOS OS DIAS!</text>
  <path d="M820 0 H1080 V215 L950 175 L820 215 Z" fill="#e90012"/>
  <text x="875" y="82" class="white" font-size="42">OFERTA</text>
  <text x="835" y="132" class="white" font-size="38" fill="#ffcc00">RELÂMPAGO</text>

  <rect x="30" y="235" width="1020" height="840" rx="42" fill="white" filter="url(#shadow)"/>
  <rect x="47" y="252" width="986" height="806" rx="33" fill="none" stroke="#ffcc00" stroke-width="5"/>

  <rect x="70" y="315" width="240" height="58" rx="9" fill="#ffcc00"/>
  <text x="118" y="354" class="cat">${escapeXml(cat)}</text>

  <text x="70" y="430" class="marca">${escapeXml(marca || 'PROMOÇÃO')}</text>
  ${titleSvg}
  <line x1="70" y1="680" x2="485" y2="680" stroke="#ffcc00" stroke-width="6"/>
  ${bulletSvg}

  <circle cx="905" cy="335" r="75" fill="#08af38" filter="url(#shadow)"/>
  <circle cx="905" cy="335" r="82" fill="none" stroke="white" stroke-width="10"/>
  <text x="858" y="326" class="white" font-size="44">${desconto || 0}%</text>
  <text x="867" y="374" class="white" font-size="38" fill="#ffcc00">OFF</text>

  <rect x="55" y="905" width="970" height="250" rx="24" fill="#050505"/>
  <line x1="610" y1="925" x2="610" y2="1135" stroke="#fff" stroke-width="2" stroke-dasharray="9 11" opacity="0.8"/>

  <text x="90" y="968" class="small">DE:</text>
  <text x="205" y="968" class="old">${escapeXml(precoAntigo)}</text>
  <line x1="200" y1="948" x2="410" y2="948" stroke="#f00010" stroke-width="5" transform="rotate(-6 305 948)"/>
  <text x="90" y="1038" class="small" fill="#f00010">POR:</text>
  <text x="220" y="1050" class="price">${escapeXml(precoAtual.replace('R$ ','R$ '))}</text>
  ${economia ? `<rect x="95" y="1088" width="430" height="58" rx="8" fill="#f00010"/><text x="130" y="1127" class="white" font-size="30">ECONOMIZE ${escapeXml(economia.replace('R$ ','R$ '))}</text>` : ''}

  <text x="675" y="968" class="small">USE O CUPOM:</text>
  <rect x="660" y="1006" width="340" height="94" rx="12" fill="#f00010" stroke="white" stroke-width="4" stroke-dasharray="10 8"/>
  <text x="830" y="1065" text-anchor="middle" class="white" font-size="32" fill="#ffcc00">${escapeXml(cupom || 'CONFIRA')}</text>

  <rect x="60" y="1192" width="600" height="58" rx="8" fill="#050505"/>
  <text x="360" y="1229" text-anchor="middle" class="white" font-size="25">LINK NA BIO • OFERTAS TODOS OS DIAS!</text>
  <rect x="680" y="1192" width="345" height="58" rx="9" fill="#ffcc00"/>
  <text x="852" y="1220" text-anchor="middle" class="cat" font-size="24">CORRE QUE É</text>
  <text x="852" y="1245" text-anchor="middle" class="cat" font-size="24">POR TEMPO LIMITADO!</text>
</svg>`;
}

async function gerarCard(dados = {}, baseUrl = '') {
  const produto = safe(dados.produto || dados.Produto);
  const titulo = safe(dados.tituloCard || dados.TituloCard || produto).replace(/^Samsung\s+/i, '').replace(/^Celular\s+/i, '');
  const categoria = detectCategoria(dados.categoria || dados.Categoria, produto);
  const marca = safe(dados.marca || dados.Marca || (produto.match(/Samsung|Apple|Motorola|Xiaomi|LG|Philco|Electrolux|Brastemp/i) || [''])[0]);
  const imagemProduto = safe(dados.imagemProduto || dados.ImagemProduto);
  const precoAtual = dados.precoAtual ?? dados.PrecoAtual;
  const precoAntigo = dados.precoAntigo ?? dados.PrecoAntigo;
  const desconto = dados.desconto ?? dados.Desconto;
  const cupom = dados.cupom ?? dados.Cupom;

  const cardsDir = path.join(__dirname, '..', 'generated', 'cards');
  fs.mkdirSync(cardsDir, { recursive: true });

  const nomeArquivo = `${Date.now()}-${slugify(titulo)}.jpg`;
  const caminho = path.join(cardsDir, nomeArquivo);

  const composites = [];
  composites.push(...await logoComposite());

  const productBuffer = await baixar(imagemProduto);
  if (productBuffer) {
    const product = await sharp(productBuffer)
      .resize(340, 395, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png().toBuffer();
    composites.push({ input: product, left: 615, top: 400 });
  }

  await sharp(Buffer.from(svgTemplate({ produto, titulo, categoria, marca, precoAtual, precoAntigo, desconto, cupom })))
    .composite(composites)
    .jpeg({ quality: 92 })
    .toFile(caminho);

  const publicBase = (baseUrl || process.env.BASE_URL || '').replace(/\/$/, '');
  const imagemCard = publicBase ? `${publicBase}/cards/${nomeArquivo}` : `/cards/${nomeArquivo}`;

  return {
    ok: true,
    imagemCard,
    arquivo: nomeArquivo,
    caminho,
    categoriaDetectada: categoria
  };
}

module.exports = { gerarCard };
