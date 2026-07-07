require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { migrate, seed } = require('./models/schema');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/estoque',    require('./routes/estoque'));
app.use('/api/clientes',   require('./routes/clientes'));
app.use('/api/notas',      require('./routes/notas'));
app.use('/api/orcamentos', require('./routes/orcamentos'));
app.use('/api/fiscal',     require('./routes/fiscal'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno no servidor' });
});

async function start() {
  try {
    await migrate();
    await seed();
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
      console.log(`Banco:  ${process.env.DB_CLIENT || 'sqlite'}`);
    });
  } catch (err) {
    console.error('Falha ao iniciar:', err.message);
    process.exit(1);
  }
}

start();
