const axios = require('axios');

function limparUrl(url) {
  return String(url || '').replace(/^=/, '').trim();
}

async function baixarImagem(url) {
  const limpa = limparUrl(url);
  if (!limpa || !/^https?:\/\//i.test(limpa)) {
    throw new Error('URL da imagem inválida: ' + limpa);
  }
  const r = await axios.get(limpa, {
    responseType: 'arraybuffer',
    timeout: 25000,
    headers: { 'User-Agent': 'Mozilla/5.0 PromoTcheBot/2.0' }
  });
  return Buffer.from(r.data);
}
module.exports = { baixarImagem, limparUrl };
