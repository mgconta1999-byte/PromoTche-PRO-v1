const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const slugify = require('slugify');
const { baixarImagem, limparUrl } = require('./utils/baixarImagem');
const { moeda, parsePreco, limpar } = require('./utils/formatarPreco');
const { quebrarTexto } = require('./utils/quebrarTexto');
const { detectarCategoria } = require('./utils/detectarCategoria');

const WIDTH = 1080;
const HEIGHT = 1350;
const OUT_DIR = path.join(__dirname, '..', 'generated');

function esc(s) {
  return String(s ?? '')
    .replace(/^=/, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtPct(v) {
  const n = Number(String(v ?? '').replace(/^=/, '').replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n));
}

function dividirProduto(produto) {
  const texto = limpar(produto);
  const partes = texto.split(/,|-|\|/).map(x => x.trim()).filter(Boolean);
  const principal = partes[0] || texto;
  const detalhes = partes.slice(1).join(' • ');
  return { principal, detalhes };
}

function extrairMarca(produto, marca) {
  if (marca) return limpar(marca).toUpperCase();
  const primeira = limpar(produto).split(/\s+/)[0] || '';
  const marcas = ['Samsung','Apple','Motorola','Xiaomi','LG','Philco','Brastemp','Consul','Electrolux','Mondial','Britânia','Tramontina','Lenovo','Acer','Dell','Asus','Midea'];
  const achou = marcas.find(m => m.toLowerCase() === primeira.toLowerCase());
  return (achou || primeira).toUpperCase();
}

function featuresPorCategoria(categoria, produto) {
  const p = limpar(produto);
  const cat = categoria;
  if (cat === 'celular') {
    return [
      extrair(p, /(\d+\s?GB)\s?RAM/i, 'Memória RAM'),
      extrair(p, /(\d+\s?GB|\d+\s?TB)(?!\s?RAM)/i, 'Armazenamento'),
      extrair(p, /(\d+\s?MP)/i, 'Câmera'),
      extrair(p, /(\d[\.,]\d\s?pol|\d[\.,]\d\s?"|\d[\.,]\d)/i, 'Tela')
    ].filter(Boolean).slice(0, 3);
  }
  if (cat === 'geladeira') {
    return [
      extrair(p, /(\d+\s?L)/i, 'Capacidade'),
      /frost/i.test(p) ? 'Frost Free' : '',
      /inverse/i.test(p) ? 'Inverse' : '',
      /inox/i.test(p) ? 'Inox' : ''
    ].filter(Boolean).slice(0, 3);
  }
  if (cat === 'tv') {
    return [
      extrair(p, /(\d+\s?pol|\d+\s?")/i, 'Tamanho'),
      /4k/i.test(p) ? 'Resolução 4K' : '',
      /smart/i.test(p) ? 'Smart TV' : '',
      /qled|oled|led/i.test(p) ? (p.match(/qled|oled|led/i)[0].toUpperCase()) : ''
    ].filter(Boolean).slice(0, 3);
  }
  if (cat === 'moveis') {
    return [
      extrair(p, /(\d+\s?portas?)/i, 'Portas'),
      extrair(p, /(\d+\s?gavetas?)/i, 'Gavetas'),
      /mdp|mdf|madeira/i.test(p) ? (p.match(/mdp|mdf|madeira/i)[0].toUpperCase()) : '',
      /casal|solteiro/i.test(p) ? p.match(/casal|solteiro/i)[0] : ''
    ].filter(Boolean).slice(0, 3);
  }
  if (cat === 'notebook') {
    return [
      extrair(p, /(i3|i5|i7|ryzen\s?\d)/i, 'Processador'),
      extrair(p, /(\d+\s?GB)\s?RAM/i, 'Memória RAM'),
      extrair(p, /(\d+\s?GB|\d+\s?TB)\s?(SSD|HD)?/i, 'Armazenamento'),
      /windows|linux/i.test(p) ? p.match(/windows|linux/i)[0] : ''
    ].filter(Boolean).slice(0, 3);
  }
  return [];
}

function extrair(texto, regex, rotulo) {
  const m = texto.match(regex);
  return m ? `${rotulo}: ${m[1]}` : '';
}

function svgBase(dados, productDataUri) {
  const produto = limpar(dados.produto || 'Produto em oferta');
  const categoria = detectarCategoria(dados.categoria, produto);
  const marca = extrairMarca(produto, dados.marca);
  const { principal, detalhes } = dividirProduto(produto);
  const linhasProduto = quebrarTexto(principal.replace(new RegExp('^' + marca, 'i'), '').trim() || principal, 22, 3);
  const linhasDetalhes = quebrarTexto(detalhes || featuresPorCategoria(categoria, produto).join(' • '), 42, 2);
  const precoAtualN = parsePreco(dados.precoAtual);
  const precoAntigoN = parsePreco(dados.precoAntigo);
  const economia = Math.max(precoAntigoN - precoAtualN, 0);
  const desconto = fmtPct(dados.desconto) || (precoAntigoN && precoAtualN ? Math.round((1 - precoAtualN / precoAntigoN) * 100) : '');
  const cupom = limpar(dados.cupom);

  const produtoSvg = linhasProduto.map((l, i) => `<text x="575" y="${430 + i * 62}" class="produto">${esc(l)}</text>`).join('');
  const detalhesSvg = linhasDetalhes.map((l, i) => `<text x="575" y="${620 + i * 38}" class="detalhes">${esc(l)}</text>`).join('');
  const features = featuresPorCategoria(categoria, produto);
  const featuresSvg = features.length ? features.map((f, i) => `<text x="575" y="${710 + i * 36}" class="feature">• ${esc(f)}</text>`).join('') : '';
  const categoriaLabel = categoria === 'generico' ? 'OFERTA ESPECIAL' : categoria.toUpperCase();

  return `
  <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#050505"/>
        <stop offset="0.48" stop-color="#111"/>
        <stop offset="1" stop-color="#ffcc00"/>
      </linearGradient>
      <linearGradient id="top" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ffcc00"/>
        <stop offset="1" stop-color="#ffd900"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000" flood-opacity="0.32"/>
      </filter>
      <style>
        .font{font-family: Arial, Helvetica, sans-serif;}
        .titulo{font:bold 76px Arial, Helvetica, sans-serif; fill:#111; font-style:italic; letter-spacing:1px;}
        .sub{font:bold 25px Arial, Helvetica, sans-serif; fill:#fff;}
        .marca{font:bold 34px Arial, Helvetica, sans-serif; fill:#666; letter-spacing:1px;}
        .produto{font:bold 58px Arial, Helvetica, sans-serif; fill:#0a0a0a;}
        .detalhes{font:bold 28px Arial, Helvetica, sans-serif; fill:#555;}
        .feature{font:bold 24px Arial, Helvetica, sans-serif; fill:#333;}
        .de{font:bold 36px Arial, Helvetica, sans-serif; fill:#666;}
        .antigo{font:bold 42px Arial, Helvetica, sans-serif; fill:#777; text-decoration:line-through;}
        .por{font:bold 36px Arial, Helvetica, sans-serif; fill:#d00;}
        .preco{font:bold 74px Arial, Helvetica, sans-serif; fill:#e30613;}
        .economia{font:bold 32px Arial, Helvetica, sans-serif; fill:#ffcc00;}
        .cupomTxt{font:bold 38px Arial, Helvetica, sans-serif; fill:#fff;}
        .cupomBig{font:bold 58px Arial, Helvetica, sans-serif; fill:#ffcc00;}
      </style>
    </defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <path d="M0 0 H1080 V250 C910 205 800 255 690 225 C500 170 350 210 0 155 Z" fill="url(#top)"/>
    <circle cx="110" cy="112" r="92" fill="#080808" stroke="#ffcc00" stroke-width="5"/>
    <text x="110" y="92" text-anchor="middle" class="font" font-size="27" font-weight="900" fill="#fff">PROMO</text>
    <text x="110" y="132" text-anchor="middle" class="font" font-size="34" font-weight="900" fill="#ffcc00">TCHÊ</text>
    <text x="322" y="100" class="titulo">PROMO TCHÊ</text>
    <rect x="300" y="128" width="480" height="42" rx="21" fill="#050505"/>
    <text x="540" y="157" text-anchor="middle" class="sub">OFERTAS TODOS OS DIAS!</text>
    <path d="M835 0 L1080 0 L1080 225 L930 190 L802 232 Z" fill="#e30613" filter="url(#shadow)"/>
    <text x="950" y="92" text-anchor="middle" class="font" font-size="44" font-weight="900" fill="#fff">OFERTA</text>
    <text x="950" y="142" text-anchor="middle" class="font" font-size="40" font-weight="900" fill="#ffcc00">RELÂMPAGO</text>

    <rect x="35" y="235" width="1010" height="910" rx="42" fill="#fff" filter="url(#shadow)"/>
    <rect x="60" y="265" width="470" height="650" rx="35" fill="#fff" stroke="#f1f1f1" stroke-width="2"/>
    <image href="${productDataUri}" x="80" y="300" width="430" height="570" preserveAspectRatio="xMidYMid meet"/>

    ${desconto ? `<circle cx="930" cy="332" r="82" fill="#0a8f18" stroke="#fff" stroke-width="7" filter="url(#shadow)"/>
    <text x="930" y="320" text-anchor="middle" class="font" font-size="58" font-weight="900" fill="#fff">${esc(desconto)}%</text>
    <text x="930" y="372" text-anchor="middle" class="font" font-size="45" font-weight="900" fill="#ffcc00">OFF</text>` : ''}

    <rect x="575" y="300" width="230" height="45" rx="10" fill="#ffcc00"/>
    <text x="690" y="331" text-anchor="middle" class="font" font-size="26" font-weight="900" fill="#111">${esc(categoriaLabel)}</text>
    <text x="575" y="395" class="marca">${esc(marca)}</text>
    ${produtoSvg}
    ${linhasDetalhes.length ? `<line x1="575" y1="580" x2="990" y2="580" stroke="#ffcc00" stroke-width="5"/>${detalhesSvg}` : ''}
    ${featuresSvg}

    <rect x="70" y="940" width="940" height="185" rx="28" fill="#090909"/>
    <text x="115" y="1005" class="de">DE:</text>
    <text x="220" y="1005" class="antigo">${esc(moeda(dados.precoAntigo))}</text>
    <text x="115" y="1080" class="por">POR:</text>
    <text x="220" y="1082" class="preco">${esc(moeda(dados.precoAtual))}</text>
    ${economia > 0 ? `<rect x="115" y="1103" width="455" height="48" rx="10" fill="#e30613"/>
    <text x="342" y="1138" text-anchor="middle" class="economia">ECONOMIZE ${esc(moeda(economia))}</text>` : ''}

    ${cupom ? `<line x1="620" y1="965" x2="620" y2="1110" stroke="#777" stroke-dasharray="6 8"/>
    <text x="660" y="1008" class="cupomTxt">USE O CUPOM:</text>
    <rect x="660" y="1034" width="320" height="72" rx="12" fill="#e30613" stroke="#fff" stroke-width="3" stroke-dasharray="8 8"/>
    <text x="820" y="1085" text-anchor="middle" class="cupomBig">${esc(cupom).slice(0, 16)}</text>` : ''}

    <rect x="0" y="1175" width="1080" height="175" fill="#050505"/>
    <circle cx="88" cy="1258" r="31" fill="#ffcc00"/>
    <text x="88" y="1269" text-anchor="middle" class="font" font-size="38" font-weight="900" fill="#111">🔗</text>
    <text x="140" y="1268" class="font" font-size="27" font-weight="900" fill="#fff">LINK NA LEGENDA • OFERTAS TODOS OS DIAS</text>
    <rect x="730" y="1210" width="300" height="92" rx="25" fill="#ffcc00"/>
    <text x="880" y="1247" text-anchor="middle" class="font" font-size="28" font-weight="900" fill="#111">CORRE QUE É</text>
    <text x="880" y="1282" text-anchor="middle" class="font" font-size="26" font-weight="900" fill="#111">POR TEMPO LIMITADO!</text>
  </svg>`;
}

async function gerarCard(dados, baseUrl) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const produto = limpar(dados.produto || dados.Produto || 'produto');
  const imagemUrl = limparUrl(dados.imagemProduto || dados.ImagemProduto);
  const buffer = await baixarImagem(imagemUrl);
  const produtoPng = await sharp(buffer)
    .resize(900, 900, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  const dataUri = `data:image/png;base64,${produtoPng.toString('base64')}`;

  const nomeArquivo = `${Date.now()}-${slugify(produto, { lower: true, strict: true }).slice(0, 60)}.jpg`;
  const arquivo = path.join(OUT_DIR, nomeArquivo);
  const svg = svgBase({
    produto,
    marca: dados.marca || dados.Marca,
    categoria: dados.categoria || dados.Categoria,
    precoAtual: dados.precoAtual || dados.PrecoAtual,
    precoAntigo: dados.precoAntigo || dados.PrecoAntigo,
    desconto: dados.desconto || dados.Desconto,
    cupom: dados.cupom || dados.Cupom,
    linkAfiliado: dados.linkAfiliado || dados.LinkAfiliado
  }, dataUri);

  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(arquivo);

  return {
    ok: true,
    imagemCard: `${baseUrl}/cards/${nomeArquivo}`,
    arquivo: nomeArquivo
  };
}

module.exports = { gerarCard };
