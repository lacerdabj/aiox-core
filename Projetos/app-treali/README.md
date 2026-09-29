# Treali Distribuidores PWA

PWA privada da TREALI ALIMENTOS para distribuidores consultarem exclusivamente sua carteira e registrarem atendimento com geolocalização.

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Para usar o login, defina no ambiente de execução:

- `TREALI_SESSION_SECRET`: segredo aleatório com pelo menos 32 caracteres.
- `TREALI_ACCOUNTS_JSON`: lista JSON de contas com `id`, `email`, `passwordHash`, `label`, `cityId` e `citySlug`.

Gere um hash PBKDF2 sem registrar a senha em arquivos:

```bash
npm run hash:password -- "uma-senha-forte-com-12-ou-mais-caracteres"
```

## Catálogo operacional

O catálogo não é versionado e não é pré-cacheado. Importe um JSON autorizado, em ambiente controlado, antes do build:

```bash
TREALI_CATALOG_SOURCE=/caminho/seguro/clientes.json npm run import:catalogs
```

Formato mínimo:

```json
{
  "revision": "2026-09-28",
  "clients": [{ "name": "Cliente", "cityId": "muriae-mg", "citySlug": "muriae-mg" }]
}
```

O arquivo gerado em `api/data/catalogs.generated.ts` deve entrar somente como insumo privado do build da Vercel. A função `/api/clients` resolve a cidade a partir da sessão assinada no servidor; a tela nunca escolhe nem envia o escopo territorial.

## Validação

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

E2E em navegador headless (requer `npm run dev` rodando e `python3 -m playwright install chromium` uma vez):

```bash
npm run test:e2e
```
