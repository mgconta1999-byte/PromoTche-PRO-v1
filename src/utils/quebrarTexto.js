function quebrarTexto(texto, maxChars = 28, maxLinhas = 3) {
  const palavras = String(texto || '').replace(/^=/, '').trim().split(/\s+/).filter(Boolean);
  const linhas = [];
  let linha = '';
  for (const p of palavras) {
    if ((linha + ' ' + p).trim().length <= maxChars) {
      linha = (linha + ' ' + p).trim();
    } else {
      if (linha) linhas.push(linha);
      linha = p;
    }
    if (linhas.length === maxLinhas) break;
  }
  if (linha && linhas.length < maxLinhas) linhas.push(linha);
  if (linhas.length === maxLinhas && palavras.join(' ').length > linhas.join(' ').length) {
    linhas[maxLinhas - 1] = linhas[maxLinhas - 1].replace(/\.*$/, '') + '...';
  }
  return linhas;
}
module.exports = { quebrarTexto };
