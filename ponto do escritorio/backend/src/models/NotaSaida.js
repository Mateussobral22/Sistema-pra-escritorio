const db = require('../config/db');

const TABLE      = 'notas_saida';
const TABLE_ITENS = 'notas_saida_itens';

async function list() {
  const notas = await db(TABLE)
    .leftJoin('clientes', 'clientes.id', 'notas_saida.cliente_id')
    .select(
      'notas_saida.*',
      'clientes.nome as cliente_nome',
      'clientes.empresa as cliente_empresa'
    )
    .orderBy('notas_saida.id', 'desc');
  return notas;
}

async function getById(id) {
  const nota = await db(TABLE)
    .leftJoin('clientes', 'clientes.id', 'notas_saida.cliente_id')
    .select(
      'notas_saida.*',
      'clientes.nome as cliente_nome',
      'clientes.empresa as cliente_empresa',
      'clientes.cpfcnpj as cliente_cpfcnpj'
    )
    .where('notas_saida.id', id)
    .first();
  if (!nota) return null;
  nota.itens = await db(TABLE_ITENS).where({ nota_id: id });
  return nota;
}

async function nextNumero() {
  const last = await db(TABLE).max('id as maxId').first();
  const next = (last.maxId || 0) + 1;
  return String(next).padStart(6, '0');
}

async function create({ numero, data, cliente_id, pagamento, obs, itens }) {
  const subtotal = itens.reduce((s, i) => s + i.total, 0);

  return db.transaction(async (trx) => {
    const [id] = await trx(TABLE).insert({
      numero, data, cliente_id, pagamento, subtotal, total: subtotal, obs,
    });

    const rows = itens.map((it) => ({
      nota_id:    id,
      produto_id: it.id || null,
      nome:       it.nome,
      qtd:        it.qtd,
      vunit:      it.vunit,
      total:      it.total,
    }));
    await trx(TABLE_ITENS).insert(rows);

    for (const it of itens) {
      if (it.id) {
        const prod = await trx('estoque').where({ id: it.id }).first();
        if (prod) {
          const novaQtd = Math.max(0, Number(prod.qtd) - Number(it.qtd));
          await trx('estoque').where({ id: it.id }).update({ qtd: novaQtd });
        }
      }
    }

    return getById(id);
  });
}

module.exports = { list, getById, nextNumero, create };
