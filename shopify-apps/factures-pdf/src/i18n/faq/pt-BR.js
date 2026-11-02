export default [
  {
    title: 'Primeiros passos',
    items: [
      [
        'Como começo?',
        'Abra a aba Configurações, preencha os dados da sua empresa (nome, endereço, números de registro e de IVA) e salve. Pronto: a partir do próximo pedido, a fatura é criada e enviada ao cliente automaticamente. Use o botão "Prévia do PDF" para conferir o resultado.',
      ],
      [
        'Posso preencher os dados da empresa automaticamente?',
        'Sim. Na instalação, o app pega da Shopify o nome, o endereço legal, o e-mail e o telefone da loja. A Shopify não conhece o número de registro nem o de IVA: para empresas francesas, em Configurações › Preenchimento automático, digite seu SIRET ou o nome da empresa para completar o resto a partir do registro oficial. Confira e salve.',
      ],
      [
        'Quando a fatura é criada?',
        'Por padrão, assim que o pedido é pago (no cartão, na hora). Você pode escolher criá-la assim que o pedido é feito, mas um pedido cancelado depois exigirá uma nota de crédito.',
      ],
      [
        'Meu cliente recebe a fatura automaticamente?',
        'Sim: ele recebe um e-mail com a fatura em PDF anexada. O e-mail é enviado em nome da sua loja e as respostas chegam ao e-mail da sua empresa. Você pode desativar o envio automático nas configurações. Se ele tiver uma conta de cliente, também encontra um botão “Baixar fatura” em cada pedido, sem nenhuma configuração da sua parte.',
      ],
      [
        'Por que a fatura não está no e-mail de confirmação da Shopify?',
        "A Shopify não permite que apps anexem arquivos aos próprios e-mails. Para enviar um só e-mail, escolha “Um só e-mail”: um botão “Baixar fatura” é adicionado à confirmação da Shopify. Basta colar uma vez um código em Configurações › Notificações › Confirmação do pedido; as configurações do app guiam você passo a passo. O cliente clica e o PDF abre, sem código nem conta.",
      ],
      [
        'Como recebo uma cópia das minhas faturas?',
        'Marque "Enviar-me uma cópia de cada fatura": cada fatura também é enviada ao e-mail da sua empresa. Além disso, todas as faturas podem ser baixadas na aba Início.',
      ],
    ],
  },
  {
    title: 'Faturas e obrigações legais',
    items: [
      [
        'Minhas faturas estão em conformidade?',
        'As faturas trazem as menções obrigatórias na França e na UE: número único, datas, identificação e registro do vendedor, número de IVA, detalhe dos itens, alíquotas e valores de IVA, totais, condições de atraso. Preencha todos os dados da empresa e peça ao seu contador para validar o modelo.',
      ],
      [
        'Como funciona a numeração?',
        'Os números são sequenciais, sem falhas nem duplicados (ex. F-2026-00001, F-2026-00002…), como a lei exige. Se você já emitia faturas, informe o próximo número nas configurações: ele pode aumentar, mas nunca diminuir.',
      ],
      [
        'Sou isento de IVA.',
        'Marque a opção de isenção de IVA nas configurações: o IVA some da fatura e a menção francesa « TVA non applicable, art. 293 B du CGI » é adicionada. Verifique também se a Shopify não cobra impostos dos seus clientes (Configurações › Tributos e taxas).',
      ],
      [
        'Posso alterar ou excluir uma fatura?',
        'Não: uma fatura emitida não pode mais mudar, é uma obrigação legal. Se houver um erro ou o pedido for reembolsado, é preciso emitir uma nota de crédito. As notas de crédito automáticas chegam em uma próxima versão; até lá, emita-a no seu sistema contábil.',
      ],
      [
        'Por quanto tempo minhas faturas ficam guardadas?',
        'Elas ficam disponíveis no app enquanto ele estiver instalado. A lei francesa exige guardá-las por 10 anos: mantenha a cópia recebida por e-mail ou baixe-as regularmente. Se você desinstalar o app, a Shopify nos pede para apagar seus dados 48 horas depois.',
      ],
    ],
  },
  {
    title: 'Factur-X e fatura eletrônica',
    items: [
      [
        'O que é Factur-X?',
        'É um PDF que também contém os dados da fatura em um arquivo legível por softwares de contabilidade. É aceito pelas plataformas de fatura eletrônica, obrigatória entre empresas na França: todas devem poder recebê-la desde setembro de 2026 e emiti-la a partir de setembro de 2026 (grandes e médias empresas) ou setembro de 2027 (pequenas e microempresas). Vendas a consumidores finais não são afetadas. Seus clientes veem um PDF normal.',
      ],
      [
        'Por que aparece "Factur-X pausado"?',
        'Falta uma informação obrigatória para o Factur-X, indicada ao lado da mensagem (geralmente o número de IVA ou o país). Preencha e salve: as próximas faturas serão Factur-X. Enquanto isso, elas são criadas como PDF simples.',
      ],
    ],
  },
  {
    title: 'Idiomas',
    items: [
      [
        'Em que idioma ficam as faturas e os e-mails?',
        'No idioma do seu cliente, se ele comprar em português, inglês, francês, alemão, espanhol, italiano ou holandês. Caso contrário, no idioma alternativo que você escolher. Você também pode definir um único idioma para todas as faturas.',
      ],
      [
        'Posso personalizar os textos?',
        'Sim: assunto e mensagem do e-mail, menções no rodapé da fatura e mensagem de agradecimento. Se ficarem vazios, são traduzidos automaticamente no idioma da fatura; um texto personalizado é usado como está, em qualquer idioma.',
      ],
    ],
  },
  {
    title: 'Plano e cobrança',
    items: [
      [
        'Quanto custa?',
        'O plano Grátis inclui {freeLimit} faturas por mês. O plano Essencial ({essentielPrice} por mês) inclui {essentielLimit}, e o plano Ilimitado ({illimitePrice} por mês) não tem limite. Os planos pagos têm {trialDays} dias de teste grátis e são cobrados pela Shopify, junto com a sua assinatura Shopify.',
      ],
      [
        'O que acontece quando atinjo o limite mensal?',
        'Os novos pedidos ficam em espera e você é avisado por e-mail. Assim que mudar para um plano superior, ou no início do mês seguinte, clique em "Gerar as faturas": nenhum pedido é perdido. O contador recomeça no dia 1º de cada mês.',
      ],
      [
        'Como mudo de plano ou cancelo?',
        'Na aba Plano: escolha um plano e aprove na página da Shopify, ou clique em "Cancelar" para voltar ao plano grátis. Desinstalar o app também encerra a assinatura.',
      ],
    ],
  },
  {
    title: 'Problemas',
    items: [
      [
        'Um cliente não recebeu a fatura.',
        'Na aba Início, veja a coluna E-mail: "Falha" indica um problema (passe o mouse por cima para ver o detalhe). Confira o endereço do cliente, peça que ele veja a pasta de spam e clique em "Reenviar". Você também pode baixar o PDF e enviá-lo você mesmo.',
      ],
      [
        'Meu logotipo não aparece.',
        'O logotipo deve ser uma imagem PNG ou JPEG acessível por https. O mais fácil: envie-o para a Shopify (Conteúdo › Arquivos), copie o link e cole nas configurações. Confira com a prévia.',
      ],
      [
        'O que acontece com meus dados e os dos meus clientes?',
        'O app lê seus pedidos sem poder alterá-los e guarda apenas o necessário para a fatura (nome, endereço, e-mail do cliente, itens). Os dados não são vendidos nem compartilhados. Os pedidos de exclusão enviados pela Shopify (LGPD/RGPD) são tratados automaticamente.',
      ],
      [
        'Como falo com o suporte?',
        'Escreva para {support} informando o nome da sua loja. Normalmente respondemos em até um dia útil.',
      ],
    ],
  },
];
