const express = require('express');
const cors = require('cors');
const path = require('path');
const { gerarCard } = require('./cardGenerator');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use('/cards', express.static(path.join(__dirname, '..', 'generated', 'cards')));

app.get('/', (req, res) => {
  res.json({ ok: true, app: 'PromoTche PRO v3', rota: 'POST /api/gerar-card' });
});

app.get('/cards/:arquivo', (req, res) => {
  const arquivo = req.params.arquivo;

  const caminho1 = path.join(__dirname, '..', 'generated', 'cards', arquivo);
  const caminho2 = path.join(__dirname, 'generated', 'cards', arquivo);

  if (require('fs').existsSync(caminho1)) {
    return res.sendFile(caminho1);
  }

  if (require('fs').existsSync(caminho2)) {
    return res.sendFile(caminho2);
  }

  return res.status(404).send('Imagem não encontrada');
});

app.post('/api/gerar-card', async (req, res) => {
  try {
    const resultado = await gerarCard(req.body, BASE_URL);
    res.json(resultado);
  } catch (err) {
    console.error('ERRO AO GERAR CARD:', err);
    res.status(500).json({ ok: false, erro: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`PromoTche PRO v3 rodando em http://localhost:${PORT}`);
});
