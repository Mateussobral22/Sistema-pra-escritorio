const db = require('../config/db');

const TABLE = 'estoque';

function list(search = '') {
  const q = db(TABLE).orderBy('nome');
  if (search) {
    q.whereRaw('LOWER(nome) LIKE ?', [`%${search.toLowerCase()}%`])
     .orWhereRaw('LOWER(codigo) LIKE ?', [`%${search.toLowerCase()}%`]);
  }
  return q;
}

function getById(id) {
  return db(TABLE).where({ id }).first();
}

function getByCode(codigo) {
  return db(TABLE).where({ codigo }).first();
}

function create(data) {
  return db(TABLE).insert(data).then(([id]) => getById(id));
}

async function update(id, data) {
  await db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() });
  return getById(id);
}

async function adjustQtd(id, delta) {
  await db(TABLE)
    .where({ id })
    .update({
      qtd: db.raw('qtd + ?', [delta]),
      updated_at: db.fn.now(),
    });
  return getById(id);
}

function remove(id) {
  return db(TABLE).where({ id }).delete();
}

function dashboard() {
  return db(TABLE).select(
    db.raw('COUNT(*) as total_itens'),
    db.raw('SUM(qtd * venda) as valor_estoque'),
    db.raw('SUM(CASE WHEN qtd = 0 THEN 1 ELSE 0 END) as sem_estoque'),
    db.raw('SUM(CASE WHEN qtd > 0 AND qtd <= minimo THEN 1 ELSE 0 END) as estoque_baixo')
  ).first();
}

module.exports = { list, getById, getByCode, create, update, adjustQtd, remove, dashboard };
