export default [
  {
    title: 'Getting started',
    items: [
      [
        'How do I get started?',
        'Open the Settings tab, fill in your business details (name, address, registration and VAT numbers) and save. That’s it: from the next order on, the invoice is created and emailed to the customer automatically. Use the “Preview PDF” button to check how it looks.',
      ],
      [
        'Can my business details be filled in automatically?',
        'Yes. When installed, the app takes your store name, legal address, email and phone from Shopify. Shopify doesn’t know your registration or VAT number: for French companies, in Settings › Auto-fill, type your SIRET or company name to complete the rest from the official business register. Check, then save.',
      ],
      [
        'When is the invoice created?',
        'By default, as soon as the order is paid (immediately for card payments). You can choose to create it as soon as the order is placed, but an order cancelled afterwards will then need a credit note.',
      ],
      [
        'Does my customer receive the invoice automatically?',
        'Yes: they get an email with the PDF invoice attached. It is sent on behalf of your store, and replies go to your business email address. You can turn automatic sending off in the settings. If they have a customer account, they also find a “Download invoice” button on each of their orders, with no setup on your side.',
      ],
      [
        'Why isn’t the invoice in the Shopify order confirmation email?',
        "Shopify doesn’t let apps add attachments to its own emails. To send a single email, choose “A single email”: a “Download invoice” button is added to the Shopify confirmation. Just paste a code once in Settings › Notifications › Order confirmation; the app settings guide you step by step. The customer clicks and the PDF opens, with no code or account.",
      ],
      [
        'How do I get a copy of my invoices?',
        'Tick “Send me a copy of every invoice”: each invoice is also sent to your business email address. All invoices can also be downloaded from the Home tab.',
      ],
    ],
  },
  {
    title: 'Invoices and legal requirements',
    items: [
      [
        'Are my invoices compliant?',
        'Invoices include the details required in France and the EU: unique number, dates, seller identity and registration number, VAT number, item details, VAT rates and amounts, totals, late payment terms. Fill in all your business details and have the template checked by your accountant, who knows your situation.',
      ],
      [
        'How does numbering work?',
        'Numbers follow each other with no gaps or duplicates (e.g. F-2026-00001, F-2026-00002…), as the law requires. If you already issued invoices, set the next number in the settings: it can be increased but never decreased.',
      ],
      [
        'I’m a small business that doesn’t charge VAT.',
        'Tick the VAT exemption option in the settings: VAT disappears from the invoice and the French legal notice « TVA non applicable, art. 293 B du CGI » is added. Also make sure Shopify doesn’t charge taxes to your customers (Settings › Taxes and duties).',
      ],
      [
        'Can I edit or delete an invoice?',
        'No: an issued invoice must never change, it’s a legal requirement. If it contains a mistake or the order is refunded, a credit note must be issued. Automatic credit notes are coming in a future version; until then, create it with your accounting tool.',
      ],
      [
        'How long are my invoices kept?',
        'They stay available in the app as long as it’s installed. French law requires keeping them for 10 years: keep the copy you receive by email or download them regularly. If you uninstall the app, Shopify asks us to delete your data 48 hours later.',
      ],
    ],
  },
  {
    title: 'Factur-X and e-invoicing',
    items: [
      [
        'What is Factur-X?',
        'It’s a PDF that also contains the invoice data in a file that accounting software can read. It’s accepted by e-invoicing platforms, which become mandatory between businesses in France: all must be able to receive e-invoices from September 2026, and issue them from September 2026 (large and mid-sized companies) or September 2027 (SMEs and micro-businesses). Sales to consumers are not covered by this obligation. Your customers see a normal PDF: nothing changes for them.',
      ],
      [
        'Why does it say “Factur-X paused”?',
        'A detail required by Factur-X is missing, shown next to the message (often the VAT number or the country). Fill it in and save: the next invoices will be Factur-X. Meanwhile, they are created as plain PDFs.',
      ],
    ],
  },
  {
    title: 'Languages',
    items: [
      [
        'Which language are invoices and emails in?',
        'In your customer’s language if they order in English, French, German, Spanish, Italian, Dutch or Portuguese. Otherwise in the fallback language you choose. You can also force a single language for all invoices.',
      ],
      [
        'Can I customise the texts?',
        'Yes: email subject and message, legal notice at the bottom of the invoice and thank-you message. Left empty, they are translated automatically into the invoice language; a custom text is used as is, whatever the language.',
      ],
    ],
  },
  {
    title: 'Plan and billing',
    items: [
      [
        'How much does it cost?',
        'The Free plan includes {freeLimit} invoices per month. The Essential plan ({essentielPrice} per month) includes {essentielLimit}, and the Unlimited plan ({illimitePrice} per month) has no limit. Paid plans come with a {trialDays}-day free trial and are billed by Shopify, with your Shopify subscription.',
      ],
      [
        'What happens when I reach the monthly limit?',
        'New orders are put on hold and you are notified by email. As soon as you upgrade, or at the start of the next month, click “Generate their invoices”: no order is lost. The counter resets on the 1st of every month.',
      ],
      [
        'How do I change plan or cancel?',
        'In the Plan tab: choose a plan and approve it on the Shopify page, or click “Cancel” to go back to the free plan. Uninstalling the app also ends the subscription.',
      ],
    ],
  },
  {
    title: 'Troubleshooting',
    items: [
      [
        'A customer didn’t receive their invoice.',
        'In the Home tab, look at the Email column: “Failed” means there was a problem (hover over it for details). Check the customer’s address and ask them to look in their spam folder, then click “Resend”. You can also download the PDF and send it yourself.',
      ],
      [
        'My logo doesn’t show.',
        'The logo must be a PNG or JPEG image available over https. The easiest way: upload it to Shopify (Content › Files), copy its link and paste it into the settings. Use the preview to check.',
      ],
      [
        'What happens to my data and my customers’ data?',
        'The app reads your orders without being able to change them, and only keeps what the invoice needs (customer name, address, email, items). Data is never sold or shared. Deletion requests sent by Shopify (GDPR) are handled automatically.',
      ],
      [
        'How do I contact support?',
        'Email us at {support} with your store name. We usually reply within one business day.',
      ],
    ],
  },
];
