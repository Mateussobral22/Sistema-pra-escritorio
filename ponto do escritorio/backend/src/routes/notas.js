const router = require('express').Router();
const NotaSaida = require('../models/NotaSaida');

router.get('/', async (req, res) => {
  try {
    res.json(await NotaSaida.list());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/next-numero', async (req, res) => {
  try {
    res.json({ numero: await NotaSaida.nextNumero() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const nota = await NotaSaida.getById(req.params.id);
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
    res.json(nota);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { numero, data, cliente_id, pagamento, obs, itens } = req.body;
    if (!itens || !itens.length) return res.status(400).json({ error: 'Adicione ao menos um item' });
    const nota = await NotaSaida.create({ numero, data, cliente_id, pagamento, obs, itens });
    res.status(201).json(nota);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
