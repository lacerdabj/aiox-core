# Servidor local Treali

Use Node 24. Defina `TREALI_ADMIN_PASSWORD` com pelo menos 12 caracteres e execute `npm run dev` durante desenvolvimento ou `npm run build && npm start` para servir `dist/` e `/api` na mesma origem. `npm start` escuta apenas `127.0.0.1` por padrão; para LAN, configure explicitamente `TREALI_HOST=0.0.0.0`. O banco fica em `.treali-data/treali.sqlite` no diretório do app. Faça backup desse arquivo com o servidor parado. `TREALI_SECURE_COOKIE=1` habilita cookie Secure quando houver HTTPS.

O antigo `.treali-data/db.json` não é importado automaticamente. Ele contém PINs sem hash e pedidos sem vínculo autenticado. Preserve-o para migração manual revisada; crie os produtos e distribuidores no novo painel e defina PINs novos. Não associe telefone ou cidade antiga a uma identidade sem confirmação da fábrica. Esta configuração serve a rede local; acesso externo requer configuração própria de HTTPS, domínio e rede.
