require('dotenv').config();
const knex = require('knex');

const client = process.env.DB_CLIENT || 'sqlite';

const configs = {
  sqlite: {
    client: 'better-sqlite3',
    connection: {
      filename: process.env.DB_SQLITE_PATH || './database.sqlite',
    },
    useNullAsDefault: true,
  },

  postgres: {
    client: 'pg',
    connection: {
      host:     process.env.DB_HOST     || 'localhost',
      port:     process.env.DB_PORT     || 5432,
      database: process.env.DB_NAME     || 'ponto_escritorio',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
    },
    pool: { min: 2, max: 10 },
  },

  mysql2: {
    client: 'mysql2',
    connection: {
      host:     process.env.DB_HOST     || 'localhost',
      port:     process.env.DB_PORT     || 3306,
      database: process.env.DB_NAME     || 'ponto_escritorio',
      user:     process.env.DB_USER     || 'root',
      password: process.env.DB_PASSWORD || '',
    },
    pool: { min: 2, max: 10 },
  },
};

const db = knex(configs[client] || configs.sqlite);

module.exports = db;
