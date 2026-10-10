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
- Área em `admin.html` para cadastrar, editar, ocultar e remover produtos; enviar fotos locais; criar categorias; ordenar destaques e definir o produto do topo.
- Módulo de catálogo compartilhado pela vitrine e pelo painel, persistido no navegador nesta etapa.
- Etapa de entrega no carrinho, pronta para cotar CEP pela SuperFrete através de uma Edge Function segura.
- Medidas e peso editáveis por produto; até termos medições reais, a vitrine usa uma caixa provisória de 15 × 10 × 13 cm e 0,3 kg.
- Imagens demonstrativas de campanha em `dist/assets/` para coleção, Natal, brinquedos e Dia dos Namorados.
- Ícone local da marca em `dist/favicon.svg`.

Os produtos, preços, imagens e textos de venda continuam identificados como demonstrativos até recebermos o catálogo real.

## Ativar a cotação da SuperFrete em Sandbox

A interface de frete já está pronta, mas não deve receber o token diretamente. A função segura fica em `supabase/functions/shipping-quote/` e chama somente a API da SuperFrete.

1. Crie ou escolha um projeto Supabase e instale/autentique o Supabase CLI no seu computador.
2. No painel do Supabase, em **Project Settings → Edge Functions → Secrets**, cadastre os valores de `supabase/functions/shipping-quote/.env.example`. Use o token de Sandbox somente no segredo `SUPERFRETE_TOKEN`; ele não deve ser salvo no repositório.
3. Defina `SUPERFRETE_ORIGIN_POSTAL_CODE=61762330`, `SUPERFRETE_API_BASE_URL=https://sandbox.superfrete.com` e informe um e-mail real no `SUPERFRETE_USER_AGENT`.
4. Publique a função com `supabase functions deploy shipping-quote --no-verify-jwt`. Antes de produção, restrinja `ALLOWED_ORIGIN` ao domínio exato da loja e proteja o endpoint contra abuso.
5. Copie a URL publicada, no formato `https://<project-ref>.supabase.co/functions/v1/shipping-quote`, para `shippingQuoteEndpoint` em `dist/runtime-config.js`. Essa URL é pública; o token não é.

Depois, abra o carrinho, escolha **Continuar para entrega** e consulte um CEP. A SuperFrete retorna somente as modalidades habilitadas e atendidas para a origem e o destino; a loja não chama os Correios nem outra transportadora diretamente.

## Próxima fatia

1. Conectar este módulo de catálogo ao Supabase Storage e PostgreSQL, protegidos por autenticação administrativa.
2. Criar página individual de produto e variações.
3. Conectar carrinho, estoque e pedidos ao Supabase.
4. Integrar pagamento, persistência de pedidos, emissão de etiquetas e e-mails transacionais.
