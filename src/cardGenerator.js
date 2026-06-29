const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const axios = require('axios');

const WIDTH = 1080;
const HEIGHT = 1350;

function limpar(v) {
  return String(v ?? '').replace(/^=/, '').trim();
}

function escapeXml(s) {
  return limpar(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function numeroBR(v) {
  if (v === null || v === undefined || v === '') return null;
  let s = limpar(v).replace(/R\$/gi, '').replace(/\s/g, '');
  // Se vier 1.115,10 => 1115.10
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  // Se vier 1115,10 => 1115.10
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function moeda(v) {
  const n = numeroBR(v);
  if (n === null) return limpar(v).replace(/^R\$\s*/i, '');
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moedaComRS(v) {
  const m = moeda(v);
  return m ? `R$ ${m}` : '';
}

function economia(precoAntigo, precoAtual) {
  const antigo = numeroBR(precoAntigo);
  const atual = numeroBR(precoAtual);
  if (antigo === null || atual === null || antigo <= atual) return '';
  return moedaComRS(antigo - atual);
}

function descontoTxt(desconto, precoAntigo, precoAtual) {
  let d = limpar(desconto).replace('%', '');
  if (!d) {
    const antigo = numeroBR(precoAntigo);
    const atual = numeroBR(precoAtual);
    if (antigo && atual && antigo > atual) d = Math.round(((antigo - atual) / antigo) * 100);
  }
  return d ? `${d}%` : '';
}

function slug(s) {
  return limpar(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'card-promotche';
}

function wrap(text, maxChars, maxLines = 3) {
  const words = limpar(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length <= maxChars) line = test;
    else {
      if (line) lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.length && lines.length === maxLines) {
    const joined = lines.join(' ');
    if (joined.length < words.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\.*$/, '') + '...';
  }
  return lines;
}

function categoriaNormalizada(categoria, produto = '') {
  const c = limpar(categoria).toLowerCase();
  const p = limpar(produto).toLowerCase();
  const base = c || p;
  if (!base) return 'oferta';
  if (/celular|smartphone|iphone|galaxy|xiaomi|motorola|redmi/.test(base)) return 'celular';
  if (/notebook|laptop|macbook/.test(base)) return 'notebook';
  if (/tv|televis|smart tv/.test(base)) return 'tv';
  if (/geladeira|refrigerador|frost/.test(base)) return 'geladeira';
  if (/arm[aá]rio|guarda roupa|mesa|sof[aá]|cadeira|cama|m[oó]vel/.test(base)) return 'moveis';
  return c ? c : 'oferta';
}

function categoriaLabel(cat) {
  const labels = {
    celular: 'CELULAR',
    notebook: 'NOTEBOOK',
    tv: 'TV',
    geladeira: 'GELADEIRA',
    moveis: 'MÓVEIS',
    oferta: 'OFERTA'
  };
  return labels[cat] || cat.toUpperCase();
}

function specs(produto, categoria) {
  const p = limpar(produto);
  const out = [];
  if (categoria === 'celular') {
    const ram = p.match(/(\d+)\s*(gb|g)\s*ram/i) || p.match(/(\d+)\s*(gb|g)\b/i);
    const storage = p.match(/(\d+)\s*(gb|g|tb)\b/i);
    const cam = p.match(/(\d+)\s*mp/i);
    const tela = p.match(/(\d+[\.,]?\d*)\s*("|pol|polegadas)/i);
    if (cam) out.push(`Câmera de ${cam[1]}MP`);
    if (ram || storage) out.push(`${ram ? ram[1] + 'GB RAM' : 'Ótimo desempenho'}${storage ? ' • ' + storage[1] + storage[2].toUpperCase().replace('G','GB') : ''}`);
    if (tela) out.push(`Tela ${tela[1].replace('.', ',')}”`);
  }
  if (categoria === 'geladeira') {
    const litros = p.match(/(\d+)\s*l/i);
    if (litros) out.push(`${litros[1]} litros`);
    if (/frost free/i.test(p)) out.push('Frost Free');
    if (/inverse/i.test(p)) out.push('Inverse');
  }
  if (categoria === 'tv') {
    const pol = p.match(/(\d+)\s*("|pol|polegadas)/i);
    if (pol) out.push(`${pol[1]} polegadas`);
    if (/4k/i.test(p)) out.push('4K UHD');
    if (/smart/i.test(p)) out.push('Smart TV');
  }
  if (out.length === 0) out.push('Oferta selecionada', 'Preço especial por tempo limitado');
  return out.slice(0, 3);
}

async function baixar(url) {
  const clean = limpar(url);
  if (!clean || !/^https?:\/\//i.test(clean)) throw new Error(`ImagemProduto inválida: ${clean}`);
  const r = await axios.get(clean, {
    responseType: 'arraybuffer',
    timeout: 25000,
    headers: { 'User-Agent': 'Mozilla/5.0 PromoTcheBot/3.0' }
  });
  return Buffer.from(r.data);
}

async function gerarCard(dados = {}, baseUrl = '') {
  const produtoOriginal = limpar(dados.produto);
  const titulo = limpar(dados.tituloCard) || produtoOriginal || 'Oferta Promo Tchê';
  const marca = limpar(dados.marca);
  const cat = categoriaNormalizada(dados.categoria, produtoOriginal);
  const label = categoriaLabel(cat);
  const precoAtual = moeda(dados.precoAtual);
  const precoAntigo = moeda(dados.precoAntigo);
  const cupom = limpar(dados.cupom);
  const desc = descontoTxt(dados.desconto, dados.precoAntigo, dados.precoAtual);
  const econ = economia(dados.precoAntigo, dados.precoAtual);
  const detalhes = specs(produtoOriginal || titulo, cat);

  const safeBase = limpar(baseUrl || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const outDir = path.join(__dirname, '..', 'generated', 'cards');
  fs.mkdirSync(outDir, { recursive: true });
  const arquivo = `${Date.now()}-${slug(titulo)}.jpg`;
  const caminho = path.join(outDir, arquivo);

  const productBuffer = await baixar(dados.imagemProduto);
  const productImage = await sharp(productBuffer)
    .resize(430, 550, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  let logoBuffer = null;
  const logoCandidates = [
    path.join(__dirname, 'assets', 'logo-promotche.webp'),
    path.join(__dirname, 'assets', 'logo.webp'),
    path.join(__dirname, '..', 'assets', 'logo-promotche.webp'),
    path.join(__dirname, '..', 'assets', 'logo.webp')
  ];
  for (const p of logoCandidates) {
    if (fs.existsSync(p)) {
      logoBuffer = await sharp(p).resize(170, 170, { fit: 'contain' }).png().toBuffer();
      break;
    }
  }

  const titleLines = wrap(titulo.toUpperCase(), 17, 3);
  const titleSvg = titleLines.map((l, i) =>
    `<text x="70" y="${470 + i * 62}" font-size="56" font-weight="900" font-family="Arial Black, Impact, Arial" fill="#050505">${escapeXml(l)}</text>`
  ).join('');

  const detailsSvg = detalhes.map((d, i) =>
    `<text x="95" y="${760 + i * 52}" font-size="30" font-weight="700" font-family="Arial" fill="#111">• ${escapeXml(d)}</text>`
  ).join('');

  const logoFallback = logoBuffer ? '' : `
    <circle cx="104" cy="105" r="78" fill="#050505" stroke="#ffcc00" stroke-width="5"/>
    <text x="104" y="93" text-anchor="middle" font-size="28" font-weight="900" fill="#fff" font-family="Arial Black">PROMO</text>
    <text x="104" y="128" text-anchor="middle" font-size="30" font-weight="900" fill="#ffcc00" font-family="Arial Black">TCHÊ</text>`;

  const svg = `
  <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#050505"/><stop offset="0.52" stop-color="#101010"/><stop offset="1" stop-color="#ffcc00"/></linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity="0.35"/></filter>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#000" flood-opacity="0.22"/></filter>
    </defs>

    <rect width="1080" height="1350" fill="url(#bg)"/>
    <path d="M190 0 H825 L790 205 H0 V0 Z" fill="#ffcc00"/>
    <rect x="835" y="0" width="245" height="225" fill="#e50914"/>
    <path d="M835 225 L957 185 L1080 225 Z" fill="#c8000d"/>
    ${logoFallback}
    <text x="520" y="91" text-anchor="middle" font-size="64" font-weight="900" font-style="italic" font-family="Arial Black, Impact" fill="#050505">PROMO TCHÊ</text>
    <rect x="300" y="118" width="450" height="43" rx="22" fill="#050505"/>
    <text x="525" y="148" text-anchor="middle" font-size="25" font-weight="800" font-family="Arial" fill="#fff">OFERTAS TODOS OS DIAS!</text>
    <text x="957" y="84" text-anchor="middle" font-size="42" font-weight="900" fill="#fff" font-family="Arial Black">OFERTA</text>
    <text x="957" y="135" text-anchor="middle" font-size="38" font-weight="900" fill="#ffcc00" font-family="Arial Black">RELÂMPAGO</text>

    <rect x="28" y="242" width="1024" height="900" rx="36" fill="#fff" stroke="#ffcc00" stroke-width="6" filter="url(#soft)"/>
    <rect x="50" y="264" width="980" height="856" rx="28" fill="#fff" stroke="#eee" stroke-width="2"/>

    <rect x="70" y="315" width="235" height="58" rx="10" fill="#ffcc00"/>
    <text x="187" y="355" text-anchor="middle" font-size="33" font-weight="900" font-family="Arial Black" fill="#050505">${escapeXml(label)}</text>
    <text x="70" y="430" font-size="40" font-weight="900" font-family="Arial Black" fill="#777">${escapeXml(marca.toUpperCase())}</text>
    ${titleSvg}
    <line x1="70" y1="705" x2="455" y2="705" stroke="#ffcc00" stroke-width="6"/>
    ${detailsSvg}

    <circle cx="900" cy="343" r="82" fill="#08a826" stroke="#fff" stroke-width="10" filter="url(#shadow)"/>
    <text x="900" y="330" text-anchor="middle" font-size="50" font-weight="900" font-family="Arial Black" fill="#fff">${escapeXml(desc || 'OFF')}</text>
    <text x="900" y="386" text-anchor="middle" font-size="44" font-weight="900" font-family="Arial Black" fill="#ffdf00">OFF</text>

    <rect x="66" y="948" width="948" height="240" rx="24" fill="#050505"/>
    <line x1="575" y1="980" x2="575" y2="1155" stroke="#777" stroke-width="2" stroke-dasharray="7 10"/>
    <text x="105" y="1015" font-size="34" font-weight="900" font-family="Arial Black" fill="#fff">DE:</text>
    <text x="210" y="1015" font-size="36" font-weight="900" font-family="Arial Black" fill="#bbb" text-decoration="line-through">R$ ${escapeXml(precoAntigo)}</text>
    <text x="105" y="1090" font-size="36" font-weight="900" font-family="Arial Black" fill="#ff1b1b">POR:</text>
    <text x="210" y="1102" font-size="64" font-weight="900" font-family="Arial Black, Impact" fill="#ffcc00">R$ ${escapeXml(precoAtual)}</text>
    <rect x="98" y="1128" width="425" height="55" rx="10" fill="#e50914"/>
    <text x="310" y="1166" text-anchor="middle" font-size="31" font-weight="900" font-family="Arial Black" fill="#ffdf00">ECONOMIZE ${escapeXml(econ)}</text>

    <text x="782" y="1018" text-anchor="middle" font-size="35" font-weight="900" font-family="Arial Black" fill="#fff">USE O CUPOM:</text>
    <rect x="645" y="1058" width="285" height="90" rx="14" fill="#e50914" stroke="#fff" stroke-width="4" stroke-dasharray="10 7"/>
    <text x="787" y="1115" text-anchor="middle" font-size="31" font-weight="900" font-family="Arial Black" fill="#ffdf00">${escapeXml(cupom || 'CONFIRA')}</text>

    <rect x="70" y="1230" width="610" height="55" rx="17" fill="#050505" filter="url(#soft)"/>
    <text x="375" y="1267" text-anchor="middle" font-size="31" font-weight="900" font-family="Arial Black" fill="#fff">🔗 LINK NA BIO • OFERTAS TODOS OS DIAS</text>
    <rect x="700" y="1218" width="300" height="78" rx="16" fill="#ffcc00"/>
    <text x="850" y="1250" text-anchor="middle" font-size="28" font-weight="900" font-family="Arial Black" fill="#050505">CORRE QUE É</text>
    <text x="850" y="1282" text-anchor="middle" font-size="26" font-weight="900" font-family="Arial Black" fill="#050505">POR TEMPO LIMITADO!</text>
  </svg>`;

  const composites = [
    { input: productImage, left: 560, top: 375 }
  ];
  if (logoBuffer) composites.push({ input: logoBuffer, left: 28, top: 24 });

  await sharp(Buffer.from(svg))
    .composite(composites)
    .jpeg({ quality: 94 })
    .toFile(caminho);

  const imagemCard = `${safeBase}/cards/${arquivo}`;
  return { ok: true, imagemCard, arquivo, caminho, categoriaDetectada: cat };
}

module.exports = { gerarCard };
