const sharp = require("sharp");
const axios = require("axios");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

const WIDTH = 1080, HEIGHT = 1350;
function esc(t=""){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function moeda(v){ if(!v) return ""; const s=String(v).replace("R$","").trim(); return "R$ " + s; }
async function baixar(url){
  const r = await axios.get(url, {responseType:"arraybuffer", timeout:20000, headers:{"User-Agent":"Mozilla/5.0"}});
  return Buffer.from(r.data);
}

async function gerarCard({produto, precoAtual, precoAntigo, desconto, cupom, linkAfiliado, imagemProduto, outputPath}) {
  const logoPath = path.join(__dirname, "..", "assets", "logo-promotche.webp");
  const productBuffer = await baixar(imagemProduto);
  const productImage = await sharp(productBuffer).resize(760,620,{fit:"contain",background:{r:255,g:255,b:255,alpha:0}}).png().toBuffer();

  let logoBuffer=null;
  if(fs.existsSync(logoPath)) logoBuffer = await sharp(logoPath).resize(210,210,{fit:"contain"}).png().toBuffer();

  let qrBuffer=null;
  if(linkAfiliado) qrBuffer = await QRCode.toBuffer(linkAfiliado, {width:170, margin:1});

  const svg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#080808"/><stop offset="55%" stop-color="#151515"/><stop offset="100%" stop-color="#FFB000"/>
      </linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-opacity="0.35"/></filter>
    </defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <circle cx="930" cy="80" r="260" fill="#FFD21A" opacity=".20"/>
    <circle cx="130" cy="1260" r="300" fill="#E51B23" opacity=".18"/>
    <rect x="55" y="55" width="970" height="1240" rx="42" fill="#111" stroke="#FFCE00" stroke-width="8" filter="url(#shadow)"/>
    <rect x="95" y="95" width="890" height="150" rx="28" fill="#FFCE00"/>
    <text x="560" y="190" text-anchor="middle" font-size="58" font-family="Arial Black, Arial" fill="#111">PROMO TCHÊ</text>
    <rect x="110" y="285" width="860" height="585" rx="34" fill="#FFF"/>
    <rect x="680" y="270" width="270" height="100" rx="28" fill="#E51B23" stroke="#FFF" stroke-width="6"/>
    <text x="815" y="335" text-anchor="middle" font-size="42" font-family="Arial Black, Arial" fill="#FFF">${esc(desconto ? desconto+"% OFF" : "OFERTA")}</text>
    <text x="540" y="955" text-anchor="middle" font-size="44" font-family="Arial Black, Arial" fill="#FFF">${esc(String(produto).slice(0,70))}</text>
    <text x="250" y="1045" font-size="36" font-family="Arial" fill="#BDBDBD">De:</text>
    <text x="330" y="1045" font-size="42" font-family="Arial Black, Arial" fill="#BDBDBD" text-decoration="line-through">${esc(moeda(precoAntigo))}</text>
    <text x="250" y="1125" font-size="40" font-family="Arial" fill="#FFF">Por:</text>
    <text x="350" y="1128" font-size="70" font-family="Arial Black, Arial" fill="#FFCE00">${esc(moeda(precoAtual))}</text>
    <rect x="120" y="1168" width="620" height="82" rx="24" fill="#E51B23"/>
    <text x="430" y="1223" text-anchor="middle" font-size="33" font-family="Arial Black, Arial" fill="#FFF">${esc(cupom ? "CUPOM: "+cupom : "OFERTA POR TEMPO LIMITADO")}</text>
    <text x="540" y="1282" text-anchor="middle" font-size="28" font-family="Arial Black, Arial" fill="#FFF">LINK NA LEGENDA • OFERTAS TODOS OS DIAS</text>
  </svg>`;

  const composites = [{input:Buffer.from(svg), top:0, left:0}, {input:productImage, top:330, left:160}];
  if(logoBuffer) composites.push({input:logoBuffer, top:72, left:90});
  if(qrBuffer) composites.push({input:qrBuffer, top:1085, left:795});

  await sharp({create:{width:WIDTH,height:HEIGHT,channels:4,background:"#000"}}).composite(composites).jpeg({quality:92}).toFile(outputPath);
}
module.exports = { gerarCard };
