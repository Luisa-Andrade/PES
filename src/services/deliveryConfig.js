require('../utils/loadEnv')();

const numberFromEnv = (name, fallback) => {
  const parsed = Number.parseFloat(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getPharmacyAddress = () => ({
  cep: process.env.FARMACIA_CEP || '',
  logradouro: process.env.FARMACIA_ENDERECO || '',
  numero: process.env.FARMACIA_NUMERO || '',
  bairro: process.env.FARMACIA_BAIRRO || '',
  cidade: process.env.FARMACIA_CIDADE || '',
  estado: process.env.FARMACIA_UF || ''
});

const formatAddress = (address = {}) => [
  address.logradouro,
  address.numero,
  address.bairro,
  address.cidade,
  address.estado,
  address.cep,
  'Brasil'
].filter(Boolean).join(', ');

const getDeliveryConfig = () => ({
  mapsProvider: (process.env.MAPS_PROVIDER || 'openrouteservice').trim().toLowerCase(),
  mapsApiKey: (process.env.MAPS_API_KEY || '').trim(),
  baseFee: numberFromEnv('DELIVERY_BASE_FEE', 5),
  pricePerKm: numberFromEnv('DELIVERY_PRICE_PER_KM', 2),
  pharmacyAddress: getPharmacyAddress()
});

module.exports = { getDeliveryConfig, formatAddress };
