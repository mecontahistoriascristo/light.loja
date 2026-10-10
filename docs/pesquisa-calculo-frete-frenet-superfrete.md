# Cálculo de frete com Frenet ou SuperFrete

Pesquisa em fontes oficiais, em 9 de outubro de 2026. O objetivo é calcular e apresentar frete no checkout **sem integrar a API dos Correios diretamente**. As chamadas da loja devem ir somente à API escolhida; as transportadoras que aparecerem no resultado são gerenciadas pelo agregador.

## Resumo da decisão

Para a primeira versão da Light.loja, recomendo começar pela **SuperFrete**, com uma integração pequena de cotação no checkout e emissão de etiqueta em uma fase posterior. Ela declara suporte a API para site próprio e concentra cotação, etiqueta e rastreio; seus termos a descrevem como integradora, não como transportadora. A API oficial também expõe cotação, criação/finalização de frete e configuração de webhooks. [Integrações/API própria](https://ajuda.superfrete.com/artigo/quais-as-integracoes-disponiveis-da-superfrete-com-plataformas-de-e-commerce/), [documentação da API](https://superfrete.readme.io/), [termos](https://superfrete.com/termos-de-uso-e-condicoes).

Escolheria **Frenet** desde o início se a prioridade for regras de frete mais avançadas (frete grátis por região, restrições, acréscimos), contratos próprios com transportadoras ou uma operação que já preveja onboarding de lojistas, carteira e conciliação. A pré-cotação retorna os serviços habilitados e aplica essas regras; a pós-cotação serve para preço real de postagem/etiqueta. [Pré e pós-cotação](https://docs.frenet.com.br/docs/pre-cotacao-pos-cotacao), [visão da integração](https://docs.frenet.com.br/docs/getting-started).

Essa recomendação é de adequação técnica, não uma comparação de preço: validar tabelas, transportadoras disponíveis para o CEP de origem e condições comerciais antes de contratar.

## Fluxo a implementar

```text
Cliente informa CEP
        |
site estático -> POST /api/frete/cotacao (função serverless/back-end)
        |                         |
        |                         +-> Frenet OU SuperFrete (credenciais secretas)
        |                                      |
        +<- preço, prazo, transportadora e serviço elegível
```

1. O catálogo precisa guardar por SKU: peso (kg), altura, largura e comprimento (cm). No pedido, o servidor monta o(s) volume(s), usa o CEP de origem configurado e recebe CEP de destino e valor dos itens.
2. O front-end chama apenas uma rota própria (`/api/frete/cotacao`) depois de validar o CEP; aplique debounce e cache curto pela combinação origem/destino/itens. Nunca exponha token, segredo OAuth ou URL de administração no JavaScript de `dist/`.
3. A rota converte o retorno do provedor em um contrato interno simples: `provider`, `serviceCode`, `carrier`, `serviceName`, `price`, `deliveryDays` e `quoteExpiresAt`. Mostre as opções e permita ao cliente escolher uma.
4. Ao criar o pedido, persista tanto a opção escolhida quanto os parâmetros da cotação. Recalcule/valide antes de cobrar ou emitir etiqueta, pois preço, elegibilidade e prazo podem mudar.
5. Em uma segunda fase, crie a etiqueta no mesmo back-end e receba atualizações por webhook. Não use a cotação do navegador como autorização de postagem.

Uma hospedagem estática pura não basta: a Light hoje é uma prévia local sem back-end. A menor evolução é uma função serverless (por exemplo, junto do futuro Supabase/Edge Function) e uma tabela para produtos, pedidos e cotações. Isso também atende ao próximo passo já apontado no README.

## Frenet

- **Autenticação:** a Frenet exige `Token do cliente` e `Partner Token`. O token do cliente é obtido pelo painel do lojista ou pelo onboarding; o Partner Token é solicitado ao time de Parcerias para homologação e produção. Não é uma credencial a colocar no navegador. [Autenticação](https://docs.frenet.com.br/docs/autenticacao), [homologação](https://docs.frenet.com.br/docs/processo-de-homologa%C3%A7%C3%A3o).
- **Cotação para checkout:** `POST http://api.frenet.com.br/shipping/quote`, com cabeçalho `token`. A referência declara obrigatórios `SellerCEP`, `RecipientCEP`, `ShipmentInvoiceValue` e `ShippingItemArray`; país, serviço específico e cupom são opcionais. Para o uso no checkout, adotar a **pré-cotação**, que retorna serviços habilitados e aplica regras configuradas no painel. [Endpoint de cotação](https://docs.frenet.com.br/reference/calculateshippingquote), [pré-cotação](https://docs.frenet.com.br/docs/pre-cotacao-pos-cotacao).
- **Retorno a exibir:** a SDK oficial demonstra a leitura de serviços com transportadora, preço e prazo (`Carrier`, `ShippingPrice`, `DeliveryTime`). O adaptador interno deve normalizar esses campos e também conservar o código de serviço. [SDK oficial](https://github.com/FrenetGatewaydeFretes/frenet-php).
- **Etiquetas e rastreio:** há fluxo de uma etapa (one-click, com saldo) e de duas etapas; o escopo de homologação inclui retorno de rastreio, URL de etiqueta e documento de postagem. O webhook de atualização de pedidos é `POST`, deve responder 2xx em até 10 s; pode usar um header/token configurado como camada adicional. [Homologação](https://docs.frenet.com.br/docs/processo-de-homologa%C3%A7%C3%A3o), [webhook de pedidos](https://docs.frenet.com.br/docs/webhook-atualiza%C3%A7%C3%A3o-de-dados-de-pedidos).
- **Atenção:** a documentação de cotação publicada mostra URL `http`; confirmar com a Frenet o endpoint HTTPS de produção antes da implementação. O servidor deve sempre usar HTTPS para a integração quando disponibilizado.

## SuperFrete

- **Autenticação:** a referência oficial organiza autenticação como **OAuth** e “Solicitação do token”. Implementar esse fluxo somente no servidor e guardar tokens/segredos em variáveis protegidas; a página exata de credenciais depende do aplicativo/conta criada na SuperFrete. [OAuth e token](https://superfrete.readme.io/reference/autentica%C3%A7%C3%A3o), [solicitação de token](https://superfrete.readme.io/reference/solicita%C3%A7%C3%A3o-do-token).
- **Cotação:** a API tem endpoint oficial de **Cotação de frete** e outro de **Informações dos pacotes**. O adaptador deve fornecer origem, destino, dimensões, peso e valor declarado/seguro conforme o contrato da referência e só devolver ao cliente modalidades elegíveis. Produtos sem peso/medidas ou fora do limite podem não receber opção de frete. [Cotação](https://superfrete.readme.io/reference/cotacao-de-frete), [pacotes](https://superfrete.readme.io/reference/informa%C3%A7%C3%B5es-dos-pacotes), [limites por modalidade](https://ajuda.superfrete.com/artigo/pesos-medidas-e-seguro-maximo-por-modalidade-nos-envios-via-integracao/).
- **Emissão:** depois que o pedido estiver pago, a API documenta “Criar frete para a SuperFrete”, “Finalizar pedido e gerar etiqueta”, consulta, impressão, listagem e cancelamento. Tratar a emissão como operação administrativa/idempotente no servidor, nunca disparada ao alterar o CEP. [Criação](https://superfrete.readme.io/reference/adicionar-frete-carrinho), [finalização/etiqueta](https://superfrete.readme.io/reference/apiintegrationv1checkout).
- **Webhooks:** a referência disponibiliza criar, listar, atualizar e apagar configurações de webhook. Antes de ativar em produção, conferir naquela referência quais eventos, formato de payload e mecanismo de autenticação/assinatura são efetivamente fornecidos; o handler deve responder rápido, validar a origem e processar em fila. [Webhooks](https://superfrete.readme.io/reference/webhook), [criar webhook](https://superfrete.readme.io/reference/criar-webhook-app).

## Próximo passo objetivo

Criar uma prova de conceito com **um** provedor (SuperFrete recomendado): cadastrar medidas reais de 2–3 produtos, criar `POST /api/frete/cotacao`, cotar para CEPs de diferentes regiões e comparar o retorno mostrado no checkout com o painel do provedor. Só então ligar criação de pedidos, pagamento e etiquetas.
