# Terminais LOJA, BALCÃO e CAIXA

O MongoDB fica neste computador, `PMNF-CPD001`. O aplicativo dos demais computadores usa o mesmo banco pelo nome do servidor. Não é necessário instalar MongoDB nos terminais.

## Preparar cada computador

1. No servidor, execute `powershell -File scripts\criar-pacote-terminal.ps1` dentro da pasta do projeto. O arquivo `dist\farmavida-terminal.zip` contém o aplicativo e a configuração de conexão, sem a senha de administrador do banco.
2. Copie o ZIP para cada terminal, extraia em uma pasta própria e instale o Node.js se ainda não estiver instalado.
3. Na pasta extraída, execute `npm ci` uma vez. Depois, inicie com `npm start`.
4. Entre com um usuário do perfil correspondente. A GERÊNCIA cadastra os usuários pela opção **Usuários e permissões**.

O servidor deve permanecer ligado enquanto os terminais usam o sistema. O nome `PMNF-CPD001` precisa ser encontrado pelos outros computadores na mesma rede. Para verificar, use `Test-NetConnection PMNF-CPD001 -Port 27017` no PowerShell de um terminal. Se o nome não resolver, configure uma reserva de IP no roteador e ajuste o endereço do banco; o IP atual `192.168.0.152` é dinâmico.

O arquivo `.env` dentro do ZIP contém uma credencial de banco restrita ao aplicativo. Entregue o pacote somente aos computadores da farmácia. O arquivo `.mongo-lan-credentials.json` no servidor contém a senha de administrador e não deve ser copiado para os terminais. A regra do firewall aceita a porta 27017 apenas da sub-rede local.

## Pré-vendas

LOJA e BALCÃO abrem uma pré-venda pelo mesmo código, adicionam ou retiram produtos e salvam. O cliente é opcional. BALCÃO pode marcar se o medicamento exige receita e se ela foi apresentada. CAIXA abre o código, pode continuar a edição e finaliza com a forma de pagamento. Medicamentos que exigem receita são bloqueados até a confirmação **Tem receita**.
