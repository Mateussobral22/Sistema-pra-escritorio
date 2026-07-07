const API = 'http://localhost:3001/api';

// ── Persistência local via localStorage ───────────────────────────────────
const LS_KEY = 'ponto_escritorio_db';

function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { estoque: [], clientes: [], notas: [], orcamentos: [],
           nextId: { estoque: 1, clientes: 1, notas: 1, orcamentos: 1 } };
}

function lsSave(db) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (_) {}
}

let useLocal = false;

function localDashboard() {
  const db = lsLoad();
  const e  = db.estoque;
  const valor_estoque = e.reduce((s,i) => s + i.qtd * i.venda, 0);
  const sem_estoque   = e.filter(i => i.qtd === 0).length;
  const estoque_baixo = e.filter(i => i.qtd > 0 && i.qtd <= i.minimo).length;
  const alertas       = e.filter(i => i.qtd <= i.minimo);
  return { total_itens: e.length, valor_estoque, sem_estoque, estoque_baixo, alertas };
}

function localNextNumero(tipo) {
  const db = lsLoad();
  const n  = tipo === 'notas' ? db.nextId.notas : db.nextId.orcamentos;
  return String(n).padStart(tipo === 'notas' ? 6 : 4, '0');
}

function localCriarNota(payload) {
  const db  = lsLoad();
  const id  = db.nextId.notas++;
  const cli = db.clientes.find(c => c.id === payload.cliente_id) || {};
  payload.itens.forEach(it => {
    const prod = db.estoque.find(e => e.id === it.id);
    if (prod) prod.qtd = Math.max(0, prod.qtd - it.qtd);
  });
  const nota = { id, ...payload, total: payload.itens.reduce((s,i)=>s+i.total,0),
    cliente_nome: cli.nome||'-', cliente_empresa: cli.empresa||'', itens: payload.itens };
  db.notas.push(nota);
  lsSave(db);
  return nota;
}

function localCriarOrcamento(payload) {
  const db  = lsLoad();
  const id  = db.nextId.orcamentos++;
  const cli = db.clientes.find(c => c.id === payload.cliente_id) || {};
  const desc = Number(payload.desconto) || 0;
  const subtotal = payload.itens.reduce((s,i)=>s+i.total,0);
  const orc = { id, ...payload, desconto: desc, total: Math.max(0, subtotal - desc),
    cliente_nome: cli.nome||'', cliente_empresa: cli.empresa||'', cliente_email: cli.email||'',
    cliente_telefone: cli.telefone||'', cliente_cpfcnpj: cli.cpfcnpj||'', cliente_endereco: cli.endereco||'',
    itens: payload.itens };
  db.orcamentos.push(orc);
  lsSave(db);
  return orc;
}

function localAtualizarOrcamento(id, payload) {
  const db  = lsLoad();
  const idx = db.orcamentos.findIndex(o => o.id === id);
  if (idx === -1) return null;
  const cli = db.clientes.find(c => c.id === payload.cliente_id) || {};
  const desc = Number(payload.desconto) || 0;
  const subtotal = payload.itens.reduce((s,i)=>s+i.total,0);
  const orc = { ...db.orcamentos[idx], ...payload, id,
    desconto: desc, total: Math.max(0, subtotal - desc),
    cliente_nome: cli.nome||'', cliente_empresa: cli.empresa||'', cliente_email: cli.email||'',
    cliente_telefone: cli.telefone||'', cliente_cpfcnpj: cli.cpfcnpj||'', cliente_endereco: cli.endereco||'',
    itens: payload.itens };
  db.orcamentos[idx] = orc;
  lsSave(db);
  return orc;
}

function localCriarProduto(data) {
  const db   = lsLoad();
  const item = { id: db.nextId.estoque++, ...data };
  db.estoque.push(item);
  lsSave(db);
  return item;
}

function localCriarCliente(data) {
  const db  = lsLoad();
  const cli = { id: db.nextId.clientes++, ...data };
  db.clientes.push(cli);
  lsSave(db);
  return cli;
}

function localEntradaXml(payload) {
  const db       = lsLoad();
  const resultado = [];
  (payload.items || []).forEach(it => {
    const exist = db.estoque.find(e => e.codigo === it.codigo);
    if (exist) {
      exist.qtd  += Number(it.qtd);
      exist.custo = it.vUnit;
      lsSave(db);
      resultado.push({ acao: 'atualizado', produto: exist });
    } else {
      const novo = { id: db.nextId.estoque++,
        codigo: it.codigo, nome: it.nome, marca: payload.fornecedor||'-',
        categoria: 'Importado', qtd: it.qtd, minimo: 2,
        custo: it.vUnit, venda: +(it.vUnit * 1.9).toFixed(2), un: it.un||'un',
      };
      db.estoque.push(novo);
      lsSave(db);
      resultado.push({ acao: 'criado', produto: novo });
    }
  });
  return { lancados: resultado.length, resultado };
}

// ── Camada de API com fallback automático ──────────────────────────────────
async function apiFetch(path, opts = {}) {
  if (useLocal) throw new Error('offline');
  try {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err) {
    if (err.message === 'Failed to fetch' || err.message === 'offline' || err.name === 'TypeError') {
      useLocal = true;
      throw err;
    }
    throw err;
  }
}

async function apiGet(path) {
  try { return await apiFetch(path); }
  catch {
    const db = lsLoad();
    if (path === '/estoque/dashboard')      return localDashboard();
    if (path === '/estoque')                return db.estoque;
    if (path === '/clientes')               return db.clientes;
    if (path === '/notas/next-numero')      return { numero: localNextNumero('notas') };
    if (path === '/orcamentos/next-numero') return { numero: localNextNumero('orcamentos') };
    if (path === '/notas')                  return db.notas || [];
    if (path === '/orcamentos')             return db.orcamentos || [];
    const orcMatch = path.match(/^\/orcamentos\/(\d+)$/);
    if (orcMatch) return db.orcamentos.find(o => o.id === parseInt(orcMatch[1])) || null;
    const notaMatch = path.match(/^\/notas\/(\d+)$/);
    if (notaMatch) return (db.notas || []).find(n => n.id === parseInt(notaMatch[1])) || null;
    return [];
  }
}

async function apiPost(path, body) {
  try { return await apiFetch(path, { method: 'POST', body: JSON.stringify(body) }); }
  catch {
    if (path === '/notas')              return localCriarNota(body);
    if (path === '/orcamentos')         return localCriarOrcamento(body);
    if (path === '/estoque')            return localCriarProduto(body);
    if (path === '/clientes')           return localCriarCliente(body);
    if (path === '/fiscal/entrada-xml') return localEntradaXml(body);
    throw new Error('Operação não disponível offline');
  }
}

async function apiPut(path, body) {
  try { return await apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }); }
  catch {
    const m = path.match(/^\/orcamentos\/(\d+)$/);
    if (m) return localAtualizarOrcamento(parseInt(m[1]), body);
    throw new Error('Operação não disponível offline');
  }
}

const api = {
  get:    apiGet,
  post:   apiPost,
  put:    apiPut,
  patch:  (path, body)  => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path)        => apiFetch(path, { method: 'DELETE' }),
};

let currentNav = 'dashboard';
let orcItems   = [];
let saidaItems = [];
let xmlParsed  = [];
let saidaDraft = { cliente_id: '', data: '', pagamento: '', obs: '' };
let orcDraft   = { cliente_id: '', validade: '', obs: '', desconto: 0 };
let orcEditId   = null;
let orcEditData = null;

function nav(page) {
  currentNav = page;
  if (page === 'orcamento') { orcEditId = null; orcEditData = null; }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + page + "'"))
      n.classList.add('active');
  });
  const titles = {
    dashboard: 'Dashboard',
    entrada:   'Nota de Entrada (XML)',
    saida:     'Emitir Pedido de Venda',
    orcamento: 'Orçamentos',
    faturamento: 'Faturamento',
    'historico-vendas': 'Histórico de Pedidos',
    estoque:   'Estoque',
    clientes:  'Clientes',
  };
  document.getElementById('page-title').textContent = titles[page] || page;
  render(page);
}

function render(page) {
  const c  = document.getElementById('content');
  const ta = document.getElementById('topbar-actions');
  ta.innerHTML = '';
  if (page === 'dashboard') renderDashboard(c);
  else if (page === 'entrada')   renderEntrada(c, ta);
  else if (page === 'saida')     renderSaida(c, ta);
  else if (page === 'orcamento') renderOrcamento(c, ta);
  else if (page === 'faturamento') renderFaturamento(c, ta);
  else if (page === 'historico-vendas') renderHistoricoVendas(c, ta);
  else if (page === 'estoque')   renderEstoque(c, ta);
  else if (page === 'clientes')  renderClientes(c, ta);
}

function loading(c) {
  c.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">Carregando...</div>`;
}

function showError(msg) {
  return `<div class="alert alert-danger"><i class="ti ti-alert-circle"></i>${msg}</div>`;
}

function checkOfflineBanner() {
  const existing = document.getElementById('offline-banner');
  if (useLocal && !existing) {
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.style.cssText = 'position:fixed;bottom:16px;right:16px;background:#2b1e0d;color:#e0a84a;border:1px solid rgba(224,168,74,0.3);border-radius:8px;padding:8px 14px;font-size:12px;z-index:9999;display:flex;align-items:center;gap:7px;font-family:var(--font-body)';
    banner.innerHTML = '<i class="ti ti-wifi-off" style="font-size:15px"></i> Modo offline — backend não encontrado';
    document.body.appendChild(banner);
  }
}

