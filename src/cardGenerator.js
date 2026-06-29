const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

const WIDTH = 1080;
const HEIGHT = 1350;

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[m]));
}

function normalizarTexto(v) {
  return String(v ?? '').trim();
}

function limparUrl(url) {
  return normalizarTexto(url).replace(/^['"]+|['"]+$/g, '').trim();
}

function slug(texto) {
  return normalizarTexto(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'produto';
}

function moeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'number') {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  let s = String(valor).trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return String(valor);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function numero(valor) {
  if (typeof valor === 'number') return valor;
  let s = String(valor ?? '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function economia(precoAntigo, precoAtual) {
  const e = numero(precoAntigo) - numero(precoAtual);
  return e > 0 ? moeda(e) : '';
}

function descontoTexto(v) {
  const n = Math.round(numero(v));
  return n > 0 ? String(n) : '';
}

function categoriaTexto(cat) {
  const c = normalizarTexto(cat).toLowerCase();
  if (!c) return 'OFERTA';
  if (c.includes('cel') || c.includes('smart')) return 'CELULAR';
  if (c.includes('tv') || c.includes('tele')) return 'TV';
  if (c.includes('note') || c.includes('lap')) return 'NOTEBOOK';
  if (c.includes('geladeira') || c.includes('refriger')) return 'GELADEIRA';
  if (c.includes('move') || c.includes('móvel') || c.includes('arm')) return 'MÓVEIS';
  if (c.includes('ferrament')) return 'FERRAMENTA';
  return normalizarTexto(cat).toUpperCase().slice(0, 14);
}

function tituloPrincipal(dados) {
  const t = normalizarTexto(dados.tituloCard || dados.TituloCard || dados.produto || dados.Produto);
  let limpo = t
    .replace(/^celular\s+/i, '')
    .replace(/^smartphone\s+/i, '')
    .replace(/\bcom\s+ia\b/gi, '')
    .replace(/,.*$/g, '')
    .trim();
  const marca = normalizarTexto(dados.marca || dados.Marca);
  if (marca) limpo = limpo.replace(new RegExp('^' + marca, 'i'), '').trim();
  return limpo || t || 'Oferta Especial';
}

function quebrar(texto, maxPorLinha = 18, maxLinhas = 3) {
  const palavras = normalizarTexto(texto).split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (teste.length <= maxPorLinha || !atual) atual = teste;
    else {
      linhas.push(atual);
      atual = p;
    }
    if (linhas.length === maxLinhas) break;
  }
  if (linhas.length < maxLinhas && atual) linhas.push(atual);
  if (linhas.length > maxLinhas) linhas.length = maxLinhas;
  return linhas;
}

function textoSpecs(dados) {
  const produto = normalizarTexto(dados.produto || dados.Produto || dados.tituloCard || dados.TituloCard);
  const specs = [];
  const camera = produto.match(/(\d+\s?mp)/i);
  const ram = produto.match(/(\d+\s?gb)\s*ram/i) || produto.match(/ram\s*(\d+\s?gb)/i);
  const arm = produto.match(/(\d+\s?gb|\d+\s?tb)(?=\s|,|$)/ig);
  if (camera) specs.push(`Câmera de ${camera[1].toUpperCase().replace(/\s/g, '')}`);
  if (ram) {
    const r = (ram[1] || ram[0]).replace(/ram/i, '').trim().toUpperCase().replace(/\s/g, '');
    let armazenamento = '';
    if (arm && arm.length) armazenamento = arm[arm.length - 1].toUpperCase().replace(/\s/g, '');
    specs.push(`${r} RAM${armazenamento ? ' • ' + armazenamento : ''}`);
  }
  if (!specs.length) specs.push('Oferta selecionada');
  if (specs.length === 1) specs.push('Confira no link da bio');
  return specs.slice(0, 2);
}

async function baixar(url) {
  const limpa = limparUrl(url);
  if (!limpa || !/^https?:\/\//i.test(limpa)) throw new Error('URL da imagem inválida');
  const r = await axios.get(limpa, {
    responseType: 'arraybuffer',
    timeout: 25000,
    headers: { 'User-Agent': 'Mozilla/5.0 PromoTche' },
  });
  return Buffer.from(r.data);
}

async function imagemBase64(url) {
  const buffer = await baixar(url);
  const png = await sharp(buffer)
    .resize(420, 520, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function logoBase64() {
  const possibilidades = [
    path.join(__dirname, '..', 'assets', 'logo-promotche.webp'),
    path.join(__dirname, '..', 'assets', 'logo.webp'),
    path.join(__dirname, '..', 'assets', 'logo.png'),
    path.join(__dirname, 'assets', 'logo-promotche.webp'),
    path.join(__dirname, 'assets', 'logo.webp'),
    path.join(__dirname, 'assets', 'logo.png'),
  ];
  for (const p of possibilidades) {
    if (fs.existsSync(p)) {
      const png = await sharp(p).resize(190, 190, { fit: 'contain' }).png().toBuffer();
      return `data:image/png;base64,${png.toString('base64')}`;
    }
  }
  return '';
}

function calcFontTitulo(linhas) {
  const maior = Math.max(...linhas.map(l => l.length), 1);
  if (maior > 20) return 47;
  if (maior > 17) return 52;
  return 58;
}

function ajustarCupom(cupom) {
  const c = normalizarTexto(cupom || 'VER OFERTA').toUpperCase();
  if (c.length > 18) return { texto: c.slice(0, 18), font: 33 };
  if (c.length > 14) return { texto: c, font: 36 };
  return { texto: c, font: 40 };
}

async function gerarCard(dados = {}, baseUrl = '') {
  const produtoImg = await imagemBase64(dados.imagemProduto || dados.ImagemProduto);
  const logo = await logoBase64();

  const marca = normalizarTexto(dados.marca || dados.Marca || '').toUpperCase();
  const titulo = tituloPrincipal(dados).toUpperCase();
  const linhasTitulo = quebrar(titulo, 16, 3);
  const fontTitulo = calcFontTitulo(linhasTitulo);
  const specs = textoSpecs(dados);
  const precoAtual = moeda(dados.precoAtual || dados.PrecoAtual);
  const precoAntigo = moeda(dados.precoAntigo || dados.PrecoAntigo);
  const econ = economia(dados.precoAntigo || dados.PrecoAntigo, dados.precoAtual || dados.PrecoAtual);
  const desc = descontoTexto(dados.desconto || dados.Desconto);
  const categoria = categoriaTexto(dados.categoria || dados.Categoria);
  const cupom = ajustarCupom(dados.cupom || dados.Cupom);
  const nomeArquivo = `${Date.now()}-${slug(titulo)}.jpg`;

  const tituloSvg = linhasTitulo.map((l, i) => `<text x="70" y="${505 + i * (fontTitulo + 10)}" class="titulo" font-size="${fontTitulo}">${esc(l)}</text>`).join('');
  const specsSvg = specs.map((s, i) => `
    <circle cx="78" cy="${780 + i * 54}" r="8" fill="#ffcc00"/>
    <text x="105" y="${792 + i * 54}" class="spec">${esc(s)}</text>`).join('');

  const logoSvg = logo
    ? `<image href="${logo}" x="25" y="18" width="190" height="190" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="115" cy="105" r="82" fill="#050505" stroke="#ffcc00" stroke-width="4"/><text x="115" y="95" text-anchor="middle" class="logoText">PROMO</text><text x="115" y="133" text-anchor="middle" class="logoText yellow">TCHÊ</text>`;

  const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050505"/><stop offset="0.72" stop-color="#090909"/><stop offset="1" stop-color="#ffcc00"/>
    </linearGradient>
    <linearGradient id="yellow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffd500"/><stop offset="1" stop-color="#ffbe00"/>
    </linearGradient>
    <linearGradient id="red" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff1018"/><stop offset="1" stop-color="#d90008"/>
    </linearGradient>
    <radialGradient id="green" cx="50%" cy="35%" r="70%">
      <stop offset="0" stop-color="#32d54d"/><stop offset="1" stop-color="#079a25"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-opacity="0.35"/>
    </filter>
    <style>
      .font{font-family: Impact, 'Arial Black', Arial, sans-serif; font-weight:900;}
      .tituloTopo{font-family: Impact, 'Arial Black', Arial, sans-serif; font-size:78px; font-style:italic; font-weight:900; fill:#080808; letter-spacing:1px;}
      .subtopo{font-family:Arial, sans-serif; font-size:30px; font-weight:900; fill:white;}
      .marca{font-family:Arial, sans-serif; font-size:42px; font-weight:900; fill:#747474; letter-spacing:1px;}
      .titulo{font-family: Impact, 'Arial Black', Arial, sans-serif; font-weight:900; fill:#050505; letter-spacing:.5px;}
      .spec{font-family:Arial, sans-serif; font-size:34px; font-weight:900; fill:#080808;}
      .priceLabel{font-family:Arial, sans-serif; font-size:38px; font-weight:900; fill:#fff;}
      .priceLabelRed{font-family:Arial, sans-serif; font-size:38px; font-weight:900; fill:#ff1018;}
      .oldPrice{font-family:Arial, sans-serif; font-size:38px; font-weight:900; fill:#bfbfbf;}
      .newPrice{font-family:Impact, 'Arial Black', Arial, sans-serif; font-size:68px; font-weight:900; fill:#ffd400; letter-spacing:1px;}
      .smallBold{font-family:Arial, sans-serif; font-weight:900;}
      .logoText{font-family:Arial, sans-serif; font-size:27px; font-weight:900; fill:white;}
      .yellow{fill:#ffcc00;}
    </style>
  </defs>

  <rect width="1080" height="1350" fill="url(#bg)"/>

  <!-- Topo -->
  <polygon points="0,0 815,0 775,210 0,210" fill="url(#yellow)"/>
  ${logoSvg}
  <text x="300" y="90" class="tituloTopo">PROMO TCHÊ</text>
  <rect x="300" y="122" width="455" height="48" rx="24" fill="#070707"/>
  <text x="527" y="155" text-anchor="middle" class="subtopo">OFERTAS TODOS OS DIAS!</text>

  <polygon points="820,0 1080,0 1080,215 950,175 820,215" fill="url(#red)" filter="url(#shadow)"/>
  <text x="950" y="82" text-anchor="middle" class="smallBold" font-size="38" fill="#fff">OFERTA</text>
  <text x="950" y="132" text-anchor="middle" class="smallBold" font-size="40" fill="#ffd400">RELÂMPAGO</text>

  <!-- Cartão branco -->
  <rect x="30" y="235" width="1020" height="840" rx="38" fill="#fff" filter="url(#shadow)"/>
  <rect x="48" y="252" width="984" height="804" rx="30" fill="none" stroke="#ffcc00" stroke-width="5"/>

  <!-- Categoria -->
  <rect x="70" y="315" width="240" height="58" rx="9" fill="#ffcc00"/>
  <text x="190" y="355" text-anchor="middle" class="smallBold" font-size="34" fill="#050505">${esc(categoria)}</text>

  <!-- Marca + título -->
  <text x="70" y="435" class="marca">${esc(marca || 'OFERTA')}</text>
  ${tituloSvg}

  <!-- Separador + specs -->
  <rect x="70" y="700" width="410" height="5" fill="#ffcc00"/>
  ${specsSvg}

  <!-- Imagem produto -->
  <image href="${produtoImg}" x="600" y="350" width="365" height="495" preserveAspectRatio="xMidYMid meet"/>

  <!-- Selo desconto -->
  ${desc ? `
  <circle cx="905" cy="335" r="76" fill="white" filter="url(#shadow)"/>
  <circle cx="905" cy="335" r="66" fill="url(#green)"/>
  <text x="905" y="320" text-anchor="middle" class="smallBold" font-size="44" fill="#fff">${esc(desc)}%</text>
  <text x="905" y="370" text-anchor="middle" class="smallBold" font-size="42" fill="#ffd400">OFF</text>` : ''}

  <!-- Bloco preço -->
  <rect x="58" y="905" width="964" height="245" rx="24" fill="#030303"/>
  <line x1="610" y1="930" x2="610" y2="1130" stroke="#d8d8d8" stroke-width="2" stroke-dasharray="8 9"/>

  <text x="90" y="970" class="priceLabel">DE:</text>
  <text x="210" y="970" class="oldPrice">${esc(precoAntigo)}</text>
  <line x1="205" y1="950" x2="410" y2="925" stroke="#f20c18" stroke-width="5"/>
  <text x="90" y="1045" class="priceLabelRed">POR:</text>
  <text x="220" y="1055" class="newPrice">${esc(precoAtual)}</text>
  <rect x="95" y="1088" width="435" height="62" rx="10" fill="url(#red)"/>
  <text x="312" y="1129" text-anchor="middle" class="smallBold" font-size="31" fill="#ffd400">ECONOMIZE ${esc(econ)}</text>

  <text x="805" y="965" text-anchor="middle" class="priceLabel">USE O CUPOM:</text>
  <rect x="675" y="1008" width="300" height="90" rx="15" fill="url(#red)" stroke="#fff" stroke-width="4" stroke-dasharray="10 8"/>
  <text x="825" y="1065" text-anchor="middle" class="smallBold" font-size="${cupom.font}" fill="#ffd400">${esc(cupom.texto)}</text>

  <!-- Barras inferiores dentro do card -->
  <rect x="60" y="1188" width="585" height="58" rx="9" fill="#030303"/>
  <text x="352" y="1227" text-anchor="middle" class="smallBold" font-size="29" fill="#fff">LINK NA BIO • OFERTAS TODOS OS DIAS!</text>

  <rect x="675" y="1188" width="345" height="58" rx="10" fill="#ffcc00"/>
  <text x="847" y="1211" text-anchor="middle" class="smallBold" font-size="25" fill="#050505">CORRE QUE É</text>
  <text x="847" y="1238" text-anchor="middle" class="smallBold" font-size="25" fill="#050505">POR TEMPO LIMITADO!</text>
</svg>`;

  const outDir = path.join(__dirname, '..', 'generated', 'cards');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, nomeArquivo);
  await sharp(Buffer.from(svg)).jpeg({ quality: 94 }).toFile(outPath);

  const urlBase = normalizarTexto(baseUrl).replace(/\/$/, '');
  const publicUrl = urlBase ? `${urlBase}/cards/${nomeArquivo}` : `/cards/${nomeArquivo}`;

  return {
    ok: true,
    imagemCard: publicUrl,
    arquivo: nomeArquivo,
    caminho: outPath,
    categoriaDetectada: categoria.toLowerCase(),
  };
}

module.exports = { gerarCard };
