const router = require('express').Router();
const Orcamento = require('../models/Orcamento');

router.get('/', async (req, res) => {
  try {
    res.json(await Orcamento.list());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/next-numero', async (req, res) => {
  try {
    res.json({ numero: await Orcamento.nextNumero() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const orc = await Orcamento.getById(req.params.id);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });
    res.json(orc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { numero, data, validade, cliente_id, obs, itens, desconto } = req.body;
    if (!itens || !itens.length) return res.status(400).json({ error: 'Adicione ao menos um produto' });
    const orc = await Orcamento.create({ numero, data, validade, cliente_id, obs, itens, desconto });
    res.status(201).json(orc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { data, validade, cliente_id, obs, itens, desconto } = req.body;
    if (!itens || !itens.length) return res.status(400).json({ error: 'Adicione ao menos um produto' });
    const orc = await Orcamento.update(req.params.id, { data, validade, cliente_id, obs, itens, desconto });
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });
    res.json(orc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