async function renderDashboard(c) {
  loading(c);
  try {
    const [stats, clientes] = await Promise.all([
      api.get('/estoque/dashboard'),
      api.get('/clientes'),
    ]);
    const total  = Number(stats.valor_estoque || 0);
    const sem    = Number(stats.sem_estoque   || 0);
    const baixo  = Number(stats.estoque_baixo || 0);
    const alertas = stats.alertas || [];
    checkOfflineBanner();

    c.innerHTML = `
    <div class="grid4">
      <div class="metric-card">
        <div class="metric-icon gold"><i class="ti ti-package"></i></div>
        <div class="metric-label">Itens no Estoque</div>
        <div class="metric-val">${stats.total_itens || 0}</div>
        <div class="metric-sub">produtos cadastrados</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon green"><i class="ti ti-coin"></i></div>
        <div class="metric-label">Valor em Estoque</div>
        <div class="metric-val">R$${total.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</div>
        <div class="metric-sub">a preço de venda</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon red"><i class="ti ti-alert-circle"></i></div>
        <div class="metric-label">Sem Estoque</div>
        <div class="metric-val">${sem}</div>
        <div class="metric-sub">itens esgotados</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon orange"><i class="ti ti-alert-triangle"></i></div>
        <div class="metric-label">Estoque Baixo</div>
        <div class="metric-val">${baixo}</div>
        <div class="metric-sub">abaixo do mínimo</div>
      </div>
    </div>
    <div class="grid2">
      <div class="card">
        <div class="section-title"><i class="ti ti-alert-triangle"></i> Atenção necessária</div>
        ${alertas.length
          ? alertas.map(i => `
            <div class="alert-row">
              <div><div style="font-size:13px;font-weight:500;color:var(--text)">${i.nome}</div><div style="font-size:11px;color:var(--text3);margin-top:2px">${i.codigo}</div></div>
              <span class="badge ${i.qtd == 0 ? 'badge-out' : 'badge-low'}">${i.qtd == 0 ? 'Esgotado' : 'Qtd: ' + i.qtd}</span>
            </div>`).join('')
          : '<p style="font-size:13px;color:var(--text3)">Nenhum alerta.</p>'}
      </div>
      <div class="card">
        <div class="section-title"><i class="ti ti-users"></i> Clientes cadastrados</div>
        ${clientes.map(cl => `
          <div class="alert-row">
            <div><div style="font-size:13px;font-weight:500;color:var(--text)">${cl.nome}</div><div style="font-size:11px;color:var(--text3);margin-top:2px">${cl.empresa} · ${cl.email}</div></div>
          </div>`).join('')}
        <div style="margin-top:12px"><button class="btn btn-sm" onclick="nav('clientes')">Ver todos</button></div>
      </div>
    </div>`;
  } catch (err) {
    c.innerHTML = showError('Falha ao carregar dashboard: ' + err.message);
  }
}

function renderEntrada(c, ta) {
  ta.innerHTML = `<label class="btn" for="file-input"><i class="ti ti-upload"></i> Importar XML</label><input type="file" id="file-input" accept=".xml" onchange="handleXML(this)">`;
  c.innerHTML = `
  <div class="card" style="margin-bottom:16px">
    <div class="section-title"><i class="ti ti-file-code"></i> Importar NF-e em XML</div>
    <div class="drop-area" id="drop-area" onclick="document.getElementById('file-input2').click()">
      <i class="ti ti-cloud-upload"></i>
      <p>Arraste o arquivo XML da NF-e aqui</p>
      <span>ou clique para selecionar</span>
      <input type="file" id="file-input2" accept=".xml" style="display:none" onchange="handleXML(this)">
    </div>
    <div id="xml-status"></div>
    <div id="xml-result" class="xml-result"></div>
    <div id="xml-confirm" class="hidden" style="margin-top:12px">
      <button class="btn btn-primary" onclick="confirmarEntrada()"><i class="ti ti-check"></i> Confirmar e lançar no estoque</button>
    </div>
  </div>`;
  setupDrop();
}

function setupDrop() {
  const da = document.getElementById('drop-area');
  if (!da) return;
  da.addEventListener('dragover', e => { e.preventDefault(); da.classList.add('dragover'); });
  da.addEventListener('dragleave', () => da.classList.remove('dragover'));
  da.addEventListener('drop', e => {
    e.preventDefault(); da.classList.remove('dragover');
    const f = e.dataTransfer.files[0]; if (f) parseXMLFile(f);
  });
}

function handleXML(inp) {
  if (inp.files && inp.files[0]) parseXMLFile(inp.files[0]);
}

function parseXMLFile(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const parser = new DOMParser();
      const xml    = parser.parseFromString(e.target.result, 'text/xml');
      const ns     = 'http://www.portalfiscal.inf.br/nfe';
      const get    = (el, tag) => {
        const f = el.getElementsByTagNameNS(ns, tag)[0] || el.getElementsByTagName(tag)[0];
        return f ? f.textContent : '';
      };
      const infNFe = xml.getElementsByTagNameNS(ns, 'infNFe')[0] || xml.getElementsByTagName('infNFe')[0];
      if (!infNFe) { showXMLError('Arquivo XML inválido ou não é uma NF-e.'); return; }
      const emit       = infNFe.getElementsByTagNameNS(ns, 'emit')[0] || infNFe.getElementsByTagName('emit')[0];
      const fornecedor = get(emit, 'xNome');
      const cnpjForn   = get(emit, 'CNPJ');
      const dEmi       = get(infNFe, 'dhEmi') || get(infNFe, 'dEmi');
      const chave      = (infNFe.getAttribute('Id') || '').replace('NFe', '').substring(0, 44);
      const nNF        = get(infNFe, 'nNF');
      const dets       = infNFe.getElementsByTagNameNS(ns, 'det');
      const items      = [];
      for (let i = 0; i < dets.length; i++) {
        const det  = dets[i];
        const prod = det.getElementsByTagNameNS(ns, 'prod')[0] || det.getElementsByTagName('prod')[0];
        if (!prod) continue;
        items.push({
          nome:   get(prod, 'xProd'),
          codigo: get(prod, 'cProd'),
          qtd:    parseFloat(get(prod, 'qCom'))   || 1,
          un:     get(prod, 'uCom') || 'UN',
          vUnit:  parseFloat(get(prod, 'vUnCom')) || 0,
          vTotal: parseFloat(get(prod, 'vProd'))  || 0,
          ncm:    get(prod, 'NCM'),
        });
      }
      xmlParsed = { fornecedor, cnpjForn, dEmi, chave, nNF, items };
      showXMLResult(xmlParsed);
    } catch (err) { showXMLError('Erro ao processar XML: ' + err.message); }
  };
  reader.readAsText(file, 'utf-8');
}

function showXMLError(msg) {
  document.getElementById('xml-status').innerHTML = `<div class="alert alert-danger"><i class="ti ti-x-circle"></i>${msg}</div>`;
  document.getElementById('xml-result').innerHTML = '';
  document.getElementById('xml-confirm').classList.add('hidden');
}

function showXMLResult(data) {
  document.getElementById('xml-status').innerHTML = `<div class="alert alert-success" style="margin-top:12px"><i class="ti ti-check"></i>NF-e nº ${data.nNF} lida com sucesso — ${data.items.length} itens encontrados</div>`;
  let html = `<div style="margin-bottom:10px;font-size:12px;color:var(--text2)">
    <strong>Fornecedor:</strong> ${data.fornecedor} &nbsp;·&nbsp; <strong>CNPJ:</strong> ${data.cnpjForn} &nbsp;·&nbsp;
    <strong>Data:</strong> ${data.dEmi ? data.dEmi.substring(0, 10) : '-'} &nbsp;·&nbsp;
    <strong>Chave:</strong> ${data.chave ? data.chave.substring(0, 20) + '...' : '-'}
  </div>`;
  html += `<div class="xml-item-header"><span>Produto</span><span>Qtd</span><span>V. Unit.</span><span>Total</span></div>`;
  data.items.forEach((it, i) => {
    html += `<div class="xml-item-row">
      <div><div style="font-size:13px;font-weight:500;color:var(--text)">${it.nome}</div><div style="font-size:11px;color:var(--text3)">${it.codigo} · ${it.ncm}</div></div>
      <div><input type="number" value="${it.qtd}" style="width:70px;text-align:right" id="xml-qtd-${i}" onchange="xmlParsed.items[${i}].qtd=parseFloat(this.value)"></div>
      <div style="font-size:13px;text-align:right;color:var(--text2)">R$ ${it.vUnit.toFixed(2)}</div>
      <div style="font-size:13px;font-weight:500;text-align:right;color:var(--text)">R$ ${it.vTotal.toFixed(2)}</div>
    </div>`;
  });
  document.getElementById('xml-result').innerHTML = html;
  document.getElementById('xml-confirm').classList.remove('hidden');
}

async function confirmarEntrada() {
  if (!xmlParsed || !xmlParsed.items) return;
  const btn = document.querySelector('#xml-confirm .btn-primary');
  btn.disabled = true; btn.textContent = 'Processando...';
  try {
    const res = await api.post('/fiscal/entrada-xml', xmlParsed);
    document.getElementById('xml-status').innerHTML = `<div class="alert alert-success"><i class="ti ti-check"></i><strong>${res.lancados} itens</strong> lançados no estoque com sucesso!</div>`;
    document.getElementById('xml-result').innerHTML = '';
    document.getElementById('xml-confirm').classList.add('hidden');
    xmlParsed = [];
  } catch (err) {
    document.getElementById('xml-status').innerHTML = `<div class="alert alert-danger"><i class="ti ti-alert-circle"></i>${err.message}</div>`;
    btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Confirmar e lançar no estoque';
  }
}

async function renderSaida(c, ta) {
  loading(c);
  try {
    const [clientes, estoque, nextNum] = await Promise.all([
      api.get('/clientes'),
      api.get('/estoque'),
      api.get('/notas/next-numero'),
    ]);
    const clienteOpts = clientes.map(cl => `<option value="${cl.id}"${String(cl.id)===String(saidaDraft.cliente_id)?' selected':''}>${cl.nome} — ${cl.empresa}</option>`).join('');
    const estoqueOpts = estoque.map(e  => `<option value="${e.id}" data-preco="${e.venda}" data-nome="${e.nome}" data-qtd="${e.qtd}" data-codigo="${e.codigo}">${e.nome} (Estq: ${e.qtd})</option>`).join('');
    const dataVal = saidaDraft.data || new Date().toISOString().substring(0, 10);
    c.innerHTML = `
    <div class="card">
      <div class="nota-saida-form">
        <div class="form-row"><label>Cliente</label><select id="s-cliente" onchange="saidaDraft.cliente_id=this.value">${clienteOpts}</select></div>
        <div class="form-row"><label>Número da Nota</label><input id="s-num" value="${nextNum.numero}" readonly></div>
        <div class="form-row"><label>Data de Emissão</label><input type="date" id="s-data" value="${dataVal}" onchange="saidaDraft.data=this.value"></div>
        <div class="form-row"><label>Condição de Pagamento</label><select id="s-pag" onchange="saidaDraft.pagamento=this.value">
          ${['À Vista','30 dias','30/60 dias','30/60/90 dias','Crédito à Vista','Crédito Parcelado','Boleto','Negociação'].map(p => `<option${p===saidaDraft.pagamento?' selected':''}>${p}</option>`).join('')}
        </select></div>
        <div class="form-row nota-items-area">
          <div class="section-title"><i class="ti ti-package"></i>Itens da Nota</div>
          <div class="form-row"><label>Buscar por código</label><input id="s-busca-cod" placeholder="Digite o código do produto..." oninput="buscarProdutoPorCodigoSaida(this.value)"></div>
          <div class="nota-item-add">
            <div><label>Produto</label><select id="s-prod">${estoqueOpts}</select></div>
            <div><label>Qtd</label><input type="number" id="s-qtd" value="1" min="1"></div>
            <div><label>Valor Unit.</label><input type="number" id="s-vunit" step="0.01" value="0"></div>
            <button class="btn btn-primary" onclick="addSaidaItem()" style="width:38px;padding:8px;justify-content:center"><i class="ti ti-plus"></i></button>
          </div>
          <div id="saida-items-list"></div>
          <div class="total-box" id="saida-total" style="display:none"></div>
        </div>
        <div class="form-row" style="grid-column:1/-1"><label>Observações</label><textarea id="s-obs" rows="2" placeholder="Observações internas..." oninput="saidaDraft.obs=this.value">${saidaDraft.obs || ''}</textarea></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary" onclick="emitirNota()"><i class="ti ti-file-check"></i> Emitir Pedido de Venda</button>
      </div>
      <div id="nota-preview"></div>
    </div>`;
    document.getElementById('s-prod').addEventListener('change', function () {
      document.getElementById('s-vunit').value = this.options[this.selectedIndex].dataset.preco || 0;
    });
    const fp = document.getElementById('s-prod');
    if (fp.options.length) document.getElementById('s-vunit').value = fp.options[fp.selectedIndex].dataset.preco || 0;
    renderSaidaItems();
  } catch (err) {
    c.innerHTML = showError('Falha ao carregar: ' + err.message);
  }
}

