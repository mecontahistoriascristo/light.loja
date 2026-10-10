# Automação de cálculo de frete — Frenet ou SuperFrete

Pesquisa feita em 9 de outubro de 2026 para a Light.loja. O objetivo é **consultar somente a API de um intermediador** (Frenet ou SuperFrete), sem credencial, contrato ou chamada direta à API dos Correios.

## Resumo executivo

Para a primeira versão desta loja, a recomendação é começar com **SuperFrete**. Ela tem ambiente de sandbox, documentação pública para site próprio, cobrança sem mensalidade segundo a empresa e uma API que calcula a partir de CEP e dimensões/peso dos produtos. É a rota de menor atrito para exibir preço e prazo no checkout e, depois, gerar a etiqueta.

Escolha a **Frenet** se a prioridade for ter uma malha de transportadoras e regras comerciais mais ampla (regras por região, acréscimo, restrição e frete grátis) ou usar contratos próprios de transportadoras. A integração exige validação do onboarding: o endpoint público atual documenta, além do token da conta, um `x-partner-token`.

Em ambos os casos, a Light.loja não fala com os Correios. Os serviços dos Correios podem aparecer como uma opção **dentro** do intermediador; se a intenção for também não oferecer Correios ao consumidor, basta filtrar/desativar esses serviços na conta e no retorno da cotação.

## Comparação

| Critério | SuperFrete | Frenet |
| --- | --- | --- |
| API para site próprio | Sim; documentação descreve sandbox e produção. | Sim; referência pública para cotação. |
| Cotação | `POST /api/v0/calculator`; CEP de origem/destino e `package` ou `products`. | `POST https://whitelabel.frenet.com.br/v1/quotes`; origem, destino, valor declarado e volumes. |
| Autenticação | `Authorization: Bearer <token>` e `User-Agent` de contato técnico. | Headers `token` e `x-partner-token` na referência atual. |
| Testes | Sandbox separado; etiquetas de sandbox não são postáveis. | Confirmar ambiente de testes durante o onboarding. |
| Operação posterior | API inclui etapas de criar frete, finalizar/gerar etiqueta e webhooks. | Cotação, etiquetas, rastreio e regras de frete na mesma plataforma. |
| Boa escolha quando | Catálogo pequeno, envio via ponto de postagem e implantação rápida. | Regras de frete, múltiplas transportadoras/contratos e operação logística mais configurável. |

