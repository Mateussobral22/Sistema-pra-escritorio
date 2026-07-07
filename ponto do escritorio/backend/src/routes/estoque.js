const router = require('express').Router();
const Estoque = require('../models/Estoque');
const db = require('../config/db');

router.get('/dashboard', async (req, res) => {
  try {
    const stats = await Estoque.dashboard();
    const alertas = await db('estoque')
      .whereRaw('qtd <= minimo')
      .orderBy('qtd');
    res.json({ ...stats, alertas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const items = await Estoque.list(req.query.search || '');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await Estoque.getById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { codigo, nome, marca, categoria, qtd, minimo, custo, venda, un } = req.body;
    if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios' });
    const existe = await Estoque.getByCode(codigo);
    if (existe) return res.status(409).json({ error: 'Código já cadastrado' });
    const item = await Estoque.create({ codigo, nome, marca, categoria, qtd: qtd||0, minimo: minimo||0, custo: custo||0, venda: venda||0, un: un||'un' });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const item = await Estoque.update(req.params.id, req.body);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/qtd', async (req, res) => {
  try {
    const { delta } = req.body;
    if (delta === undefined) return res.status(400).json({ error: 'Campo delta obrigatório' });
    const item = await Estoque.adjustQtd(req.params.id, delta);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Estoque.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
