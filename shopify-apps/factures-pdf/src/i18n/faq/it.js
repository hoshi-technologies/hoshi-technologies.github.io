export default [
  {
    title: 'Per iniziare',
    items: [
      [
        'Come si inizia?',
        'Apri la scheda Impostazioni, inserisci i dati della tua azienda (nome, indirizzo, numeri di registrazione e partita IVA) e salva. Fatto: dal prossimo ordine la fattura viene creata e inviata automaticamente al cliente. Puoi controllare il risultato con il pulsante «Anteprima PDF».',
      ],
      [
        'Posso compilare automaticamente i dati della mia azienda?',
        'Sì. All\'installazione, l\'app riprende da Shopify nome, indirizzo legale, email e telefono del negozio. Shopify non conosce il numero di registrazione né la partita IVA: per le aziende francesi, in Impostazioni › Compilazione automatica, digita il SIRET o il nome dell\'azienda per completare il resto dal registro ufficiale. Controlla e salva.',
      ],
      [
        'Quando viene creata la fattura?',
        "Per impostazione predefinita, appena l'ordine è pagato (con carta: subito). Puoi scegliere di crearla appena l'ordine viene effettuato, ma un ordine annullato in seguito richiederà una nota di credito.",
      ],
      [
        'Il mio cliente riceve la fattura automaticamente?',
        "Sì: riceve un'email con la fattura in PDF allegata. Viene inviata a nome del tuo negozio e le risposte arrivano all'email della tua azienda. Puoi disattivare l'invio automatico nelle impostazioni. Se ha un account cliente, trova anche un pulsante «Scarica fattura» su ciascun ordine, senza alcuna configurazione da parte tua.",
      ],
      [
        "Perché la fattura non è nell'email di conferma di Shopify?",
        "Shopify non permette alle app di allegare file alle proprie email. Per evitare una seconda email, scegli «Nessuna email in più»: nell’email di conferma di Shopify, il cliente fa clic su «Visualizza ordine», poi su «Scarica fattura», e conferma il suo indirizzo con un codice. Nessun account né password. Da parte tua, attiva il pulsante una sola volta: Impostazioni › Pagamento › Personalizza › pagina «Stato dell’ordine» › App › Scarica fattura › Salva. Se il tuo negozio usa ancora gli «account classici» di Shopify, scegli l’email separata.",
      ],
      [
        'Come ricevo una copia delle mie fatture?',
        "Seleziona «Inviami una copia di ogni fattura»: ogni fattura viene inviata anche all'email della tua azienda. Inoltre tutte le fatture si possono scaricare dalla scheda Home.",
      ],
    ],
  },
  {
    title: 'Fatture e obblighi di legge',
    items: [
      [
        'Le mie fatture sono conformi?',
        'Le fatture riportano le diciture obbligatorie in Francia e nella UE: numero univoco, date, dati e numero di registrazione del venditore, partita IVA, dettaglio degli articoli, aliquote e importi IVA, totali, condizioni di ritardato pagamento. Completa tutti i dati aziendali e fai verificare il modello dal tuo commercialista.',
      ],
      [
        'Come funziona la numerazione?',
        "I numeri sono progressivi, senza salti né duplicati (es. F-2026-00001, F-2026-00002…), come richiesto dalla legge. Se avevi già emesso fatture, indica il numero successivo nelle impostazioni: può essere aumentato ma mai diminuito.",
      ],
      [
        "Sono in regime di franchigia IVA.",
        "Seleziona l'opzione di franchigia IVA nelle impostazioni: l'IVA scompare dalla fattura e viene aggiunta la dicitura francese « TVA non applicable, art. 293 B du CGI ». Verifica anche che Shopify non applichi imposte ai tuoi clienti (Impostazioni › Imposte e dazi).",
      ],
      [
        'Posso modificare o eliminare una fattura?',
        "No: una fattura emessa non deve più cambiare, è un obbligo di legge. Se contiene un errore o l'ordine viene rimborsato, va emessa una nota di credito. Le note di credito automatiche arriveranno in una prossima versione; nel frattempo creala con il tuo software di contabilità.",
      ],
      [
        'Per quanto tempo sono conservate le fatture?',
        "Restano disponibili nell'app finché è installata. La legge francese impone di conservarle 10 anni: tieni la copia ricevuta via email o scaricale regolarmente. Se disinstalli l'app, Shopify ci chiede di cancellare i tuoi dati dopo 48 ore.",
      ],
    ],
  },
  {
    title: 'Factur-X e fattura elettronica',
    items: [
      [
        "Che cos'è Factur-X?",
        'È un PDF che contiene anche i dati della fattura in un file leggibile dai software di contabilità. È accettato dalle piattaforme di fatturazione elettronica, obbligatoria tra imprese in Francia: tutte devono poterla ricevere da settembre 2026 ed emetterla da settembre 2026 (grandi e medie imprese) o settembre 2027 (PMI e microimprese). Le vendite ai privati non sono interessate. I tuoi clienti vedono un normale PDF.',
      ],
      [
        'Perché compare «Factur-X in pausa»?',
        'Manca un dato obbligatorio per Factur-X, indicato accanto al messaggio (spesso la partita IVA o il paese). Completalo e salva: le fatture successive saranno Factur-X. Nel frattempo vengono create come PDF semplici.',
      ],
    ],
  },
  {
    title: 'Lingue',
    items: [
      [
        'In che lingua sono fatture ed email?',
        'Nella lingua del cliente se ordina in italiano, inglese, francese, tedesco, spagnolo, olandese o portoghese. Altrimenti nella lingua di riserva che scegli. Puoi anche imporre una sola lingua per tutte le fatture.',
      ],
      [
        'Posso personalizzare i testi?',
        "Sì: oggetto e messaggio dell'email, note legali in fondo alla fattura e messaggio di ringraziamento. Se lasciati vuoti, vengono tradotti automaticamente nella lingua della fattura; un testo personalizzato viene usato così com'è, in qualsiasi lingua.",
      ],
    ],
  },
  {
    title: 'Piano e fatturazione',
    items: [
      [
        'Quanto costa?',
        'Il piano Gratuito include {freeLimit} fatture al mese. Il piano Essenziale ({essentielPrice} al mese) ne include {essentielLimit}, il piano Illimitato ({illimitePrice} al mese) non ha limiti. I piani a pagamento hanno {trialDays} giorni di prova gratuita e sono addebitati tramite il tuo abbonamento Shopify.',
      ],
      [
        'Cosa succede quando raggiungo il limite mensile?',
        "I nuovi ordini vengono messi in attesa e ricevi un avviso via email. Appena passi a un piano superiore, o all'inizio del mese successivo, clicca su «Genera le fatture»: nessun ordine va perso. Il contatore si azzera il 1° di ogni mese.",
      ],
      [
        'Come cambio piano o annullo?',
        "Nella scheda Piano: scegli un piano e approvalo sulla pagina di Shopify, oppure clicca su «Annulla» per tornare al piano gratuito. Anche disinstallare l'app termina l'abbonamento.",
      ],
    ],
  },
  {
    title: 'Problemi',
    items: [
      [
        'Un cliente non ha ricevuto la fattura.',
        "Nella scheda Home, guarda la colonna Email: «Errore» indica un problema (passa il mouse sopra per i dettagli). Verifica l'indirizzo del cliente, chiedigli di controllare la cartella spam e clicca su «Invia di nuovo». Puoi anche scaricare il PDF e inviarlo tu.",
      ],
      [
        'Il mio logo non viene visualizzato.',
        'Il logo deve essere un\'immagine PNG o JPEG accessibile in https. Il modo più semplice: caricalo su Shopify (Contenuti › File), copia il link e incollalo nelle impostazioni. Controlla con l\'anteprima.',
      ],
      [
        'Che fine fanno i miei dati e quelli dei miei clienti?',
        "L'app legge i tuoi ordini senza poterli modificare e conserva solo ciò che serve alla fattura (nome, indirizzo, email del cliente, articoli). I dati non vengono venduti né condivisi. Le richieste di cancellazione inviate da Shopify (GDPR) vengono gestite automaticamente.",
      ],
      [
        'Come contatto il supporto?',
        'Scrivici a {support} indicando il nome del tuo negozio. Di solito rispondiamo entro un giorno lavorativo.',
      ],
    ],
  },
];
