function limpar(v) {
  return String(v ?? '').replace(/^=/, '').replace(/R\$/gi, '').trim();
}

function parsePreco(v) {
  let s = limpar(v);
  if (!s) return 0;
  s = s.replace(/\s/g, '');
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = s.split('.');
    if (parts.length > 2) s = s.replace(/\./g, '');
    // se tem um ponto com 1 ou 2 casas, considera decimal. Ex: 1115.1 => 1115.10
  }
  const n = Number(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function moeda(v) {
  const n = parsePreco(v);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

module.exports = { limpar, parsePreco, moeda };
