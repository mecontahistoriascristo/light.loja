# Light.loja — prévia local

Primeira versão da vitrine da Light.loja, criada a partir da identidade visual fornecida e da estrutura de descoberta da Etsy, adaptada a um catálogo pequeno e curado.

## Executar localmente

Não há dependências para instalar nesta etapa. A partir da raiz do projeto:

```bash
python3 -m http.server 4173 --directory dist
```

Abra `http://127.0.0.1:4173`.

## Incluído nesta versão

- Home responsiva com a identidade Light.
- Carrossel de campanhas no topo, com avanço automático, navegação manual, gesto de arrastar e prévias claras da campanha anterior e da próxima.
- Cabeçalho com busca, favoritos e carrinho.
- Navegação por categorias, vitrines e história da marca.
- Catálogo ilustrativo local, com filtros por categoria e busca.
- Carrinho de demonstração no navegador.
- Área em `admin.html` protegida por link de acesso do Supabase para publicar produtos, organizar categorias, enviar imagens e administrar campanhas do carrossel.
- Catálogo, imagens e campanhas centralizados no Supabase; a vitrine consome somente conteúdo publicado.
- Etapa de entrega no carrinho, pronta para cotar CEP pela SuperFrete através de uma Edge Function segura.
- Medidas e peso editáveis por produto; até termos medições reais, a vitrine usa uma caixa provisória de 15 × 10 × 13 cm e 0,3 kg.
- Imagens demonstrativas de campanha em `dist/assets/` para coleção, Natal, brinquedos e Dia dos Namorados.
- Ícone local da marca em `dist/favicon.svg`.

## Ativar o admin profissional

O banco e as políticas estão versionados em `supabase/migrations/20261010193000_catalog_admin_foundation.sql`.

1. No Supabase, abra **SQL Editor** e execute todo o conteúdo da migração uma única vez. Ela cria as tabelas de catálogo e campanhas, o bucket `catalog-media`, as políticas RLS e importa a coleção inicial.
2. Em **Authentication → URL Configuration**, inclua `https://lightloja.vercel.app/admin.html` em **Redirect URLs**. Para testar localmente, inclua também `http://127.0.0.1:4173/admin.html`.
3. O primeiro administrador é `mecontahistorias.cristo@gmail.com`. Para liberar outra pessoa, execute: `insert into public.light_admins(email) values ('outro@email.com');`.
4. Acesse `https://lightloja.vercel.app/admin.html`, informe o e-mail autorizado e abra o link enviado pelo Supabase.

O navegador recebe apenas a chave publicável do Supabase. Imagens são públicas para leitura, mas uploads e alterações de catálogo exigem uma sessão administrativa autorizada pelas políticas do banco.

Antes de publicar uma nova versão, rode também:

```bash
node scripts/verify-release.mjs
```

O verificador confirma que a vitrine e o admin estão ligados aos módulos certos e bloqueia, por inspeção estática, o vazamento acidental de segredos da SuperFrete no frontend.

## Ativar a cotação da SuperFrete em Sandbox

A interface de frete já está pronta, mas não deve receber o token diretamente. A função segura fica em `supabase/functions/shipping-quote/` e chama somente a API da SuperFrete.

1. Crie ou escolha um projeto Supabase e instale/autentique o Supabase CLI no seu computador.
2. No painel do Supabase, em **Project Settings → Edge Functions → Secrets**, cadastre os valores de `supabase/functions/shipping-quote/.env.example`. Use o token de Sandbox somente no segredo `SUPERFRETE_TOKEN`; ele não deve ser salvo no repositório.
3. Defina `SUPERFRETE_ORIGIN_POSTAL_CODE=61762330`, `SUPERFRETE_API_BASE_URL=https://sandbox.superfrete.com` e informe um e-mail real no `SUPERFRETE_USER_AGENT`.
4. Publique a função com `supabase functions deploy shipping-quote --no-verify-jwt`. Antes de produção, restrinja `ALLOWED_ORIGIN` ao domínio exato da loja e proteja o endpoint contra abuso.
5. Copie a URL publicada, no formato `https://<project-ref>.supabase.co/functions/v1/shipping-quote`, para `shippingQuoteEndpoint` em `dist/runtime-config.js`. Essa URL é pública; o token não é.

Depois, abra o carrinho, escolha **Continuar para entrega** e consulte um CEP. A SuperFrete retorna somente as modalidades habilitadas e atendidas para a origem e o destino; a loja não chama os Correios nem outra transportadora diretamente.

## Pedidos de demonstração aguardando pagamento

A jornada de checkout pode registrar um pedido pendente sem iniciar cobrança nem pedir dados de cartão. Os preços e o estoque são conferidos no catálogo do Supabase e o frete é confirmado novamente pela Edge Function antes da gravação. O admin mostra os pedidos e pode cancelá-los; ele não pode marcar pagamentos manualmente.

Para ativar este fluxo, execute `supabase/migrations/20261010220000_light_orders.sql` no SQL Editor do mesmo projeto Supabase e publique `create-order`:

```bash
supabase functions deploy create-order --no-verify-jwt
```

A função usa `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPERFRETE_TOKEN` e `SUPERFRETE_ORIGIN_POSTAL_CODE` somente no ambiente seguro das Edge Functions. Configure `ALLOWED_ORIGIN=https://lightloja.vercel.app` nos Secrets da função antes de publicá-la; para desenvolvimento local, use a origem local autorizada somente durante o teste. Nunca copie os segredos para `dist/runtime-config.js`.

Nome, contato e endereço são armazenados no pedido no Supabase. A política de RLS permite leitura somente a administradores Light. Pedidos sem pagamento expiram após 7 dias; dados de contato e entrega são removidos 30 dias depois do cancelamento ou da expiração, mantendo apenas o registro comercial sem identificação direta. O Supabase Cron executa essa manutenção a cada 15 minutos. O endpoint limita a criação a 5 pedidos por endereço IP por hora; o identificador usado é um HMAC com chave gerada e guardada no próprio banco, e os registros de limite são removidos em 24 horas.

Pedidos aguardando pagamento não reservam estoque. Uma futura integração deve confirmar o pagamento por notificação assinada pelo servidor antes de mudar o estado ou iniciar a produção. A política de retenção segue a finalidade de pedidos de demonstração; prazos e obrigações podem mudar quando a loja passar a receber pedidos e pagamentos reais.

## Próxima fatia

1. Revisar e ativar a migração de pedidos e publicar a Edge Function `create-order`.
2. Integrar um provedor de pagamento seguro antes de aceitar pagamentos reais.
3. Revisar a política de retenção e notificações transacionais quando a operação real e as obrigações legais estiverem definidas.