Fontes: [SuperFrete — primeiros passos](https://superfrete.readme.io/reference/primeiros-passos), [cotação](https://superfrete.readme.io/reference/cotacao-de-frete), [Frenet — cotar envio](https://docs.frenet.com.br/reference/getshipmentquoteasync), [pré- e pós-cotação](https://docs.frenet.com.br/docs/pre-cotacao-pos-cotacao).

## Arquitetura recomendada

O projeto atual é uma vitrine estática e guarda o carrinho no navegador. Portanto, não deve chamar nenhuma dessas APIs diretamente pelo JavaScript: o token ficaria exposto ao visitante.

```text
Navegador (CEP + itens do carrinho)
            |
            v
POST /api/shipping/quote  — função serverless/backend da loja
            |                    | valida itens e calcula embalagem
            |                    | lê o token em variável secreta
            v                    v
       resposta normalizada <- SuperFrete ou Frenet
            |
            v
opções de entrega no checkout (preço, prazo, transportadora, serviço)
```

1. O catálogo precisa armazenar por SKU: peso em kg, altura, largura, comprimento, preço/valor declarado e, se aplicável, se é frágil. Sem medidas corretas a cotação e a etiqueta podem divergir.
2. Ao informar/alterar o CEP, o navegador envia ao backend apenas os itens, quantidades e CEP. O backend aplica CEP de origem fixo, consolida a embalagem e consulta **um** intermediador.
3. O backend devolve um formato interno, por exemplo: `id`, `provider`, `service`, `carrier`, `priceCents`, `deliveryDays` e `quoteExpiresAt`. A interface não precisa conhecer a resposta específica do fornecedor.
4. Ao selecionar uma opção, grave no pedido tanto a escolha como a cotação recebida. Refaça a cotação imediatamente antes de cobrar e, só após pagamento confirmado, crie/emita a etiqueta pelo mesmo fornecedor. Não gere etiqueta ao apenas simular frete.
5. Trate timeout, CEP não atendido e nenhuma modalidade retornada mostrando uma mensagem útil e um canal de atendimento. Faça cache curto por `CEP de destino + carrinho + versão da embalagem`, mas não reutilize uma cotação antiga na emissão.

## Fluxo da SuperFrete

1. Criar conta, cadastrar a origem e gerar o token em **Integrações → Desenvolvedores**. A documentação indica `https://sandbox.superfrete.com/` para testes e `https://api.superfrete.com/` para produção; o token é específico de cada ambiente.
2. No backend, fazer a cotação em `POST /api/v0/calculator`, com Bearer token e `User-Agent` contendo nome/versão da aplicação e e-mail técnico.
3. Enviar `from.postal_code`, `to.postal_code`, `services`, opções de seguro e um `package` já consolidado **ou** o array `products`. Quando recebe produtos individuais, a API calcula uma caixa ideal; essas dimensões retornadas devem ser reaproveitadas na criação da etiqueta.
4. Mostrar apenas os serviços permitidos pela operação. A documentação relaciona códigos `1` (PAC), `2` (SEDEX), `17` (Mini Envios), `3` (Jadlog), `31` (Loggi) e `33` (J&T); se a loja não quiser oferecer Correios, não solicite/aceite `1`, `2` e `17`. A documentação também informa que Loggi é habilitada nas configurações do token e pode depender de ponto de postagem próximo da origem.
5. Após o pagamento, usar as APIs de etiqueta da SuperFrete. Há endpoints documentados para criar frete, finalizar pedido/gerar etiqueta, imprimir e webhooks.

O plano de integração e os limites de cada modalidade devem ser conferidos no painel antes do lançamento: por exemplo, a página de cotação declara limites diferentes por transportadora e ponto de postagem. Fontes: [guia de integração da SuperFrete](https://superfrete.com/integracao-frete) e [referência de cotação](https://superfrete.readme.io/reference/cotacao-de-frete).

## Fluxo da Frenet

1. Criar/configurar a conta, habilitar apenas as transportadoras e serviços desejados e obter o token. A Frenet informa que o token da conta fica em **Dados cadastrais → Chaves de acesso**.
2. Confirmar com a Frenet o credenciamento necessário para o `x-partner-token` exigido pelo endpoint atual. Não assumir que o token de lojista, sozinho, autoriza a nova API.
3. O backend envia a cotação para `POST https://whitelabel.frenet.com.br/v1/quotes`, com `SenderZipCode`, `RecipientZipCode`, `RecipientCountry` (`BR`), `ShipmentItemValue` e `Volumes`.
4. Usar a **pré-cotação** no checkout. Ela retorna os serviços habilitados e já pode refletir regras de frete do painel, como frete grátis, restrição de entrega ou acréscimo por região. A **pós-cotação** é para o preço real da postagem/etiqueta e, segundo a documentação, não aplica essas regras. Não troque uma pela outra sem definir se o objetivo é preço exibido ou compra da postagem.
5. Na emissão, enviar a embalagem padrão/dimensões corretas; a Frenet explicita que elas são necessárias para o cálculo de etiqueta.

Fontes: [como obter o token](https://ajuda.frenet.com.br/knowledge-base/api-frenet/), [referência da cotação](https://docs.frenet.com.br/reference/getshipmentquoteasync) e [diferença entre pré- e pós-cotação](https://docs.frenet.com.br/docs/pre-cotacao-pos-cotacao).

## Decisão proposta e próximos passos

Adotar **SuperFrete como primeiro provedor**, atrás de uma interface interna de cotação (`POST /api/shipping/quote`). Isso permite lançar o checkout sem acoplá-lo à API dos Correios e manter a possibilidade de adicionar Frenet depois sem reescrever a interface.

Antes de desenvolver:

1. Definir o CEP de origem e os dados físicos/embalagem de cada produto.
2. Criar a conta e o token de sandbox da SuperFrete; testar CEPs atendidos, modalidades sem Correios e casos de erro.
3. Decidir quais transportadoras serão exibidas e se haverá frete grátis/subsídio próprio.
4. Só depois criar o backend/serverless, guardar token e origem em variáveis de ambiente e conectar a tela de entrega existente.

Nenhuma credencial deve ser adicionada ao repositório ou enviada ao navegador.
