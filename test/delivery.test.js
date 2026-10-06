const test = require('node:test');
const assert = require('node:assert/strict');
const routeService = require('../src/services/routeService');
const Entrega = require('../src/models/entrega');
const Venda = require('../src/models/venda');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const loadEnv = require('../src/utils/loadEnv');
const axios = require('axios');

test('calcula taxa padrão de R$ 13,60 para 4,3 km', () => {
  const previousBase = process.env.DELIVERY_BASE_FEE;
  const previousKm = process.env.DELIVERY_PRICE_PER_KM;
  delete process.env.DELIVERY_BASE_FEE;
  delete process.env.DELIVERY_PRICE_PER_KM;
  assert.equal(routeService.calculateFee(4.3), 13.6);
  if (previousBase === undefined) delete process.env.DELIVERY_BASE_FEE; else process.env.DELIVERY_BASE_FEE = previousBase;
  if (previousKm === undefined) delete process.env.DELIVERY_PRICE_PER_KM; else process.env.DELIVERY_PRICE_PER_KM = previousKm;
});

test('respeita valores de frete configurados por ambiente', () => {
  const previousBase = process.env.DELIVERY_BASE_FEE;
  const previousKm = process.env.DELIVERY_PRICE_PER_KM;
  process.env.DELIVERY_BASE_FEE = '7.5';
  process.env.DELIVERY_PRICE_PER_KM = '1.25';
  assert.equal(routeService.calculateFee(2), 10);
  if (previousBase === undefined) delete process.env.DELIVERY_BASE_FEE; else process.env.DELIVERY_BASE_FEE = previousBase;
  if (previousKm === undefined) delete process.env.DELIVERY_PRICE_PER_KM; else process.env.DELIVERY_PRICE_PER_KM = previousKm;
});

test('rejeita distância inválida', () => {
  assert.throws(() => routeService.calculateFee(-1), /Distância inválida/);
});

test('consulta a Routes API do Google e converte metros em quilômetros', async () => {
  const originalPost = axios.post;
  axios.post = async (url, body, options) => {
    assert.equal(url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
    assert.deepEqual(body.origin, { address: 'Origem, Brasil' });
    assert.deepEqual(body.destination, { address: 'Destino, Brasil' });
    assert.equal(body.travelMode, 'DRIVE');
    assert.equal(options.headers['X-Goog-Api-Key'], 'chave-teste');
    assert.equal(options.headers['X-Goog-FieldMask'], 'routes.distanceMeters');
    return { data: { routes: [{ distanceMeters: 4300 }] } };
  };
  try {
    assert.equal(await routeService.calculateWithGoogle('Origem, Brasil', 'Destino, Brasil', 'chave-teste'), 4.3);
  } finally {
    axios.post = originalPost;
  }
});

test('model de entrega aceita o fluxo completo de status delivery', async () => {
  const statuses = ['NOVO', 'PREPARANDO', 'PRONTO_PARA_ENTREGA', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'CANCELADO'];
  const allowed = Entrega.schema.path('status').enumValues;
  statuses.forEach(status => assert.ok(allowed.includes(status)));
});

test('vendas antigas permanecem BALCAO por padrão e delivery é identificável', () => {
  assert.equal(new Venda({}).origem, 'BALCAO');
  assert.equal(new Venda({ origem: 'DELIVERY' }).origem, 'DELIVERY');
});

test('dashboard, página e preload expõem a navegação e as operações de delivery', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.match(read('src/views/main.html'), /id="btn-delivery"/);
  assert.match(read('src/scripts/main.js'), /delivery\.html/);
  const page = read('src/views/delivery.html');
  ['clientSearch', 'productSearch', 'itemsBody', 'calculateBtn', 'submitOrderBtn', 'ordersBody', 'detailsModal']
    .forEach(id => assert.match(page, new RegExp(`id="${id}"`)));
  const preload = read('src/main/preload.js');
  ['delivery:calcularEntrega', 'delivery:getCliente', 'delivery:criar', 'delivery:listar', 'delivery:detalhes', 'delivery:atualizarStatus']
    .forEach(channel => assert.ok(preload.includes(channel)));
});

test('carrega variáveis de um arquivo .env sem sobrescrever o ambiente', () => {
  const envPath = path.join(os.tmpdir(), `farmavida-${process.pid}.env`);
  fs.writeFileSync(envPath, 'FARMAVIDA_ENV_TEST="valor teste"\nFARMAVIDA_KEEP_TEST=arquivo\n');
  process.env.FARMAVIDA_KEEP_TEST = 'ambiente';
  const result = loadEnv(envPath);
  assert.equal(result.loaded, true);
  assert.equal(process.env.FARMAVIDA_ENV_TEST, 'valor teste');
  assert.equal(process.env.FARMAVIDA_KEEP_TEST, 'ambiente');
  fs.unlinkSync(envPath);
  delete process.env.FARMAVIDA_ENV_TEST;
  delete process.env.FARMAVIDA_KEEP_TEST;
});
