const db = require('../config/db');

async function migrate() {
  const exists = await db.schema.hasTable('estoque');
  if (exists) return;

  await db.schema.createTable('estoque', (t) => {
    t.increments('id').primary();
    t.string('codigo', 20).notNullable().unique();
    t.string('nome', 200).notNullable();
    t.string('marca', 100).defaultTo('');
    t.string('categoria', 100).defaultTo('');
    t.decimal('qtd', 10, 3).defaultTo(0);
    t.decimal('minimo', 10, 3).defaultTo(0);
    t.decimal('custo', 12, 2).defaultTo(0);
    t.decimal('venda', 12, 2).defaultTo(0);
    t.string('un', 10).defaultTo('un');
    t.timestamps(true, true);
  });

  await db.schema.createTable('clientes', (t) => {
    t.increments('id').primary();
    t.string('nome', 200).notNullable();
    t.string('empresa', 200).defaultTo('');
    t.string('email', 200).defaultTo('');
    t.string('telefone', 30).defaultTo('');
    t.string('cpfcnpj', 30).defaultTo('');
    t.timestamps(true, true);
  });

  await db.schema.createTable('notas_saida', (t) => {
    t.increments('id').primary();
    t.string('numero', 20).notNullable();
    t.date('data').notNullable();
    t.integer('cliente_id').unsigned().references('id').inTable('clientes').onDelete('SET NULL').nullable();
    t.string('pagamento', 50).defaultTo('À Vista');
    t.decimal('subtotal', 12, 2).defaultTo(0);
    t.decimal('total', 12, 2).defaultTo(0);
    t.text('obs').defaultTo('');
    t.timestamps(true, true);
  });

  await db.schema.createTable('notas_saida_itens', (t) => {
    t.increments('id').primary();
    t.integer('nota_id').unsigned().notNullable().references('id').inTable('notas_saida').onDelete('CASCADE');
    t.integer('produto_id').unsigned().references('id').inTable('estoque').onDelete('SET NULL').nullable();
    t.string('nome', 200).notNullable();
    t.decimal('qtd', 10, 3).notNullable();
    t.decimal('vunit', 12, 2).notNullable();
    t.decimal('total', 12, 2).notNullable();
  });

  await db.schema.createTable('orcamentos', (t) => {
    t.increments('id').primary();
    t.string('numero', 10).notNullable();
    t.date('data').notNullable();
    t.date('validade').notNullable();
    t.integer('cliente_id').unsigned().references('id').inTable('clientes').onDelete('SET NULL').nullable();
    t.decimal('desconto', 12, 2).defaultTo(0);
    t.decimal('total', 12, 2).defaultTo(0);
    t.text('obs').defaultTo('');
    t.timestamps(true, true);
  });

  await db.schema.createTable('orcamentos_itens', (t) => {
    t.increments('id').primary();
    t.integer('orcamento_id').unsigned().notNullable().references('id').inTable('orcamentos').onDelete('CASCADE');
    t.integer('produto_id').unsigned().references('id').inTable('estoque').onDelete('SET NULL').nullable();
    t.string('nome', 200).notNullable();
    t.decimal('qtd', 10, 3).notNullable();
    t.decimal('vunit', 12, 2).notNullable();
    t.decimal('total', 12, 2).notNullable();
  });
}

async function seed() {
  const count = await db('estoque').count('id as n').first();
  if (Number(count.n) > 0) return;

  await db('estoque').insert([
    {codigo:'ME001',nome:'Mesa Executiva 160cm',    marca:'Plaxmetal',  categoria:'Mesas',   qtd:8, minimo:3,custo:680, venda:1280,un:'un'},
    {codigo:'CA001',nome:'Cadeira Presidente Giratória',marca:'Frisokar',categoria:'Cadeiras',qtd:2, minimo:5,custo:420, venda:850, un:'un'},
    {codigo:'ES001',nome:'Estante 6 Prateleiras',   marca:'Politorno',  categoria:'Estantes',qtd:12,minimo:4,custo:310, venda:620, un:'un'},
    {codigo:'FI001',nome:'Fichário de Aço 4 Gavetas',marca:'Aço Belo', categoria:'Arquivos',qtd:0, minimo:3,custo:540, venda:980, un:'un'},
    {codigo:'CA002',nome:'Cadeira Ergonômica Mesh', marca:'Encosto',    categoria:'Cadeiras',qtd:15,minimo:5,custo:280, venda:520, un:'un'},
    {codigo:'SO001',nome:'Sofá de Espera 3 Lugares',marca:'Recebimento',categoria:'Sofás',  qtd:3, minimo:2,custo:890, venda:1650,un:'un'},
  ]);

  await db('clientes').insert([
    {nome:'João Silva', empresa:'Advocacia Silva & Associados',email:'joao@silva.adv.br',    telefone:'(79) 9 9100-0001',cpfcnpj:'12.345.678/0001-90'},
    {nome:'Maria Costa',empresa:'Clínica Costa',              email:'maria@clinicacosta.com.br',telefone:'(79) 9 9200-0002',cpfcnpj:'98.765.432/0001-10'},
  ]);
}

module.exports = { migrate, seed };
