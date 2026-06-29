const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

const W = 1080;
const H = 1350;

function limpar(v) {
  return String(v ?? '').replace(/^=/, '').trim();
}

function normalizarCategoria(v) {
  const c = limpar(v).toLowerCase();
  if (!c || c === 'generico' || c === 'genérico') return 'OFERTA';
  if (c.includes('cel')) return 'CELULAR';
  if (c.includes('smart')) return 'CELULAR';
  if (c.includes('tv')) return 'TV';
  if (c.includes('gel')) return 'GELADEIRA';
  if (c.includes('note')) return 'NOTEBOOK';
  if (c.includes('mov') || c.includes('móv') || c.includes('arm')) return 'MÓVEIS';
  if (c.includes('eletro')) return 'ELETRO';
  return c.toUpperCase();
}

function numero(v) {
  let s = limpar(v).replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function moeda(v) {
  const n = typeof v === 'number' ? v : numero(v);
  if (!n) return limpar(v) || 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function slug(s) {
  return limpar(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'card';
}

function quebrarTexto(texto, maxPorLinha = 17, maxLinhas = 3) {
  const palavras = limpar(texto).split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (teste.length <= maxPorLinha) atual = teste;
    else {
      if (atual) linhas.push(atual);
      atual = p;
    }
    if (linhas.length === maxLinhas) break;
  }
  if (linhas.length < maxLinhas && atual) linhas.push(atual);
  if (linhas.length > maxLinhas) linhas.length = maxLinhas;
  return linhas;
}

function extrairSpecs(dados) {
  const texto = `${limpar(dados.tituloCard)} ${limpar(dados.produto)}`.toLowerCase();
  const specs = [];
  const camera = texto.match(/(\d{2,3})\s*mp/);
  const ram = texto.match(/(\d{1,2})\s*gb\s*ram/);
  const armazenamento = texto.match(/(\d{2,4})\s*gb/) || texto.match(/(\d)\s*tb/);
  const tela = texto.match(/(\d[\.,]\d)\s*("|pol|polegadas)/);
  if (camera) specs.push(`Câmera de ${camera[1]}MP`);
  if (ram && armazenamento) specs.push(`${ram[1]}GB RAM • ${armazenamento[1]}GB`);
  else if (ram) specs.push(`${ram[1]}GB RAM`);
  else if (armazenamento) specs.push(`${armazenamento[1]}GB`);
  if (tela) specs.push(`Tela ${tela[1].replace('.', ',')}”`);
  if (!specs.length) specs.push('Oferta por tempo limitado');
  return specs.slice(0, 3);
}

async function baixarImagem(url) {
  const u = limpar(url);
  if (!u || !/^https?:\/\//i.test(u)) throw new Error(`ImagemProduto inválida: ${u}`);
  const r = await axios.get(u, {
    responseType: 'arraybuffer',
    timeout: 25000,
    headers: { 'User-Agent': 'Mozilla/5.0 PromoTche/3.0' }
  });
  return Buffer.from(r.data);
}

function fitText(text, maxChars, baseSize) {
  const len = limpar(text).length;
  if (len <= maxChars) return baseSize;
  return Math.max(36, Math.floor(baseSize * maxChars / len));
}

function svgTemplate({ categoria, marca, tituloLinhas, specs, precoAntigo, precoAtual, economia, desconto, cupom }) {
  const tituloSvg = tituloLinhas.map((l, i) => `<text x="70" y="${505 + i * 70}" class="titulo">${esc(l)}</text>`).join('\n');
  const specsSvg = specs.map((s, i) => `<text x="96" y="${745 + i * 60}" class="spec">${esc(s)}</text><circle cx="75" cy="${733 + i * 60}" r="7" fill="#f4c400"/>`).join('\n');
  const cupomText = limpar(cupom) || 'CONFIRA NO LINK';
  const cupomSize = fitText(cupomText, 16, 42);
  const precoSize = fitText(precoAtual, 11, 72);

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070707"/><stop offset="0.58" stop-color="#080808"/><stop offset="1" stop-color="#ffcc00"/></linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.35"/></filter>
    <style>
      .font{font-family:Arial, Helvetica, sans-serif;font-weight:900;}
      .cond{font-family:Arial Narrow, Arial, Helvetica, sans-serif;font-weight:900;}
      .small{font-family:Arial, Helvetica, sans-serif;font-weight:700;}
      .titulo{font-family:Arial Narrow, Arial, Helvetica, sans-serif;font-weight:900;font-size:58px;fill:#070707;letter-spacing:-1px;}
      .spec{font-family:Arial, Helvetica, sans-serif;font-weight:800;font-size:34px;fill:#111;}
    </style>
  </defs>

  <rect width="1080" height="1350" fill="url(#bg)"/>

  <!-- TOPO -->
  <path d="M0 0 H820 L775 210 H0 Z" fill="#ffd100"/>
  <circle cx="115" cy="100" r="78" fill="#050505" stroke="#ffd100" stroke-width="6"/>
  <text x="115" y="88" text-anchor="middle" class="font" font-size="28" fill="#fff">PROMO</text>
  <text x="115" y="126" text-anchor="middle" class="font" font-size="34" fill="#ffd100">TCHÊ</text>
  <text x="115" y="150" text-anchor="middle" class="small" font-size="12" fill="#fff">OFERTAS TODOS OS DIAS!</text>
  <text x="300" y="92" class="cond" font-size="72" fill="#050505" font-style="italic">PROMO TCHÊ</text>
  <rect x="300" y="122" width="430" height="45" rx="22" fill="#050505"/>
  <text x="515" y="153" text-anchor="middle" class="font" font-size="27" fill="#fff">OFERTAS TODOS OS DIAS!</text>
  <path d="M820 0 H1080 V215 L950 175 L820 215 Z" fill="#e90012" filter="url(#shadow)"/>
  <text x="950" y="82" text-anchor="middle" class="font" font-size="46" fill="#fff">OFERTA</text>
  <text x="950" y="130" text-anchor="middle" class="font" font-size="42" fill="#ffd100">RELÂMPAGO</text>

  <!-- CARD BRANCO -->
  <rect x="28" y="235" width="1024" height="850" rx="40" fill="#fff" filter="url(#shadow)"/>
  <rect x="45" y="253" width="990" height="812" rx="32" fill="#fff" stroke="#ffd100" stroke-width="5"/>

  <!-- LADO TEXTO -->
  <rect x="70" y="315" width="240" height="54" rx="10" fill="#ffd100"/>
  <text x="190" y="354" text-anchor="middle" class="font" font-size="31" fill="#050505">${esc(categoria)}</text>
  <text x="70" y="430" class="font" font-size="42" fill="#777">${esc(marca || 'PROMO TCHÊ')}</text>
  ${tituloSvg}
  <line x1="70" y1="680" x2="480" y2="680" stroke="#ffd100" stroke-width="6"/>
  ${specsSvg}

  <!-- DESCONTO -->
  <circle cx="905" cy="350" r="75" fill="#11a832" stroke="#fff" stroke-width="11" filter="url(#shadow)"/>
  <text x="905" y="332" text-anchor="middle" class="font" font-size="50" fill="#fff">${esc(desconto)}%</text>
  <text x="905" y="387" text-anchor="middle" class="font" font-size="45" fill="#ffd100">OFF</text>

  <!-- FAIXA PRECO -->
  <rect x="58" y="905" width="964" height="250" rx="28" fill="#050505"/>
  <line x1="620" y1="930" x2="620" y2="1130" stroke="#777" stroke-width="2" stroke-dasharray="8 10"/>
  <text x="90" y="970" class="font" font-size="38" fill="#fff">DE:</text>
  <text x="205" y="970" class="font" font-size="43" fill="#aaa" text-decoration="line-through">${esc(precoAntigo)}</text>
  <line x1="198" y1="955" x2="410" y2="925" stroke="#e90012" stroke-width="5"/>
  <text x="90" y="1045" class="font" font-size="44" fill="#e90012">POR:</text>
  <text x="220" y="1055" class="font" font-size="${precoSize}" fill="#ffd100">${esc(precoAtual)}</text>
  <rect x="95" y="1088" width="445" height="68" rx="10" fill="#e90012"/>
  <text x="318" y="1134" text-anchor="middle" class="font" font-size="35" fill="#ffd100">ECONOMIZE ${esc(economia)}</text>
  <text x="820" y="965" text-anchor="middle" class="font" font-size="40" fill="#fff">USE O CUPOM:</text>
  <rect x="680" y="1006" width="300" height="95" rx="16" fill="#e90012" stroke="#fff" stroke-width="4" stroke-dasharray="11 8"/>
  <text x="830" y="1065" text-anchor="middle" class="font" font-size="${cupomSize}" fill="#ffd100">${esc(cupomText)}</text>

  <!-- RODAPE -->
  <rect x="58" y="1192" width="610" height="70" rx="12" fill="#050505"/>
  <text x="90" y="1238" class="font" font-size="34" fill="#fff">🔗 LINK NA BIO • OFERTAS TODOS OS DIAS</text>
  <rect x="690" y="1192" width="332" height="70" rx="14" fill="#ffd100"/>
  <text x="856" y="1221" text-anchor="middle" class="font" font-size="27" fill="#050505">CORRE QUE É</text>
  <text x="856" y="1253" text-anchor="middle" class="font" font-size="27" fill="#050505">POR TEMPO LIMITADO!</text>
</svg>`;
}

async function gerarCard(dados, baseUrl = '') {
  const categoria = normalizarCategoria(dados.categoria);
  const marca = limpar(dados.marca).toUpperCase();
  const tituloBase = limpar(dados.tituloCard) || limpar(dados.produto) || 'OFERTA PROMO TCHÊ';
  const tituloSemMarca = marca ? tituloBase.replace(new RegExp(marca, 'ig'), '').trim() || tituloBase : tituloBase;
  const tituloLinhas = quebrarTexto(tituloSemMarca.toUpperCase(), 16, 3);
  const specs = extrairSpecs(dados);
  const pa = moeda(dados.precoAntigo);
  const pAtualNum = numero(dados.precoAtual);
  const pAntigoNum = numero(dados.precoAntigo);
  const pat = moeda(pAtualNum || dados.precoAtual);
  const economia = pAntigoNum && pAtualNum ? moeda(pAntigoNum - pAtualNum) : '';
  const desconto = limpar(dados.desconto) || (pAntigoNum && pAtualNum ? Math.round((1 - pAtualNum / pAntigoNum) * 100) : '');
  const cupom = limpar(dados.cupom);

  const outDir = path.join(__dirname, '..', 'generated', 'cards');
  fs.mkdirSync(outDir, { recursive: true });

  const imgBuffer = await baixarImagem(dados.imagemProduto);
  const produtoPng = await sharp(imgBuffer)
    .resize(460, 460, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  const svg = svgTemplate({ categoria, marca, tituloLinhas, specs, precoAntigo: pa, precoAtual: pat, economia, desconto, cupom });
  const nome = `${Date.now()}-${slug(tituloBase)}.jpg`;
  const caminho = path.join(outDir, nome);

  await sharp(Buffer.from(svg))
    .composite([{ input: produtoPng, left: 560, top: 380 }])
    .jpeg({ quality: 92 })
    .toFile(caminho);

  const publicBase = limpar(baseUrl) || process.env.BASE_URL || '';
  const imagemCard = publicBase ? `${publicBase.replace(/\/$/, '')}/cards/${nome}` : `/cards/${nome}`;
  return { ok: true, imagemCard, arquivo: nome, caminho };
}

module.exports = { gerarCard };
