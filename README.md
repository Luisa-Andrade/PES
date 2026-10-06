# PES

## Cálculo da taxa de entrega

O valor é calculado pela distância de carro entre a farmácia e o endereço do cliente: `DELIVERY_BASE_FEE + distância_em_km × DELIVERY_PRICE_PER_KM`. O aplicativo consulta a rota no processo principal do Electron; a chave não precisa ser colocada na página.

1. Copie `.env.example` para `.env` na raiz do projeto. O aplicativo lê `.env`; editar apenas `.env.example` não altera a configuração.
2. Preencha o endereço de origem em `FARMACIA_ENDERECO`, `FARMACIA_NUMERO`, `FARMACIA_BAIRRO`, `FARMACIA_CIDADE`, `FARMACIA_UF` e `FARMACIA_CEP`.
3. Para usar o Google, defina `MAPS_PROVIDER=google` e coloque a chave da **Routes API** em `MAPS_API_KEY`. O aplicativo usa o método **Compute Routes**. A antiga chave da **Distance Matrix API (Legacy)** não basta se estiver restrita apenas àquela API.
4. Ajuste `DELIVERY_BASE_FEE` e `DELIVERY_PRICE_PER_KM` se necessário, reinicie o aplicativo e teste o botão **Calcular entrega** com um endereço completo.

Para criar a chave: no [Google Cloud Console](https://console.cloud.google.com/), selecione ou crie um projeto, vincule uma conta de faturamento e habilite a [Routes API](https://console.cloud.google.com/apis/library/routes.googleapis.com). Em **APIs e serviços → Credenciais → Criar credenciais → Chave de API**, crie uma chave e restrinja seu uso à **Routes API**. Como a chamada sai do computador que executa o aplicativo, a restrição por IP só funciona se esse computador usar um IP público fixo. Configure uma cota diária para controlar custos. Não compartilhe a chave nem envie o arquivo `.env` ao Git.

O provedor `openrouteservice` continua disponível: mantenha `MAPS_PROVIDER=openrouteservice` e use uma chave própria desse serviço em `MAPS_API_KEY`.

### Produtos e pré-vendas na entrega

Na tela Delivery, use **Buscar produto** para pesquisar por nome, código ou código de barras. Selecione um resultado para adicionar uma unidade; ajuste a quantidade diretamente na tabela. O leitor funciona como teclado: leia o código nesse campo e o Enter adicionará uma unidade; leituras repetidas aumentam a quantidade. Também é possível digitar o código e usar **Adicionar código**. O botão **Leitor de código de barras** coloca o foco nesse campo.

Em **Continuar uma pré-venda**, escolha uma pré-venda com produtos. Você pode alterar a quantidade de seus itens na tabela e acrescentar outros produtos na própria entrega. O sistema ajusta a reserva de estoque ao confirmar; os adicionais usam o preço atual. Uma pré-venda vinculada a um cliente preenche o cliente da entrega, e selecionar um cliente carrega automaticamente sua pré-venda aberta mais recente. Ao confirmar o pedido, a pré-venda é finalizada junto com a venda e o pedido.
