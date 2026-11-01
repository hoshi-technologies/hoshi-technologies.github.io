export default [
  {
    title: 'Primeros pasos',
    items: [
      [
        '¿Cómo empiezo?',
        'Abra la pestaña Ajustes, complete los datos de su empresa (nombre, dirección, números de registro y de IVA) y guarde. Eso es todo: a partir del próximo pedido, la factura se crea y se envía al cliente automáticamente. Puede comprobar el resultado con el botón «Vista previa del PDF».',
      ],
      [
        '¿Cuándo se crea la factura?',
        'Por defecto, en cuanto se paga el pedido (con tarjeta, al instante). Puede elegir crearla en cuanto se realiza el pedido, pero un pedido cancelado después necesitará una factura rectificativa.',
      ],
      [
        '¿Mi cliente recibe la factura automáticamente?',
        'Sí: recibe un correo con la factura en PDF adjunta. Se envía en nombre de su tienda y las respuestas llegan al correo de su empresa. Puede desactivar el envío automático en los ajustes.',
      ],
      [
        '¿Por qué la factura no está en el correo de confirmación de Shopify?',
        'Shopify no permite que las aplicaciones adjunten archivos a sus propios correos, así que la aplicación envía un correo aparte. También puede añadir un botón «Descargar mi factura» en la confirmación de pedido de Shopify: copie el código de los ajustes y péguelo en Configuración › Notificaciones › Confirmación del pedido.',
      ],
      [
        '¿Cómo recibo una copia de mis facturas?',
        'Marque «Enviarme una copia de cada factura»: cada factura se envía también al correo de su empresa. Además, todas las facturas se pueden descargar desde la pestaña Inicio.',
      ],
    ],
  },
  {
    title: 'Facturas y obligaciones legales',
    items: [
      [
        '¿Mis facturas cumplen la normativa?',
        'Las facturas incluyen las menciones obligatorias en Francia y la UE: número único, fechas, identidad y registro del vendedor, número de IVA, detalle de artículos, tipos y cuotas de IVA, totales, condiciones de demora. Complete todos los datos de su empresa y haga revisar la plantilla por su gestor.',
      ],
      [
        '¿Cómo funciona la numeración?',
        'Los números son correlativos, sin saltos ni duplicados (p. ej. F-2026-00001, F-2026-00002…), como exige la ley. Si ya había emitido facturas, indique el próximo número en los ajustes: puede aumentarse, pero nunca disminuirse.',
      ],
      [
        'Estoy exento de IVA.',
        'Marque la opción de exención de IVA en los ajustes: el IVA desaparece de la factura y se añade la mención francesa « TVA non applicable, art. 293 B du CGI ». Compruebe también que Shopify no cobra impuestos a sus clientes (Configuración › Impuestos y aranceles).',
      ],
      [
        '¿Puedo modificar o eliminar una factura?',
        'No: una factura emitida no debe cambiar, es una obligación legal. Si contiene un error o el pedido se reembolsa, debe emitirse una factura rectificativa. Las rectificativas automáticas llegarán en una próxima versión; mientras tanto, créela con su herramienta contable.',
      ],
      [
        '¿Cuánto tiempo se conservan mis facturas?',
        'Permanecen disponibles en la aplicación mientras esté instalada. La ley francesa exige conservarlas 10 años: guarde la copia recibida por correo o descárguelas con regularidad. Si desinstala la aplicación, Shopify nos pide borrar sus datos 48 horas después.',
      ],
    ],
  },
  {
    title: 'Factur-X y factura electrónica',
    items: [
      [
        '¿Qué es Factur-X?',
        'Es un PDF que además contiene los datos de la factura en un archivo legible por el software contable. Lo aceptan las plataformas de factura electrónica, obligatoria entre empresas en Francia: todas deben poder recibirla desde septiembre de 2026 y emitirla desde septiembre de 2026 (grandes y medianas empresas) o septiembre de 2027 (pymes y microempresas). Las ventas a particulares no están afectadas. Sus clientes ven un PDF normal.',
      ],
      [
        '¿Por qué aparece «Factur-X en pausa»?',
        'Falta un dato obligatorio para Factur-X, indicado junto al mensaje (a menudo el n.º de IVA o el país). Complételo y guarde: las siguientes facturas serán Factur-X. Mientras tanto, se crean como PDF simple.',
      ],
    ],
  },
  {
    title: 'Idiomas',
    items: [
      [
        '¿En qué idioma están las facturas y los correos?',
        'En el idioma de su cliente si compra en español, inglés, francés, alemán, italiano, neerlandés o portugués. Si no, en el idioma de respaldo que elija. También puede imponer un único idioma para todas las facturas.',
      ],
      [
        '¿Puedo personalizar los textos?',
        'Sí: asunto y mensaje del correo, menciones al pie de la factura y mensaje de agradecimiento. Si los deja vacíos, se traducen automáticamente al idioma de la factura; un texto personalizado se usa tal cual, sea cual sea el idioma.',
      ],
    ],
  },
  {
    title: 'Plan y facturación',
    items: [
      [
        '¿Cuánto cuesta?',
        'El plan Gratis incluye {freeLimit} facturas al mes. El plan Esencial ({essentielPrice} al mes) incluye {essentielLimit} y el plan Ilimitado ({illimitePrice} al mes) no tiene límite. Los planes de pago incluyen {trialDays} días de prueba gratis y se cobran a través de su suscripción de Shopify.',
      ],
      [
        '¿Qué pasa al alcanzar el límite mensual?',
        'Los nuevos pedidos quedan en espera y se le avisa por correo. En cuanto cambie a un plan superior, o al empezar el mes siguiente, haga clic en «Generar sus facturas»: no se pierde ningún pedido. El contador se reinicia el día 1 de cada mes.',
      ],
      [
        '¿Cómo cambio de plan o cancelo?',
        'En la pestaña Plan: elija un plan y apruébelo en la página de Shopify, o haga clic en «Cancelar» para volver al plan gratuito. Desinstalar la aplicación también termina la suscripción.',
      ],
    ],
  },
  {
    title: 'Problemas',
    items: [
      [
        'Un cliente no ha recibido su factura.',
        'En la pestaña Inicio, mire la columna Correo: «Error» indica un problema (pase el ratón por encima para ver el detalle). Compruebe la dirección del cliente, pídale que revise la carpeta de spam y haga clic en «Reenviar». También puede descargar el PDF y enviárselo usted.',
      ],
      [
        'Mi logotipo no aparece.',
        'El logotipo debe ser una imagen PNG o JPEG accesible por https. Lo más fácil: súbalo a Shopify (Contenido › Archivos), copie su enlace y péguelo en los ajustes. Compruébelo con la vista previa.',
      ],
      [
        '¿Qué pasa con mis datos y los de mis clientes?',
        'La aplicación lee sus pedidos sin poder modificarlos y solo guarda lo necesario para la factura (nombre, dirección, correo del cliente, artículos). Los datos no se venden ni se comparten. Las solicitudes de borrado enviadas por Shopify (RGPD) se tratan automáticamente.',
      ],
      [
        '¿Cómo contacto con el soporte?',
        'Escríbanos a {support} indicando el nombre de su tienda. Solemos responder en un día laborable.',
      ],
    ],
  },
];
