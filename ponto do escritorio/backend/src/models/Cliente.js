const db = require('../config/db');

const TABLE = 'clientes';

function list() {
  return db(TABLE).orderBy('nome');
}

function getById(id) {
  return db(TABLE).where({ id }).first();
}

function create(data) {
  return db(TABLE).insert(data).then(([id]) => getById(id));
}

async function update(id, data) {
  await db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() });
  return getById(id);
}

function remove(id) {
  return db(TABLE).where({ id }).delete();
}

module.exports = { list, getById, create, update, remove };
