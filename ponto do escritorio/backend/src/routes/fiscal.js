const router = require('express').Router();
const Estoque = require('../models/Estoque');

router.post('/entrada-xml', async (req, res) => {
  try {
    const { fornecedor, nNF, dEmi, chave, cnpjForn, items } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'Nenhum item encontrado' });

    const resultado = [];
    for (const it of items) {
      const exist = await Estoque.getByCode(it.codigo);
      if (exist) {
        const atualizado = await Estoque.update(exist.id, {
          qtd:  Number(exist.qtd) + Number(it.qtd),
          custo: it.vUnit,
        });
        resultado.push({ acao: 'atualizado', produto: atualizado });
      } else {
        const criado = await Estoque.create({
          codigo:    it.codigo,
          nome:      it.nome,
          marca:     fornecedor || '-',
          categoria: 'Importado',
          qtd:       it.qtd,
          minimo:    2,
          custo:     it.vUnit,
          venda:     +(it.vUnit * 1.9).toFixed(2),
          un:        it.un || 'un',
        });
        resultado.push({ acao: 'criado', produto: criado });
      }
    }

    res.json({ lancados: resultado.length, resultado, nNF, fornecedor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