function buscarProdutoPorCodigoSaida(v) {
  const sel = document.getElementById('s-prod');
  if (!v) return;
  const opt = Array.from(sel.options).find(o => (o.dataset.codigo || '').toLowerCase() === v.toLowerCase());
  if (opt) {
    sel.value = opt.value;
    document.getElementById('s-vunit').value = opt.dataset.preco || 0;
  }
}

function addSaidaItem() {
  const sel    = document.getElementById('s-prod');
  const opt    = sel.options[sel.selectedIndex];
  const id     = parseInt(sel.value);
  const qtd    = parseFloat(document.getElementById('s-qtd').value)   || 1;
  const vunit  = parseFloat(document.getElementById('s-vunit').value) || 0;
  const nome   = opt.dataset.nome;
  const estoque = parseInt(opt.dataset.qtd) || 0;
  if (qtd > estoque) { alert('Quantidade indisponível no estoque (disponível: ' + estoque + ')'); return; }
  const exist = saidaItems.findIndex(i => i.id === id);
  if (exist >= 0) { saidaItems[exist].qtd += qtd; saidaItems[exist].total = saidaItems[exist].qtd * saidaItems[exist].vunit; }
  else saidaItems.push({ id, nome, qtd, vunit, total: qtd * vunit, estoque });
  renderSaidaItems();
}

function renderSaidaItems() {
  const list = document.getElementById('saida-items-list');
  if (!saidaItems.length) { list.innerHTML = ''; document.getElementById('saida-total').style.display = 'none'; return; }
  let html = `<div class="nota-item-header"><span>Produto</span><span>Qtd</span><span>V. Unit.</span><span>Total</span><span></span></div>`;
  saidaItems.forEach((it, i) => {
    html += `<div class="nota-item-entry">
      <input value="${it.nome}" onchange="editarNomeSaidaItem(${i}, this.value)" style="border:none;background:none;padding:2px 4px">
      <span>${it.qtd}</span>
      <span>R$ ${it.vunit.toFixed(2)}</span>
      <span style="font-weight:500;color:var(--text)">R$ ${it.total.toFixed(2)}</span>
      <button class="btn btn-sm" onclick="removeSaidaItem(${i})" style="padding:3px 7px;color:var(--danger)"><i class="ti ti-x"></i></button>
    </div>`;
  });
  list.innerHTML = html;
  const sub = saidaItems.reduce((s, i) => s + i.total, 0);
  const totalDiv = document.getElementById('saida-total');
  totalDiv.style.display = 'block';
  totalDiv.innerHTML = `<div class="total-row"><span>Subtotal</span><span>R$ ${sub.toFixed(2)}</span></div><div class="total-row main-total"><span>Total</span><span>R$ ${sub.toFixed(2)}</span></div>`;
}

function editarNomeSaidaItem(i, valor) {
  if (!saidaItems[i]) return;
  saidaItems[i].nome = valor.trim() || saidaItems[i].nome;
}

function removeSaidaItem(i) { saidaItems.splice(i, 1); renderSaidaItems(); }

async function emitirNota() {
  if (!saidaItems.length) { alert('Adicione ao menos um item.'); return; }
  const btn = document.querySelector('.btn-primary[onclick="emitirNota()"]');
  btn.disabled = true; btn.textContent = 'Emitindo...';
  try {
    const payload = {
      numero:     document.getElementById('s-num').value,
      data:       document.getElementById('s-data').value,
      cliente_id: parseInt(document.getElementById('s-cliente').value),
      pagamento:  document.getElementById('s-pag').value,
      obs:        document.getElementById('s-obs').value,
      itens:      saidaItems,
    };
    const nota = await api.post('/notas', payload);
    const sub  = nota.total;
    const p = document.getElementById('nota-preview');
    p.innerHTML = `
    <div class="preview-nota">
      <div class="preview-header">
        <div>
          <svg width="36" height="36" viewBox="0 0 100 100" fill="none" style="margin-bottom:6px;color:var(--gold)">
            <line x1="28" y1="10" x2="28" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
            <path d="M28 10 Q28 10 55 10 Q82 10 82 38 Q82 65 55 65 Q28 65 28 65" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
            <circle cx="55" cy="38" r="9" fill="currentColor"/>
          </svg>
          <div class="preview-title">Ponto do Escritório</div>
          <div style="font-size:12px;color:var(--text3)">Pedido de Venda</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:500;color:var(--text)">Nº ${nota.numero}</div>
          <div style="font-size:12px;color:var(--text3)">Data: ${nota.data}</div>
          <span class="badge badge-ok" style="margin-top:4px">Emitida</span>
        </div>
      </div>
      <div class="grid2" style="margin-bottom:12px">
        <div><div style="font-size:11px;color:var(--text3)">Cliente</div><div style="font-size:14px;font-weight:500;color:var(--text)">${nota.cliente_nome || '-'}</div><div style="font-size:12px;color:var(--text3)">${nota.cliente_empresa || ''}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Pagamento</div><div style="font-size:14px;color:var(--text2)">${nota.pagamento}</div></div>
      </div>
      <table style="margin-bottom:12px"><thead><tr><th>Produto</th><th>Qtd</th><th>V. Unit.</th><th>Total</th></tr></thead><tbody>
        ${nota.itens.map(it => `<tr><td>${it.nome}</td><td>${it.qtd}</td><td>R$ ${Number(it.vunit).toFixed(2)}</td><td style="font-weight:500;color:var(--text)">R$ ${Number(it.total).toFixed(2)}</td></tr>`).join('')}
      </tbody></table>
      <div style="text-align:right;font-size:16px;font-weight:600;padding:10px 0;border-top:1px solid var(--border);color:var(--gold);font-family:var(--font-display)">Total: R$ ${Number(sub).toFixed(2)}</div>
      ${nota.obs ? `<div style="font-size:12px;color:var(--text3);margin-top:6px">Obs: ${nota.obs}</div>` : ''}
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-primary" onclick="window.print()"><i class="ti ti-printer"></i> Imprimir</button>
        <button class="btn btn-primary" onclick="baixarPdfNota(${nota.id})"><i class="ti ti-file-download"></i> Baixar PDF</button>
        <button class="btn" onclick="novaNotaSaida()"><i class="ti ti-plus"></i> Nova Nota</button>
      </div>
    </div>`;
    saidaItems = [];
    saidaDraft = { cliente_id: '', data: '', pagamento: '', obs: '' };
  } catch (err) {
    alert('Erro ao emitir nota: ' + err.message);
    btn.disabled = false; btn.innerHTML = '<i class="ti ti-file-check"></i> Emitir Pedido de Venda';
  }
}

function novaNotaSaida() {
  saidaItems = [];
  saidaDraft = { cliente_id: '', data: '', pagamento: '', obs: '' };
  nav('saida');
}

