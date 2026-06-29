function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function detectarCategoria(categoria, produto) {
  const c = normalizar(categoria);
  const p = normalizar(produto);
  if (c) return c;
  if (/celular|smartphone|iphone|galaxy|motorola|xiaomi|redmi/.test(p)) return 'celular';
  if (/notebook|laptop|macbook|computador/.test(p)) return 'notebook';
  if (/tv|televisao|smart tv|oled|qled|led/.test(p)) return 'tv';
  if (/geladeira|refrigerador|frost free|inverse/.test(p)) return 'geladeira';
  if (/guarda roupa|armario|sofa|mesa|cadeira|cama|rack|painel/.test(p)) return 'moveis';
  if (/fogao|microondas|micro-ondas|lavadora|maquina de lavar|air fryer|cafeteira/.test(p)) return 'eletro';
  return 'generico';
}
module.exports = { detectarCategoria, normalizar };
