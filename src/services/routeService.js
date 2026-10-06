const axios = require('axios');
const { getDeliveryConfig, formatAddress } = require('./deliveryConfig');

class RouteService {
  validateConfig(config) {
    if (!config.mapsApiKey) {
      throw new Error('Configure MAPS_API_KEY no arquivo .env da raiz do projeto e reinicie o aplicativo para calcular a entrega.');
    }
    if (!config.pharmacyAddress.logradouro || !config.pharmacyAddress.cidade || !config.pharmacyAddress.estado) {
      throw new Error('Configure o endereço da farmácia nas variáveis FARMACIA_ENDERECO, FARMACIA_CIDADE e FARMACIA_UF.');
    }
  }

  async geocodeOpenRouteService(address, apiKey) {
    const response = await axios.get('https://api.openrouteservice.org/geocode/search', {
      params: { api_key: apiKey, text: address, size: 1 },
      timeout: 15000
    });
    const coordinates = response.data?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error(`Endereço não localizado: ${address}`);
    }
    return coordinates;
  }

  async calculateWithOpenRouteService(origin, destination, apiKey) {
    const [originCoordinates, destinationCoordinates] = await Promise.all([
      this.geocodeOpenRouteService(origin, apiKey),
      this.geocodeOpenRouteService(destination, apiKey)
    ]);
    const response = await axios.post(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
      { coordinates: [originCoordinates, destinationCoordinates] },
      { headers: { Authorization: apiKey, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const meters = response.data?.features?.[0]?.properties?.summary?.distance;
    if (!Number.isFinite(meters)) throw new Error('O serviço de rotas não retornou uma distância válida.');
    return meters / 1000;
  }

  async calculateWithGoogle(origin, destination, apiKey) {
    let response;
    try {
      response = await axios.post('https://routes.googleapis.com/directions/v2:computeRoutes', {
        origin: { address: origin },
        destination: { address: destination },
        travelMode: 'DRIVE',
        languageCode: 'pt-BR',
        units: 'METRIC'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters'
        },
        timeout: 15000
      });
    } catch (error) {
      if (error.response?.status === 403) {
        throw new Error('A chave do Google não tem acesso à Routes API. Confira a API habilitada, as restrições da chave e o faturamento do projeto.');
      }
      throw new Error('Não foi possível consultar a rota no Google Maps. Verifique a conexão e os endereços.');
    }
    const meters = response.data?.routes?.[0]?.distanceMeters;
    if (!Number.isFinite(meters)) throw new Error('O Google Maps não retornou uma rota válida para o endereço.');
    return meters / 1000;
  }

  async calculateDistance(destinationAddress) {
    const config = getDeliveryConfig();
    this.validateConfig(config);
    const origin = formatAddress(config.pharmacyAddress);
    const destination = formatAddress(destinationAddress);
    if (!destinationAddress?.logradouro || !destinationAddress?.cidade || !destinationAddress?.estado) {
      throw new Error('Informe logradouro, cidade e UF para calcular a entrega.');
    }

    let distance;
    if (config.mapsProvider === 'google') {
      distance = await this.calculateWithGoogle(origin, destination, config.mapsApiKey);
    } else if (config.mapsProvider === 'openrouteservice') {
      distance = await this.calculateWithOpenRouteService(origin, destination, config.mapsApiKey);
    } else {
      throw new Error(`Provedor de mapas não suportado: ${config.mapsProvider}`);
    }
    return Math.round(distance * 100) / 100;
  }

  calculateFee(distanceKm) {
    const config = getDeliveryConfig();
    const distance = Number.parseFloat(distanceKm);
    if (!Number.isFinite(distance) || distance < 0) throw new Error('Distância inválida.');
    return Math.round((config.baseFee + distance * config.pricePerKm) * 100) / 100;
  }

  async quote(destinationAddress) {
    const distanceKm = await this.calculateDistance(destinationAddress);
    return { distanceKm, deliveryFee: this.calculateFee(distanceKm) };
  }
}

module.exports = new RouteService();