async function renderFaturamento(c, ta) {
  loading(c);
  try {
    const notas = await api.get('/notas');
    const totalFaturado = notas.reduce((s, n) => s + Number(n.total || 0), 0);
    const qtdNotas     = notas.length;
    const ticketMedio  = qtdNotas ? totalFaturado / qtdNotas : 0;
    const notasCartao  = notas.filter(n => /cart[ãa]o|cr[ée]dito/i.test(n.pagamento || ''));
    const totalCartao  = notasCartao.reduce((s, n) => s + Number(n.total || 0), 0);
    c.innerHTML = `
    <div class="grid4">
      <div class="metric-card">
        <div class="metric-icon gold"><i class="ti ti-report-money"></i></div>
        <div class="metric-label">Total Faturado</div>
        <div class="metric-val">R$${totalFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        <div class="metric-sub">soma de todos os pedidos</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon green"><i class="ti ti-file-invoice"></i></div>
        <div class="metric-label">Pedidos Emitidos</div>
        <div class="metric-val">${qtdNotas}</div>
        <div class="metric-sub">notas de venda</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon orange"><i class="ti ti-coin"></i></div>
        <div class="metric-label">Ticket Médio</div>
        <div class="metric-val">R$${ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        <div class="metric-sub">por pedido</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon blue"><i class="ti ti-credit-card"></i></div>
        <div class="metric-label">Vendido no Cartão</div>
        <div class="metric-val">R$${totalCartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        <div class="metric-sub">${notasCartao.length} pedido(s) no cartão</div>
      </div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="section-title"><i class="ti ti-report-money"></i> Pedidos de Venda</div>
        <div><button class="btn btn-sm" onclick="nav('historico-vendas')" style="padding:3px 10px"><i class="ti ti-history"></i> Ver histórico</button></div>
      </div>
      ${notas.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Pagamento</th><th>Total</th><th></th></tr></thead>
        <tbody>
          ${notas.map(n => `
            <tr>
              <td><span class="badge badge-gray">${n.numero}</span></td>
              <td>${n.data}</td>
              <td style="font-weight:500;color:var(--text)">${n.cliente_nome || '-'}${n.cliente_empresa ? ' · ' + n.cliente_empresa : ''}</td>
              <td>${n.pagamento || '-'}</td>
              <td style="font-weight:500;color:var(--text)">R$ ${Number(n.total).toFixed(2)}</td>
              <td><button class="btn btn-sm" onclick="verNota(${n.id})" style="padding:3px 10px"><i class="ti ti-eye"></i> Ver</button>
                  <button class="btn btn-sm" onclick="event.stopPropagation();baixarPdfNota(${n.id})" style="padding:3px 10px"><i class="ti ti-file-download"></i> PDF</button>
                  <button class="btn btn-sm" onclick="event.stopPropagation();excluirNota(${n.id})" style="padding:3px 10px;color:var(--danger)"><i class="ti ti-trash"></i> Excluir</button></td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : '<p style="font-size:13px;color:var(--text3)">Nenhum pedido de venda emitido ainda.</p>'}
    </div>`;
  } catch (err) {
    c.innerHTML = showError('Falha ao carregar faturamento: ' + err.message);
  }
}

async function renderHistoricoVendas(c, ta) {
  loading(c);
  try {
    const notas = await api.get('/notas');
    const totalFaturado = notas.reduce((s, n) => s + Number(n.total || 0), 0);
    const qtdNotas = notas.length;
    c.innerHTML = `
    <div class="grid4">
      <div class="metric-card">
        <div class="metric-icon green"><i class="ti ti-file-invoice"></i></div>
        <div class="metric-label">Pedidos Emitidos</div>
        <div class="metric-val">${qtdNotas}</div>
        <div class="metric-sub">no histórico</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon gold"><i class="ti ti-report-money"></i></div>
        <div class="metric-label">Total Faturado</div>
        <div class="metric-val">R$${totalFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        <div class="metric-sub">soma dos pedidos</div>
      </div>
    </div>
    <div class="card" id="historico-vendas-wrap">
      <div class="section-title"><i class="ti ti-history"></i> Histórico de Pedidos de Venda</div>
      ${notas.length ? '' : '<p style="font-size:13px;color:var(--text3)">Nenhum pedido de venda no histórico.</p>'}
    </div>`;
    renderHistoricoVendasBody(notas);
  } catch (err) {
    c.innerHTML = showError('Falha ao carregar histórico: ' + err.message);
  }
}

function renderHistoricoVendasBody(notas) {
  const wrap = document.getElementById('historico-vendas-wrap');
  if (!wrap) return;
  if (!notas || !notas.length) {
    wrap.innerHTML = '<div class="section-title"><i class="ti ti-history"></i> Histórico de Pedidos de Venda</div><p style="font-size:13px;color:var(--text3)">Nenhum pedido de venda no histórico.</p>';
    return;
  }
  wrap.innerHTML = `<div class="section-title"><i class="ti ti-history"></i> Histórico de Pedidos de Venda</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Pagamento</th><th>Total</th><th>Ações</th></tr></thead>
      <tbody>
        ${notas.slice().reverse().map(n => `
          <tr>
            <td><span class="badge badge-gray">${n.numero}</span></td>
            <td>${n.data}</td>
            <td style="font-weight:500;color:var(--text)">${n.cliente_nome || '-'}${n.cliente_empresa ? ' · ' + n.cliente_empresa : ''}</td>
            <td>${n.pagamento || '-'}</td>
            <td style="font-weight:500;color:var(--text)">R$ ${Number(n.total).toFixed(2)}</td>
            <td>
              <button class="btn btn-sm" onclick="verNota(${n.id})" style="padding:3px 10px"><i class="ti ti-eye"></i> Ver</button>
              <button class="btn btn-sm" onclick="event.stopPropagation();baixarPdfNota(${n.id})" style="padding:3px 10px"><i class="ti ti-file-download"></i> PDF</button>
              <button class="btn btn-sm" onclick="event.stopPropagation();excluirNota(${n.id})" style="padding:3px 10px;color:var(--danger)"><i class="ti ti-trash"></i> Excluir</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table></div>`;
}

function excluirNota(id) {
  const db = lsLoad();
  const nota = (db.notas || []).find(n => n.id === id);
  if (!nota) { alert('Pedido não encontrado.'); return; }
  if (!confirm('Excluir o pedido de venda Nº ' + nota.numero + '? Esta ação não pode ser desfeita.')) return;
  db.notas = db.notas.filter(n => n.id !== id);
  if (Array.isArray(nota.itens)) {
    nota.itens.forEach(it => {
      const prod = db.estoque.find(e => e.id === it.id);
      if (prod) prod.qtd += Number(it.qtd) || 0;
    });
  }
  lsSave(db);
  renderHistoricoVendas(document.getElementById('content'), document.getElementById('topbar-actions'));
}

async function verNota(id) {
  const c  = document.getElementById('content');
  const ta = document.getElementById('topbar-actions');
  try {
    const nota = await api.get(`/notas/${id}`);
    if (!nota) { alert('Pedido não encontrado.'); return; }
    ta.innerHTML = `<button class="btn" onclick="nav('historico-vendas')"><i class="ti ti-arrow-left"></i> Voltar</button>`;
    c.innerHTML = `
    <div class="preview-nota">
      <div class="preview-header">
        <div>
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none" style="margin-bottom:4px;color:var(--gold)">
            <line x1="28" y1="10" x2="28" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
            <path d="M28 10 Q28 10 55 10 Q82 10 82 38 Q82 65 55 65 Q28 65 28 65" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
            <circle cx="55" cy="38" r="9" fill="currentColor"/>
          </svg>
          <div style="font-size:15px;font-weight:500;font-family:var(--font-display);color:var(--text)">Ponto do Escritório</div>
          <div style="font-size:12px;color:var(--text3)">Pedido de Venda</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:500;color:var(--text)">Nº ${nota.numero}</div>
          <div style="font-size:12px;color:var(--text3)">Data: ${nota.data}</div>
          <span class="badge badge-ok" style="margin-top:4px">Emitida</span>
        </div>
      </div>
      <div class="grid2" style="margin-bottom:12px">
        <div><div style="font-size:11px;color:var(--text3)">Cliente</div><div style="font-size:14px;font-weight:500;color:var(--text)">${nota.cliente_nome || '-'}</div><div style="font-size:12px;color:var(--text3)">${nota.cliente_empresa || ''}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Pagamento</div><div style="font-size:14px;color:var(--text2)">${nota.pagamento || '-'}</div></div>
      </div>
      <table style="margin-bottom:12px"><thead><tr><th>Produto</th><th>Qtd</th><th>V. Unit.</th><th>Total</th></tr></thead><tbody>
        ${nota.itens.map(it => `<tr><td>${it.nome}</td><td>${it.qtd}</td><td>R$ ${Number(it.vunit).toFixed(2)}</td><td style="font-weight:500;color:var(--text)">R$ ${Number(it.total).toFixed(2)}</td></tr>`).join('')}
      </tbody></table>
      <div style="text-align:right;font-size:16px;font-weight:600;padding:10px 0;border-top:1px solid var(--border);color:var(--gold);font-family:var(--font-display)">Total: R$ ${Number(nota.total).toFixed(2)}</div>
      ${nota.obs ? `<div style="font-size:12px;color:var(--text3);margin-top:6px">Obs: ${nota.obs}</div>` : ''}
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-primary" onclick="window.print()"><i class="ti ti-printer"></i> Imprimir</button>
        <button class="btn btn-primary" onclick="baixarPdfNota(${nota.id})"><i class="ti ti-file-download"></i> Baixar PDF</button>
        <button class="btn" style="color:var(--danger)" onclick="excluirNota(${nota.id})"><i class="ti ti-trash"></i> Excluir</button>
        <button class="btn" onclick="nav('historico-vendas')"><i class="ti ti-arrow-left"></i> Voltar</button>
      </div>
    </div>`;
  } catch (err) {
    c.innerHTML = showError('Falha ao carregar pedido: ' + err.message);
  }
}

async function renderOrcamento(c, ta, aba) {
  loading(c);
  const abaAtiva = aba || 'novo';
  const editando = !!orcEditId;
  ta.innerHTML = editando
    ? `<button class="btn btn-primary" onclick="salvarOrcamento()"><i class="ti ti-device-floppy"></i> Salvar Alterações</button>
       <button class="btn" onclick="novoOrcamento()"><i class="ti ti-x"></i> Cancelar Edição</button>`
    : `<button class="btn btn-primary" onclick="salvarOrcamento()"><i class="ti ti-device-floppy"></i> Salvar Orçamento</button>`;

  const tabsHtml = `
  <div style="display:flex;gap:0;margin-bottom:16px;border-bottom:1px solid var(--border)">
    <button onclick="renderOrcamento(document.getElementById('content'),document.getElementById('topbar-actions'),'novo')"
      style="padding:8px 20px;border:none;background:none;cursor:pointer;font-size:13px;font-family:var(--font-body);
             border-bottom:2px solid ${abaAtiva==='novo'?'var(--gold)':'transparent'};
             color:${abaAtiva==='novo'?'var(--gold)':'var(--text3)'}">
      <i class="ti ti-plus"></i> Novo Orçamento
    </button>
    <button onclick="renderOrcamento(document.getElementById('content'),document.getElementById('topbar-actions'),'historico')"
      style="padding:8px 20px;border:none;background:none;cursor:pointer;font-size:13px;font-family:var(--font-body);
             border-bottom:2px solid ${abaAtiva==='historico'?'var(--gold)':'transparent'};
             color:${abaAtiva==='historico'?'var(--gold)':'var(--text3)'}">
      <i class="ti ti-history"></i> Histórico
    </button>
  </div>`;

  if (abaAtiva === 'historico') {
    ta.innerHTML = '';
    const db = lsLoad();
    const lista = db.orcamentos || [];
    c.innerHTML = tabsHtml + `<div class="card" id="orc-historico-wrap"></div>`;
    const wrap = document.getElementById('orc-historico-wrap');
    if (!lista.length) {
      wrap.innerHTML = '<p style="font-size:13px;color:var(--text3)">Nenhum orçamento salvo ainda.</p>';
      return;
    }
    wrap.innerHTML = lista.slice().reverse().map(orc => `
      <div style="border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="verOrcamento(${orc.id})">
          <div>
            <span style="font-size:13px;font-weight:600;color:var(--text)">Nº ${orc.numero}</span>
            <span style="font-size:12px;color:var(--text3);margin-left:10px">${orc.data}</span>
          </div>
          <span style="font-size:14px;font-weight:600;color:var(--gold)">R$ ${Number(orc.total).toFixed(2)}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px;cursor:pointer" onclick="verOrcamento(${orc.id})">${orc.cliente_nome || 'Sem cliente'} ${orc.cliente_empresa ? '· ' + orc.cliente_empresa : ''}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
          <span style="font-size:11px;color:var(--text3);cursor:pointer" onclick="verOrcamento(${orc.id})">Válido até: ${orc.validade} · ${orc.itens.length} item(ns)</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" onclick="event.stopPropagation();editarOrcamento(${orc.id})" style="padding:3px 10px"><i class="ti ti-edit"></i> Editar</button>
            <button class="btn btn-sm" onclick="event.stopPropagation();baixarPdfOrcamento(${orc.id})" style="padding:3px 10px"><i class="ti ti-file-download"></i> PDF</button>
          </div>
        </div>
      </div>`).join('');
    return;
  }

  try {
    const [clientes, estoque, nextNum] = await Promise.all([
      api.get('/clientes'),
      api.get('/estoque'),
      api.get('/orcamentos/next-numero'),
    ]);
    const clienteOpts = '<option value="">Selecione o cliente...</option>' + clientes.map(cl => `<option value="${cl.id}"${String(cl.id)===String(orcDraft.cliente_id)?' selected':''}>${cl.nome} — ${cl.empresa}</option>`).join('');
    const estoqueOpts = estoque.map(e => `<option value="${e.id}" data-preco="${e.venda}" data-nome="${e.nome}" data-codigo="${e.codigo}">${e.nome}</option>`).join('');
    const validadeVal = orcDraft.validade || new Date(Date.now() + 7 * 864e5).toISOString().substring(0, 10);
    c.innerHTML = tabsHtml + `
    <div class="card">
      ${editando ? `<div class="alert" style="background:var(--bg3);color:var(--text2);margin-bottom:14px"><i class="ti ti-edit"></i> Editando orçamento Nº ${orcEditData.numero}</div>` : ''}
      <div class="grid2">
        <div class="form-row"><label>Cliente</label><select id="o-cliente" onchange="orcDraft.cliente_id=this.value">${clienteOpts}</select></div>
        <div class="form-row"><label>Validade do Orçamento</label><input type="date" id="o-validade" value="${validadeVal}" onchange="orcDraft.validade=this.value"></div>
      </div>
      <hr class="divider">
      <div class="section-title"><i class="ti ti-list"></i>Adicionar Produtos</div>
      <div class="form-row"><label>Buscar por código</label><input id="o-busca-cod" placeholder="Digite o código do produto..." oninput="buscarProdutoPorCodigoOrc(this.value)"></div>
      <div style="display:grid;grid-template-columns:2fr 80px 120px 38px;gap:8px;align-items:end;margin-bottom:12px">
        <div><label>Produto</label><select id="o-prod">${estoqueOpts}</select></div>
        <div><label>Qtd</label><input type="number" id="o-qtd" value="1" min="1"></div>
        <div><label>Valor Unit.</label><input type="number" id="o-vunit" step="0.01"></div>
        <button class="btn btn-primary" onclick="addOrcItem()" style="width:38px;padding:8px;justify-content:center"><i class="ti ti-plus"></i></button>
      </div>
      <div id="orc-items"></div>
      <div class="form-row" style="max-width:220px"><label>Desconto (R$)</label><input type="number" id="o-desconto" step="0.01" min="0" value="${orcDraft.desconto || 0}" oninput="orcDraft.desconto=parseFloat(this.value)||0;renderOrcItems()"></div>
      <div id="orc-total"></div>
      <hr class="divider">
      <div class="form-row"><label>Observações / Condições</label><textarea id="o-obs" rows="3" placeholder="Ex: Frete incluso para Aracaju, Entrega em 10 dias úteis..." oninput="orcDraft.obs=this.value">${orcDraft.obs || ''}</textarea></div>
      <div id="orc-preview"></div>
    </div>`;
    document.getElementById('o-prod').addEventListener('change', function () {
      document.getElementById('o-vunit').value = this.options[this.selectedIndex].dataset.preco || 0;
    });
    const fp = document.getElementById('o-prod');
    if (fp.options.length) document.getElementById('o-vunit').value = fp.options[fp.selectedIndex].dataset.preco || 0;
    renderOrcItems();
  } catch (err) {
    c.innerHTML = showError('Falha ao carregar: ' + err.message);
  }
}

function buscarProdutoPorCodigoOrc(v) {
  const sel = document.getElementById('o-prod');
  if (!v) return;
  const opt = Array.from(sel.options).find(o => (o.dataset.codigo || '').toLowerCase() === v.toLowerCase());
  if (opt) {
    sel.value = opt.value;
    document.getElementById('o-vunit').value = opt.dataset.preco || 0;
  }
}

function verOrcamento(id) {
  const db  = lsLoad();
  const orc = db.orcamentos.find(o => o.id === id);
  if (!orc) return;
  const c = document.getElementById('content');
  const ta = document.getElementById('topbar-actions');
  ta.innerHTML = `<button class="btn" onclick="renderOrcamento(document.getElementById('content'),document.getElementById('topbar-actions'),'historico')"><i class="ti ti-arrow-left"></i> Voltar</button>`;
  c.innerHTML = `
  <div class="preview-nota">
    <div class="preview-header">
      <div>
        <svg width="32" height="32" viewBox="0 0 100 100" fill="none" style="margin-bottom:4px;color:var(--gold)">
          <line x1="28" y1="10" x2="28" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
          <path d="M28 10 Q28 10 55 10 Q82 10 82 38 Q82 65 55 65 Q28 65 28 65" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
          <circle cx="55" cy="38" r="9" fill="currentColor"/>
        </svg>
        <div style="font-size:15px;font-weight:500;font-family:var(--font-display);color:var(--text)">Ponto do Escritório</div>
        <div style="font-size:12px;color:var(--text3)">Orçamento</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:16px;font-weight:500;color:var(--text)">Nº ${orc.numero}</div>
        <div style="font-size:12px;color:var(--text3)">Emitido: ${orc.data}</div>
        <div style="font-size:12px;color:var(--text3)">Válido até: ${orc.validade}</div>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:var(--text3)">Para</div>
      <div style="font-size:14px;font-weight:500;color:var(--text)">${orc.cliente_nome || 'Cliente não selecionado'}</div>
      <div style="font-size:12px;color:var(--text3)">${orc.cliente_empresa ? orc.cliente_empresa + ' · ' + (orc.cliente_email || '') : ''}</div>
      ${orc.cliente_telefone ? `<div style="font-size:12px;color:var(--text3)">Tel: ${orc.cliente_telefone}</div>` : ''}
      ${orc.cliente_cpfcnpj ? `<div style="font-size:12px;color:var(--text3)">CPF/CNPJ: ${orc.cliente_cpfcnpj}</div>` : ''}
      ${orc.cliente_endereco ? `<div style="font-size:12px;color:var(--text3)">Endereço: ${orc.cliente_endereco}</div>` : ''}
    </div>
    <table style="margin-bottom:12px"><thead><tr><th>Produto</th><th>Qtd</th><th>V. Unit.</th><th>Total</th></tr></thead><tbody>
      ${orc.itens.map(it => `<tr><td>${it.nome}</td><td>${it.qtd}</td><td>R$ ${Number(it.vunit).toFixed(2)}</td><td style="font-weight:500;color:var(--text)">R$ ${Number(it.total).toFixed(2)}</td></tr>`).join('')}
    </tbody></table>
    ${Number(orc.desconto) > 0 ? `
    <div style="text-align:right;font-size:13px;color:var(--text2);padding:2px 0">Subtotal: R$ ${orc.itens.reduce((s,i)=>s+Number(i.total),0).toFixed(2)}</div>
    <div style="text-align:right;font-size:13px;color:var(--text2);padding:2px 0">Desconto: - R$ ${Number(orc.desconto).toFixed(2)}</div>` : ''}
    <div style="text-align:right;font-size:16px;font-weight:600;padding:10px 0;border-top:1px solid var(--border);color:var(--gold);font-family:var(--font-display)">Total: R$ ${Number(orc.total).toFixed(2)}</div>
    ${orc.obs ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;padding:8px;background:var(--bg3);border-radius:var(--radius-md)">Condições: ${orc.obs}</div>` : ''}
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn btn-primary" onclick="window.print()"><i class="ti ti-printer"></i> Imprimir</button>
      <button class="btn btn-primary" onclick="baixarPdfOrcamento(${orc.id})"><i class="ti ti-file-download"></i> Baixar PDF</button>
      <button class="btn" onclick="editarOrcamento(${orc.id})"><i class="ti ti-edit"></i> Editar</button>
      <button class="btn" onclick="renderOrcamento(document.getElementById('content'),document.getElementById('topbar-actions'),'historico')"><i class="ti ti-arrow-left"></i> Voltar ao histórico</button>
    </div>
  </div>`;
}

// ── Geração de PDF do Pedido de Venda ───────────────────────────────────────
function baixarPdfNota(id) {
  const db   = lsLoad();
  const cliDb= db.clientes || [];
  const nota = (db.notas || []).find(n => n.id === id);
  if (!nota) { alert('Pedido de venda não encontrado.'); return; }

  // Compõe dados do cliente a partir da nota ou da base de clientes
  const cli = cliDb.find(c => c.id === nota.cliente_id) || {};
  const cliente = {
    nome:     nota.cliente_nome     || cli.nome     || 'Cliente não informado',
    empresa:  nota.cliente_empresa  || cli.empresa  || '',
    cpfcnpj:  nota.cliente_cpfcnpj  || cli.cpfcnpj  || '',
    telefone: nota.cliente_telefone || cli.telefone || '',
    email:    nota.cliente_email    || cli.email    || '',
    endereco: nota.cliente_endereco || cli.endereco || '',
  };

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW   = doc.internal.pageSize.getWidth();
  const marginX = 40;

  const gold = [201, 169, 110];
  const dark = [30, 28, 25];
  const gray = [110, 105, 98];
  const lightGray = [245, 243, 240];

  // ── Cabeçalho com logo vetorial ──
  doc.setDrawColor(...gold);
  doc.setFillColor(...gold);
  doc.setLineWidth(2.2);
  const lx = marginX, ly = 34;
  doc.line(lx, ly, lx, ly + 26);
  doc.setLineWidth(2);
  doc.lines([[8,-2],[8,2],[8,6],[0,6],[-8,4],[-8,-4],[0,-6]], lx, ly, [1,1], 'S');
  doc.circle(lx + 8, ly + 8, 3, 'F');

  doc.setFont('times', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...dark);
  doc.text('Ponto do Escritório', lx + 24, ly + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text('Móveis e Equipamentos para Escritório', lx + 24, ly + 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...dark);
  doc.text('PEDIDO DE VENDA Nº ' + (nota.numero || '-'), pageW - marginX, ly + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text('Emitido em: ' + (nota.data || '-'), pageW - marginX, ly + 22, { align: 'right' });
  doc.text('Condição: ' + (nota.pagamento || '-'), pageW - marginX, ly + 34, { align: 'right' });

  doc.setDrawColor(225, 220, 210);
  doc.setLineWidth(0.7);
  doc.line(marginX, ly + 48, pageW - marginX, ly + 48);

  // ── Bloco Cliente ──
  let y = ly + 70;
  doc.setFillColor(...lightGray);
  doc.roundedRect(marginX, y - 16, pageW - marginX * 2, 86, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text('CLIENTE', marginX + 14, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text(cliente.nome, marginX + 14, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...gray);
  let ly2 = y + 31;
  if (cliente.empresa)  { doc.text('Empresa: ' + cliente.empresa, marginX + 14, ly2); ly2 += 13; }
  if (cliente.cpfcnpj)  { doc.text('CPF/CNPJ: ' + cliente.cpfcnpj, marginX + 14, ly2); ly2 += 13; }
  let ry2 = y + 31;
  const rightColX = marginX + (pageW - marginX * 2) / 2 + 10;
  if (cliente.telefone) { doc.text('Telefone: ' + cliente.telefone, rightColX, ry2); ry2 += 13; }
  if (cliente.email)    { doc.text('E-mail: ' + cliente.email, rightColX, ry2); ry2 += 13; }
  if (cliente.endereco) { doc.text('Endereço: ' + cliente.endereco, marginX + 14, Math.max(ly2, ry2)); }

  y = y + 86;

  // ── Tabela de itens ──
  const rows = (nota.itens || []).map(it => [
    it.nome,
    String(it.qtd),
    'R$ ' + Number(it.vunit).toFixed(2),
    'R$ ' + Number(it.total).toFixed(2),
  ]);
  doc.autoTable({
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Produto', 'Qtd', 'Valor Unit.', 'Total']],
    body: rows,
    styles: { font: 'helvetica', fontSize: 9.5, textColor: dark, cellPadding: 7 },
    headStyles: { fillColor: dark, textColor: [240,237,232], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: lightGray },
    columnStyles: {
      1: { halign: 'center', cellWidth: 60 },
      2: { halign: 'right', cellWidth: 90 },
      3: { halign: 'right', cellWidth: 90 },
    },
  });

  let finalY = doc.lastAutoTable.finalY + 20;

  // ── Total ──
  doc.setDrawColor(225, 220, 210);
  doc.line(marginX, finalY, pageW - marginX, finalY);
  finalY += 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...gold);
  doc.text('TOTAL: R$ ' + Number(nota.total).toFixed(2), pageW - marginX, finalY, { align: 'right' });

  // ── Observações ──
  if (nota.obs) {
    finalY += 26;
    doc.setFillColor(...lightGray);
    const obsLines = doc.splitTextToSize(nota.obs, pageW - marginX * 2 - 24);
    const boxH = obsLines.length * 12 + 26;
    doc.roundedRect(marginX, finalY, pageW - marginX * 2, boxH, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text('OBSERVAÇÕES', marginX + 12, finalY + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...dark);
    doc.text(obsLines, marginX + 12, finalY + 30);
    finalY += boxH;
  }

  // ── Rodapé ──
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(225, 220, 210);
  doc.line(marginX, pageH - 50, pageW - marginX, pageH - 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...gray);
  doc.text('Ponto do Escritório — Pedido de Venda gerado automaticamente pelo sistema de gestão.', marginX, pageH - 35);
  doc.text('Documento sem valor fiscal.', marginX, pageH - 23);

  doc.save('Pedido_' + (nota.numero || id) + '_' + (nota.cliente_nome || 'cliente').replace(/[^a-zA-Z0-9]+/g, '_') + '.pdf');
}

// ── Geração de PDF do Orçamento ─────────────────────────────────────────────
function baixarPdfOrcamento_OLD(id) {
  const db  = lsLoad();
  const orc = db.orcamentos.find(o => o.id === id);
  if (!orc) { alert('Orçamento não encontrado.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const marginX = 40;

  const gold = [201, 169, 110];
  const dark = [30, 28, 25];
  const gray = [110, 105, 98];
  const lightGray = [245, 243, 240];

  // ── Cabeçalho com logo vetorial ──
  doc.setDrawColor(...gold);
  doc.setFillColor(...gold);
  doc.setLineWidth(2.2);
  const lx = marginX, ly = 34;
  doc.line(lx, ly, lx, ly + 26);
  doc.setLineWidth(2);
  doc.lines([[8,-2],[8,2],[8,6],[0,6],[-8,4],[-8,-4],[0,-6]], lx, ly, [1,1], 'S');
  doc.circle(lx + 8, ly + 8, 3, 'F');

  doc.setFont('times', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...dark);
  doc.text('Ponto do Escritório', lx + 24, ly + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text('Móveis e Equipamentos para Escritório', lx + 24, ly + 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...dark);
  doc.text(`ORÇAMENTO Nº ${orc.numero}`, pageW - marginX, ly + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text(`Emitido em: ${orc.data}`, pageW - marginX, ly + 22, { align: 'right' });
  doc.text(`Válido até: ${orc.validade}`, pageW - marginX, ly + 34, { align: 'right' });

  doc.setDrawColor(225, 220, 210);
  doc.setLineWidth(0.7);
  doc.line(marginX, ly + 48, pageW - marginX, ly + 48);

  // ── Bloco Cliente ──
  let y = ly + 70;
  doc.setFillColor(...lightGray);
  doc.roundedRect(marginX, y - 16, pageW - marginX * 2, 78, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text('CLIENTE', marginX + 14, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text(orc.cliente_nome || 'Cliente não informado', marginX + 14, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...gray);
  let ly2 = y + 31;
  if (orc.cliente_empresa) { doc.text(`Empresa: ${orc.cliente_empresa}`, marginX + 14, ly2); ly2 += 13; }
  if (orc.cliente_cpfcnpj) { doc.text(`CPF/CNPJ: ${orc.cliente_cpfcnpj}`, marginX + 14, ly2); ly2 += 13; }
  let ry2 = y + 31;
  const rightColX = marginX + (pageW - marginX * 2) / 2 + 10;
  if (orc.cliente_telefone) { doc.text(`Telefone: ${orc.cliente_telefone}`, rightColX, ry2); ry2 += 13; }
  if (orc.cliente_email)    { doc.text(`E-mail: ${orc.cliente_email}`, rightColX, ry2); ry2 += 13; }
  if (orc.cliente_endereco) { doc.text(`Endereço: ${orc.cliente_endereco}`, marginX + 14, Math.max(ly2, ry2)); }

  y = y + 78;

  // ── Tabela de itens ──
  const rows = orc.itens.map(it => [
    it.nome,
    String(it.qtd),
    `R$ ${Number(it.vunit).toFixed(2)}`,
    `R$ ${Number(it.total).toFixed(2)}`,
  ]);
  doc.autoTable({
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Produto', 'Qtd', 'Valor Unit.', 'Total']],
    body: rows,
    styles: { font: 'helvetica', fontSize: 9.5, textColor: dark, cellPadding: 7 },
    headStyles: { fillColor: dark, textColor: [240,237,232], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: lightGray },
    columnStyles: {
      1: { halign: 'center', cellWidth: 60 },
      2: { halign: 'right', cellWidth: 90 },
      3: { halign: 'right', cellWidth: 90 },
    },
  });

  let finalY = doc.lastAutoTable.finalY + 20;

  // ── Desconto ──
  if (Number(orc.desconto) > 0) {
    const subtotal = orc.itens.reduce((s,i)=>s+Number(i.total),0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...gray);
    doc.text(`Subtotal: R$ ${subtotal.toFixed(2)}`, pageW - marginX, finalY, { align: 'right' });
    finalY += 15;
    doc.text(`Desconto: - R$ ${Number(orc.desconto).toFixed(2)}`, pageW - marginX, finalY, { align: 'right' });
    finalY += 15;
  }

  // ── Total ──
  doc.setDrawColor(225, 220, 210);
  doc.line(marginX, finalY, pageW - marginX, finalY);
  finalY += 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...gold);
  doc.text(`TOTAL: R$ ${Number(orc.total).toFixed(2)}`, pageW - marginX, finalY, { align: 'right' });

  // ── Observações ──
  if (orc.obs) {
    finalY += 26;
    doc.setFillColor(...lightGray);
    const obsLines = doc.splitTextToSize(orc.obs, pageW - marginX * 2 - 24);
    const boxH = obsLines.length * 12 + 26;
    doc.roundedRect(marginX, finalY, pageW - marginX * 2, boxH, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text('CONDIÇÕES / OBSERVAÇÕES', marginX + 12, finalY + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...dark);
    doc.text(obsLines, marginX + 12, finalY + 30);
    finalY += boxH;
  }

  // ── Rodapé ──
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(225, 220, 210);
  doc.line(marginX, pageH - 50, pageW - marginX, pageH - 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...gray);
  doc.text('Ponto do Escritório — Orçamento gerado automaticamente pelo sistema de gestão.', marginX, pageH - 35);
  doc.text(`Documento válido até ${orc.validade}.`, marginX, pageH - 23);

  doc.save(`Orcamento_${orc.numero}_${(orc.cliente_nome || 'cliente').replace(/[^a-zA-Z0-9]+/g,'_')}.pdf`);
}

function addOrcItem() {
  const sel   = document.getElementById('o-prod');
  const opt   = sel.options[sel.selectedIndex];
  const id    = parseInt(sel.value);
  const qtd   = parseFloat(document.getElementById('o-qtd').value)   || 1;
  const vunit = parseFloat(document.getElementById('o-vunit').value) || 0;
  const nome  = opt.dataset.nome;
  const exist = orcItems.findIndex(i => i.id === id);
  if (exist >= 0) { orcItems[exist].qtd += qtd; orcItems[exist].total = orcItems[exist].qtd * orcItems[exist].vunit; }
  else orcItems.push({ id, nome, qtd, vunit, total: qtd * vunit });
  renderOrcItems();
}

function renderOrcItems() {
  const list = document.getElementById('orc-items');
  if (!orcItems.length) { list.innerHTML = ''; document.getElementById('orc-total').innerHTML = ''; return; }
  let html = `<div class="xml-item-header" style="grid-template-columns:2fr 80px 120px 120px 38px"><span>Produto</span><span>Qtd</span><span>V. Unit.</span><span>Total</span><span></span></div>`;
  orcItems.forEach((it, i) => {
    html += `<div class="xml-item-row" style="grid-template-columns:2fr 80px 120px 120px 38px">
      <input value="${it.nome}" onchange="editarNomeOrcItem(${i}, this.value)" style="border:none;background:none;color:var(--text);padding:2px 4px">
      <span>${it.qtd}</span>
      <span>R$ ${it.vunit.toFixed(2)}</span>
      <span style="font-weight:500;color:var(--text)">R$ ${it.total.toFixed(2)}</span>
      <button class="btn btn-sm" onclick="removeOrcItem(${i})" style="padding:3px 7px;color:var(--danger)"><i class="ti ti-x"></i></button>
    </div>`;
  });
  list.innerHTML = html;
  const sub  = orcItems.reduce((s, i) => s + i.total, 0);
  const desc = Number(orcDraft.desconto) || 0;
  const total = Math.max(0, sub - desc);
  document.getElementById('orc-total').innerHTML = `<div class="total-box">
    <div class="total-row"><span>Subtotal</span><span>R$ ${sub.toFixed(2)}</span></div>
    ${desc > 0 ? `<div class="total-row"><span>Desconto</span><span>- R$ ${desc.toFixed(2)}</span></div>` : ''}
    <div class="total-row main-total"><span>Total</span><span>R$ ${total.toFixed(2)}</span></div>
  </div>`;
}

function editarNomeOrcItem(i, valor) {
  if (!orcItems[i]) return;
  orcItems[i].nome = valor.trim() || orcItems[i].nome;
}

function removeOrcItem(i) { orcItems.splice(i, 1); renderOrcItems(); }

async function salvarOrcamento() {
  if (!orcItems.length) { alert('Adicione ao menos um produto.'); return; }
  try {
    const editando = !!orcEditId;
    const payload = {
      data:       editando ? orcEditData.data : new Date().toISOString().substring(0, 10),
      validade:   document.getElementById('o-validade').value,
      cliente_id: parseInt(document.getElementById('o-cliente').value) || null,
      obs:        document.getElementById('o-obs').value,
      desconto:   parseFloat(document.getElementById('o-desconto').value) || 0,
      itens:      orcItems,
    };
    let orc;
    if (editando) {
      orc = await api.put(`/orcamentos/${orcEditId}`, payload);
    } else {
      const nextNum = await api.get('/orcamentos/next-numero');
      payload.numero = nextNum.numero;
      orc = await api.post('/orcamentos', payload);
    }
    const prev = document.getElementById('orc-preview');
    prev.innerHTML = `
    <div class="preview-nota" style="margin-top:16px">
      <div class="preview-header">
        <div>
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none" style="margin-bottom:4px;color:var(--gold)">
            <line x1="28" y1="10" x2="28" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
            <path d="M28 10 Q28 10 55 10 Q82 10 82 38 Q82 65 55 65 Q28 65 28 65" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
            <circle cx="55" cy="38" r="9" fill="currentColor"/>
          </svg>
          <div style="font-size:15px;font-weight:500;font-family:var(--font-display);color:var(--text)">Ponto do Escritório</div>
          <div style="font-size:12px;color:var(--text3)">Orçamento</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:500;color:var(--text)">Nº ${orc.numero}</div>
          <div style="font-size:12px;color:var(--text3)">Emitido: ${orc.data}</div>
          <div style="font-size:12px;color:var(--text3)">Válido até: ${orc.validade}</div>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <div style="font-size:11px;color:var(--text3)">Para</div>
        <div style="font-size:14px;font-weight:500;color:var(--text)">${orc.cliente_nome || 'Cliente não selecionado'}</div>
        <div style="font-size:12px;color:var(--text3)">${orc.cliente_empresa ? orc.cliente_empresa + ' · ' + (orc.cliente_email || '') : ''}</div>
        ${orc.cliente_telefone ? `<div style="font-size:12px;color:var(--text3)">Tel: ${orc.cliente_telefone}</div>` : ''}
        ${orc.cliente_cpfcnpj ? `<div style="font-size:12px;color:var(--text3)">CPF/CNPJ: ${orc.cliente_cpfcnpj}</div>` : ''}
        ${orc.cliente_endereco ? `<div style="font-size:12px;color:var(--text3)">Endereço: ${orc.cliente_endereco}</div>` : ''}
      </div>
      <table style="margin-bottom:12px"><thead><tr><th>Produto</th><th>Qtd</th><th>V. Unit.</th><th>Total</th></tr></thead><tbody>
        ${orc.itens.map(it => `<tr><td>${it.nome}</td><td>${it.qtd}</td><td>R$ ${Number(it.vunit).toFixed(2)}</td><td style="font-weight:500;color:var(--text)">R$ ${Number(it.total).toFixed(2)}</td></tr>`).join('')}
      </tbody></table>
      ${Number(orc.desconto) > 0 ? `
      <div style="text-align:right;font-size:13px;color:var(--text2);padding:2px 0">Subtotal: R$ ${orc.itens.reduce((s,i)=>s+Number(i.total),0).toFixed(2)}</div>
      <div style="text-align:right;font-size:13px;color:var(--text2);padding:2px 0">Desconto: - R$ ${Number(orc.desconto).toFixed(2)}</div>` : ''}
      <div style="text-align:right;font-size:16px;font-weight:600;padding:10px 0;border-top:1px solid var(--border);color:var(--gold);font-family:var(--font-display)">Total: R$ ${Number(orc.total).toFixed(2)}</div>
      ${orc.obs ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;padding:8px;background:var(--bg3);border-radius:var(--radius-md)">Condições: ${orc.obs}</div>` : ''}
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-primary" onclick="window.print()"><i class="ti ti-printer"></i> Imprimir</button>
        <button class="btn btn-primary" onclick="baixarPdfOrcamento(${orc.id})"><i class="ti ti-file-download"></i> Baixar PDF</button>
        <button class="btn btn-success" onclick="enviarOrcamento('${orc.cliente_email || ''}')"><i class="ti ti-mail"></i> Enviar por e-mail</button>
        <button class="btn" onclick="renderOrcamento(document.getElementById('content'),document.getElementById('topbar-actions'),'historico')"><i class="ti ti-history"></i> Ver histórico</button>
        <button class="btn" onclick="novoOrcamento()"><i class="ti ti-plus"></i> Novo</button>
      </div>
    </div>`;
    orcItems    = [];
    orcDraft    = { cliente_id: '', validade: '', obs: '', desconto: 0 };
    orcEditId   = null;
    orcEditData = null;
  } catch (err) {
    alert('Erro ao salvar orçamento: ' + err.message);
  }
}

function novoOrcamento() {
  orcItems    = [];
  orcDraft    = { cliente_id: '', validade: '', obs: '', desconto: 0 };
  orcEditId   = null;
  orcEditData = null;
  nav('orcamento');
}

function editarOrcamento(id) {
  const db  = lsLoad();
  const orc = db.orcamentos.find(o => o.id === id);
  if (!orc) return;
  orcEditId   = orc.id;
  orcEditData = orc;
  orcItems    = orc.itens.map(it => ({ ...it }));
  orcDraft    = { cliente_id: orc.cliente_id || '', validade: orc.validade, obs: orc.obs || '', desconto: Number(orc.desconto) || 0 };
  const c  = document.getElementById('content');
  const ta = document.getElementById('topbar-actions');
  renderOrcamento(c, ta, 'novo');
}

function enviarOrcamento(email) {
  if (!email) { alert('Cliente sem e-mail cadastrado.'); return; }
  alert('Orçamento preparado para envio a: ' + email + '\n\n(Integre com seu serviço de e-mail para envio automático)');
}

async function renderEstoque(c, ta) {
  loading(c);
  ta.innerHTML = `<button class="btn btn-primary" onclick="addEstoquePrompt()"><i class="ti ti-plus"></i> Novo Produto</button>`;
  try {
    const items = await api.get('/estoque');
    c.innerHTML = `
    <div class="card">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input id="est-search" placeholder="Buscar produto..." style="max-width:260px" oninput="filterEstoque(this.value)">
      </div>
      <div class="table-wrap"><table id="est-table">
        <thead><tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Qtd</th><th>Mínimo</th><th>Custo</th><th>Venda</th><th>Status</th><th></th></tr></thead>
        <tbody id="est-body"></tbody>
      </table></div>
      <div id="add-form"></div>
    </div>`;
    renderEstoqueBody(items);
    window._estoqueCache = items;
  } catch (err) {
    c.innerHTML = showError('Falha ao carregar estoque: ' + err.message);
  }
}

function renderEstoqueBody(items) {
  const status = i => i.qtd == 0 ? 'out' : i.qtd <= i.minimo ? 'low' : 'ok';
  const label  = { ok: 'OK', low: 'Estoque baixo', out: 'Esgotado' };
  const badges = { ok: 'badge-ok', low: 'badge-low', out: 'badge-out' };
  document.getElementById('est-body').innerHTML = items.map(i => `
    <tr>
      <td><span class="badge badge-gray">${i.codigo}</span></td>
      <td style="font-weight:500;color:var(--text)">${i.nome}<div style="font-size:11px;color:var(--text3)">${i.marca}</div></td>
      <td>${i.categoria}</td>
      <td>${i.qtd} ${i.un}</td>
      <td>${i.minimo}</td>
      <td>R$ ${Number(i.custo).toFixed(2)}</td>
      <td style="font-weight:500;color:var(--text)">R$ ${Number(i.venda).toFixed(2)}</td>
      <td><span class="badge ${badges[status(i)]}">${label[status(i)]}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm" onclick="editarProdutoPrompt(${i.id})" style="padding:3px 10px"><i class="ti ti-pencil"></i></button>
        <button class="btn btn-sm" onclick="excluirProduto(${i.id})" style="padding:3px 10px;color:var(--danger)"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`).join('');
}

function excluirProduto(id) {
  const item = (window._estoqueCache || []).find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Excluir o produto "${item.nome}"? Esta ação não pode ser desfeita.`)) return;
  const db = lsLoad();
  db.estoque = db.estoque.filter(i => i.id !== id);
  lsSave(db);
  window._estoqueCache = db.estoque;
  renderEstoqueBody(db.estoque);
  document.getElementById('add-form').innerHTML = '';
}

function editarProdutoPrompt(id) {
  const item = (window._estoqueCache || []).find(i => i.id === id);
  if (!item) return;
  const cats = ['Mesas','Cadeiras','Estantes','Arquivos','Sofás','Importado','Outros'];
  document.getElementById('add-form').innerHTML = `
  <hr class="divider">
  <div class="section-title" style="margin-top:4px"><i class="ti ti-pencil"></i>Editar Produto</div>
  <div class="grid2">
    <div class="form-row"><label>Código</label><input id="ep-cod" value="${item.codigo}"></div>
    <div class="form-row"><label>Nome do Produto</label><input id="ep-nome" value="${item.nome}"></div>
    <div class="form-row"><label>Marca / Fornecedor</label><input id="ep-marca" value="${item.marca}"></div>
    <div class="form-row"><label>Categoria</label>
      <select id="ep-cat">${cats.map(c => `<option${c===item.categoria?' selected':''}>${c}</option>`).join('')}</select>
    </div>
    <div class="form-row"><label>Quantidade</label><input type="number" id="ep-qtd" value="${item.qtd}"></div>
    <div class="form-row"><label>Estoque Mínimo</label><input type="number" id="ep-min" value="${item.minimo}"></div>
    <div class="form-row"><label>Custo (R$)</label><input type="number" id="ep-custo" step="0.01" value="${item.custo}"></div>
    <div class="form-row"><label>Preço de Venda (R$)</label><input type="number" id="ep-venda" step="0.01" value="${item.venda}"></div>
    <div class="form-row"><label>Unidade</label><input id="ep-un" value="${item.un}"></div>
  </div>
  <div style="display:flex;gap:8px">
    <button class="btn btn-primary" onclick="salvarEdicaoProduto(${id})"><i class="ti ti-check"></i>Salvar</button>
    <button class="btn" onclick="document.getElementById('add-form').innerHTML=''">Cancelar</button>
  </div>`;
  document.getElementById('add-form').scrollIntoView({ behavior: 'smooth' });
}

function salvarEdicaoProduto(id) {
  const db   = lsLoad();
  const idx  = db.estoque.findIndex(i => i.id === id);
  if (idx === -1) return;
  db.estoque[idx] = {
    ...db.estoque[idx],
    codigo:   document.getElementById('ep-cod').value.trim(),
    nome:     document.getElementById('ep-nome').value.trim(),
    marca:    document.getElementById('ep-marca').value,
    categoria:document.getElementById('ep-cat').value,
    qtd:      parseFloat(document.getElementById('ep-qtd').value)   || 0,
    minimo:   parseFloat(document.getElementById('ep-min').value)   || 0,
    custo:    parseFloat(document.getElementById('ep-custo').value) || 0,
    venda:    parseFloat(document.getElementById('ep-venda').value) || 0,
    un:       document.getElementById('ep-un').value || 'un',
  };
  lsSave(db);
  window._estoqueCache = db.estoque;
  renderEstoqueBody(db.estoque);
  document.getElementById('add-form').innerHTML = '';
}

function filterEstoque(v) {
  const items = (window._estoqueCache || []).filter(i =>
    i.nome.toLowerCase().includes(v.toLowerCase()) || i.codigo.toLowerCase().includes(v.toLowerCase())
  );
  renderEstoqueBody(items);
}

function addEstoquePrompt() {
  document.getElementById('add-form').innerHTML = `
  <hr class="divider">
  <div class="section-title" style="margin-top:4px"><i class="ti ti-plus"></i>Novo Produto</div>
  <div class="grid2">
    <div class="form-row"><label>Código</label><input id="np-cod" placeholder="ME002"></div>
    <div class="form-row"><label>Nome do Produto</label><input id="np-nome" placeholder="Mesa Diretora 180cm"></div>
    <div class="form-row"><label>Marca / Fornecedor</label><input id="np-marca" placeholder="Plaxmetal"></div>
    <div class="form-row"><label>Categoria</label><select id="np-cat"><option>Mesas</option><option>Cadeiras</option><option>Estantes</option><option>Arquivos</option><option>Sofás</option><option>Outros</option></select></div>
    <div class="form-row"><label>Quantidade Inicial</label><input type="number" id="np-qtd" value="0"></div>
    <div class="form-row"><label>Estoque Mínimo</label><input type="number" id="np-min" value="2"></div>
    <div class="form-row"><label>Custo (R$)</label><input type="number" id="np-custo" step="0.01" value="0"></div>
    <div class="form-row"><label>Preço de Venda (R$)</label><input type="number" id="np-venda" step="0.01" value="0"></div>
  </div>
  <div style="display:flex;gap:8px">
    <button class="btn btn-primary" onclick="salvarNovoProduto()"><i class="ti ti-check"></i>Salvar</button>
    <button class="btn" onclick="document.getElementById('add-form').innerHTML=''">Cancelar</button>
  </div>`;
}

async function salvarNovoProduto() {
  const cod  = document.getElementById('np-cod').value.trim();
  const nome = document.getElementById('np-nome').value.trim();
  if (!cod || !nome) { alert('Preencha código e nome.'); return; }
  try {
    const item = await api.post('/estoque', {
      codigo:    cod, nome,
      marca:     document.getElementById('np-marca').value,
      categoria: document.getElementById('np-cat').value,
      qtd:       parseFloat(document.getElementById('np-qtd').value)   || 0,
      minimo:    parseFloat(document.getElementById('np-min').value)   || 2,
      custo:     parseFloat(document.getElementById('np-custo').value) || 0,
      venda:     parseFloat(document.getElementById('np-venda').value) || 0,
      un: 'un',
    });
    window._estoqueCache = window._estoqueCache || [];
    window._estoqueCache.push(item);
    renderEstoqueBody(window._estoqueCache);
    document.getElementById('add-form').innerHTML = '';
  } catch (err) {
    alert('Erro ao salvar: ' + err.message);
  }
}

async function renderClientes(c, ta) {
  loading(c);
  ta.innerHTML = `<button class="btn btn-primary" onclick="addClientePrompt()"><i class="ti ti-plus"></i> Novo Cliente</button>`;
  try {
    const clientes = await api.get('/clientes');
    c.innerHTML = `
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>Empresa</th><th>CPF/CNPJ</th><th>E-mail</th><th>Telefone</th><th>Endereço</th><th></th></tr></thead>
        <tbody id="cli-body"></tbody>
      </table></div>
      <div id="add-cli-form"></div>
    </div>`;
    window._clientesCache = clientes;
    renderClientesBody(clientes);
  } catch (err) {
    c.innerHTML = showError('Falha ao carregar clientes: ' + err.message);
  }
}

function renderClientesBody(clientes) {
  document.getElementById('cli-body').innerHTML = clientes.map(cl => `
    <tr>
      <td style="font-weight:500;color:var(--text)">${cl.nome}</td>
      <td>${cl.empresa || '-'}</td>
      <td><span class="badge badge-gray">${cl.cpfcnpj || '-'}</span></td>
      <td style="color:var(--text2)">${cl.email || '-'}</td>
      <td>${cl.telefone || '-'}</td>
      <td style="font-size:12px;color:var(--text3)">${cl.endereco || '-'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm" onclick="editarClientePrompt(${cl.id})" style="padding:3px 10px"><i class="ti ti-pencil"></i></button>
        <button class="btn btn-sm" onclick="excluirCliente(${cl.id})" style="padding:3px 10px;color:var(--danger)"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`).join('');
}

function excluirCliente(id) {
  const cl = (window._clientesCache || []).find(c => c.id === id);
  if (!cl) return;
  if (!confirm(`Excluir o cliente "${cl.nome}"? Esta ação não pode ser desfeita.`)) return;
  const db = lsLoad();
  db.clientes = db.clientes.filter(c => c.id !== id);
  lsSave(db);
  window._clientesCache = db.clientes;
  renderClientesBody(db.clientes);
  document.getElementById('add-cli-form').innerHTML = '';
}

function _formCliente(titulo, icon, vals, onSalvar, onCancelar) {
  return `
  <hr class="divider">
  <div class="section-title"><i class="ti ${icon}"></i>${titulo}</div>
  <div class="grid2">
    <div class="form-row"><label>Nome Completo</label><input id="nc-nome" placeholder="Nome do contato" value="${vals.nome||''}"></div>
    <div class="form-row"><label>Empresa</label><input id="nc-emp" placeholder="Nome da empresa" value="${vals.empresa||''}"></div>
    <div class="form-row"><label>CPF / CNPJ</label><input id="nc-doc" placeholder="00.000.000/0001-00" value="${vals.cpfcnpj||''}"></div>
    <div class="form-row"><label>Telefone</label><input id="nc-tel" placeholder="(79) 9 9000-0000" value="${vals.telefone||''}"></div>
    <div class="form-row"><label>E-mail</label><input id="nc-email" type="email" placeholder="email@empresa.com.br" value="${vals.email||''}"></div>
    <div class="form-row"><label>Endereço</label><input id="nc-end" placeholder="Rua, nº, bairro, cidade" value="${vals.endereco||''}"></div>
  </div>
  <div style="display:flex;gap:8px">
    <button class="btn btn-primary" onclick="${onSalvar}"><i class="ti ti-check"></i>Salvar</button>
    <button class="btn" onclick="${onCancelar}">Cancelar</button>
  </div>`;
}

function addClientePrompt() {
  document.getElementById('add-cli-form').innerHTML = _formCliente(
    'Novo Cliente', 'ti-user-plus', {},
    'salvarNovoCliente()',
    "document.getElementById('add-cli-form').innerHTML=''"
  );
}

function editarClientePrompt(id) {
  const cl = (window._clientesCache || []).find(c => c.id === id);
  if (!cl) return;
  document.getElementById('add-cli-form').innerHTML = _formCliente(
    'Editar Cliente', 'ti-pencil', cl,
    `salvarEdicaoCliente(${id})`,
    "document.getElementById('add-cli-form').innerHTML=''"
  );
  document.getElementById('add-cli-form').scrollIntoView({ behavior: 'smooth' });
}

async function salvarNovoCliente() {
  const nome = document.getElementById('nc-nome').value.trim();
  if (!nome) { alert('Preencha o nome.'); return; }
  try {
    const cli = await api.post('/clientes', {
      nome,
      empresa:  document.getElementById('nc-emp').value,
      email:    document.getElementById('nc-email').value,
      telefone: document.getElementById('nc-tel').value,
      cpfcnpj:  document.getElementById('nc-doc').value,
      endereco: document.getElementById('nc-end').value,
    });
    window._clientesCache = window._clientesCache || [];
    window._clientesCache.push(cli);
    renderClientesBody(window._clientesCache);
    document.getElementById('add-cli-form').innerHTML = '';
  } catch (err) {
    alert('Erro ao salvar: ' + err.message);
  }
}

function salvarEdicaoCliente(id) {
  const db  = lsLoad();
  const idx = db.clientes.findIndex(c => c.id === id);
  if (idx === -1) return;
  db.clientes[idx] = {
    ...db.clientes[idx],
    nome:     document.getElementById('nc-nome').value.trim(),
    empresa:  document.getElementById('nc-emp').value,
    email:    document.getElementById('nc-email').value,
    telefone: document.getElementById('nc-tel').value,
    cpfcnpj:  document.getElementById('nc-doc').value,
    endereco: document.getElementById('nc-end').value,
  };
  lsSave(db);
  window._clientesCache = db.clientes;
  renderClientesBody(db.clientes);
  document.getElementById('add-cli-form').innerHTML = '';
}

// ── Backup exportar / importar ─────────────────────────────────────────────
function exportarBackup() {
  const db   = lsLoad();
  const json = JSON.stringify(db, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const data = new Date().toISOString().substring(0, 10);
  a.href     = url;
  a.download = `ponto_escritorio_backup_${data}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importarBackup(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const db = JSON.parse(e.target.result);
      if (!db.estoque || !db.clientes || !db.nextId) {
        alert('Arquivo inválido. Selecione um backup gerado por este sistema.');
        return;
      }
      if (!confirm('Isso vai substituir todos os dados atuais pelo backup. Confirmar?')) return;
      lsSave(db);
      alert('Backup restaurado com sucesso!');
      render(currentNav);
    } catch (_) {
      alert('Erro ao ler o arquivo. Verifique se é um backup válido.');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function renderBackupBar() {
  const bar = document.createElement('div');
  bar.id = 'backup-bar';
  bar.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:9998;';
  bar.innerHTML = `
    <button onclick="exportarBackup()" style="background:#1a1a1a;color:#a0a0a0;border:1px solid #333;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:var(--font-body)">
      <i class="ti ti-download" style="font-size:14px"></i> Exportar backup
    </button>
    <label style="background:#1a1a1a;color:#a0a0a0;border:1px solid #333;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:var(--font-body)">
      <i class="ti ti-upload" style="font-size:14px"></i> Importar backup
      <input type="file" accept=".json" style="display:none" onchange="importarBackup(this)">
    </label>
  `;
  document.body.appendChild(bar);
}

renderBackupBar();
render('dashboard');
