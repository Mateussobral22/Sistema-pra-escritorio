const router = require('express').Router();
const Cliente = require('../models/Cliente');

router.get('/', async (req, res) => {
  try {
    const clientes = await Cliente.list();
    res.json(clientes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const cli = await Cliente.getById(req.params.id);
    if (!cli) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(cli);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nome, empresa, email, telefone, cpfcnpj } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const cli = await Cliente.create({ nome, empresa, email, telefone, cpfcnpj });
    res.status(201).json(cli);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const cli = await Cliente.update(req.params.id, req.body);
    res.json(cli);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Cliente.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
