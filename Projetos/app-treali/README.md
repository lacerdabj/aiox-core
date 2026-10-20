# Treali — painel da fábrica e app do distribuidor

O painel desktop define, para **cada distribuidor e produto**, se a venda está habilitada e quanto o distribuidor paga à fábrica. No app de rua, cada distribuidor autenticado define seu próprio preço de revenda à lanchonete. Pedidos, totais e comprovantes guardam o preço de revenda usado no momento da venda.

## Executar no computador da fábrica

Requer Node.js 24. Instale as dependências e defina uma senha administrativa com pelo menos 12 caracteres:

```bash
npm install
TREALI_ADMIN_PASSWORD='uma-senha-forte-de-exemplo' npm run dev
```

Abra `http://localhost:5173/dashboard.html` para administrar e `http://localhost:5173/` para o app de rua. Para servir o build:

```bash
npm run build
TREALI_ADMIN_PASSWORD='uma-senha-forte-de-exemplo' npm start
```

Nesse caso, a porta padrão é 4173. O servidor escuta apenas no próprio computador por padrão. `TREALI_HOST=0.0.0.0` permite conexões na rede local. Para uso no celular e instalação da PWA, configure HTTPS na origem acessada pelo aparelho e `TREALI_SECURE_COOKIE=1`. Acesso fora da rede local também exige domínio, HTTPS e configuração de rede; isso ainda não foi implantado. O computador da fábrica deve permanecer ligado para sincronização.

## Configurar os preços

1. Entre no painel com a senha administrativa e cadastre os produtos.
2. Cadastre cada distribuidor com telefone e PIN; edite seu cadastro para habilitar os produtos e informar o preço de compra de cada um.
3. No app de rua, o distribuidor entra com telefone e PIN. Em **Novo Pedido**, informa seu preço de revenda para cada produto habilitado antes de incluí-lo no pedido.
4. O indicador de sincronização mostra alterações pendentes. Sem conexão, o app usa o catálogo e os preços já recebidos e guarda pedidos e preços para envio posterior. Em caso de conflito de preço, o distribuidor informa novamente o valor desejado.

Um produto sem preço de compra válido não chega ao catálogo do distribuidor. Sem preço de revenda válido, não entra no pedido. A fábrica vê os preços de compra; o app de rua recebe apenas seus produtos habilitados e a própria revenda, sem preços de compra.

## Dados e migração

O servidor guarda o catálogo, as tabelas e os pedidos em `.treali-data/treali.sqlite`. Faça backup da pasta `.treali-data` com o servidor parado. O arquivo legado `.treali-data/db.json` é preservado e **não é importado automaticamente**, pois seus PINs e vínculos de identidade precisam de revisão. Ao iniciar este servidor, a fábrica deve cadastrar os produtos e distribuidores e fornecer PINs novos. Veja [server/README.md](server/README.md).

## Verificação

```bash
npm run typecheck
npm test
npm run build
```
