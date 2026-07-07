const db = require('../config/db');

const TABLE       = 'orcamentos';
const TABLE_ITENS = 'orcamentos_itens';

async function list() {
  const orcs = await db(TABLE)
    .leftJoin('clientes', 'clientes.id', 'orcamentos.cliente_id')
    .select(
      'orcamentos.*',
      'clientes.nome as cliente_nome',
      'clientes.empresa as cliente_empresa'
    )
    .orderBy('orcamentos.id', 'desc');
  return orcs;
}

async function getById(id) {
  const orc = await db(TABLE)
    .leftJoin('clientes', 'clientes.id', 'orcamentos.cliente_id')
    .select(
      'orcamentos.*',
      'clientes.nome as cliente_nome',
      'clientes.empresa as cliente_empresa',
      'clientes.email as cliente_email'
    )
    .where('orcamentos.id', id)
    .first();
  if (!orc) return null;
  orc.itens = await db(TABLE_ITENS).where({ orcamento_id: id });
  return orc;
}

async function nextNumero() {
  const last = await db(TABLE).max('id as maxId').first();
  const next = (last.maxId || 0) + 1;
  return String(next).padStart(4, '0');
}

async function create({ numero, data, validade, cliente_id, obs, itens, desconto }) {
  const subtotal = itens.reduce((s, i) => s + i.total, 0);
  const desc     = Number(desconto) || 0;
  const total    = Math.max(0, subtotal - desc);

  return db.transaction(async (trx) => {
    const [id] = await trx(TABLE).insert({
      numero, data, validade, cliente_id, desconto: desc, total, obs,
    });

    const rows = itens.map((it) => ({
      orcamento_id: id,
      produto_id:   it.id || null,
      nome:         it.nome,
      qtd:          it.qtd,
      vunit:        it.vunit,
      total:        it.total,
    }));
    await trx(TABLE_ITENS).insert(rows);

    return getById(id);
  });
}

async function update(id, { data, validade, cliente_id, obs, itens, desconto }) {
  const subtotal = itens.reduce((s, i) => s + i.total, 0);
  const desc     = Number(desconto) || 0;
  const total    = Math.max(0, subtotal - desc);

  return db.transaction(async (trx) => {
    const updated = await trx(TABLE).where({ id }).update({
      data, validade, cliente_id, desconto: desc, total, obs, updated_at: db.fn.now(),
    });
    if (!updated) return null;

    await trx(TABLE_ITENS).where({ orcamento_id: id }).del();

    const rows = itens.map((it) => ({
      orcamento_id: id,
      produto_id:   it.id || null,
      nome:         it.nome,
      qtd:          it.qtd,
      vunit:        it.vunit,
      total:        it.total,
    }));
    await trx(TABLE_ITENS).insert(rows);

    return getById(id);
  });
}

module.exports = { list, getById, nextNumero, create, update };
