export default [
  {
    title: 'Erste Schritte',
    items: [
      [
        'Wie fange ich an?',
        'Öffnen Sie den Tab „Einstellungen“, geben Sie Ihre Unternehmensdaten ein (Name, Adresse, Register- und USt-IdNr.) und speichern Sie. Das ist alles: Ab der nächsten Bestellung wird die Rechnung automatisch erstellt und an den Kunden gesendet. Mit „PDF-Vorschau“ können Sie das Ergebnis prüfen.',
      ],
      [
        'Können meine Unternehmensdaten automatisch ausgefüllt werden?',
        'Ja. Bei der Installation übernimmt die App Name, rechtliche Adresse, E-Mail und Telefon Ihres Shops aus Shopify. Shopify kennt weder Registernummer noch USt-IdNr.: Bei französischen Unternehmen geben Sie unter Einstellungen › Automatisch ausfüllen Ihre SIRET oder den Firmennamen ein, um den Rest aus dem amtlichen Register zu ergänzen. Prüfen und speichern.',
      ],
      [
        'Wann wird die Rechnung erstellt?',
        'Standardmäßig, sobald die Bestellung bezahlt ist (bei Kartenzahlung sofort). Sie können sie auch schon bei Bestelleingang erstellen lassen; eine später stornierte Bestellung erfordert dann eine Gutschrift.',
      ],
      [
        'Erhält mein Kunde die Rechnung automatisch?',
        'Ja: Er bekommt eine E-Mail mit der Rechnung als PDF im Anhang. Sie wird im Namen Ihres Shops versendet, Antworten gehen an Ihre geschäftliche E-Mail-Adresse. Den automatischen Versand können Sie in den Einstellungen abschalten. Hat er ein Kundenkonto, findet er dort außerdem bei jeder Bestellung eine Schaltfläche „Rechnung herunterladen“, ganz ohne Einrichtung.',
      ],
      [
        'Warum ist die Rechnung nicht in der Shopify-Bestellbestätigung?',
        "Shopify erlaubt Apps nicht, eigenen E-Mails Anhänge hinzuzufügen. Um eine zweite E-Mail zu vermeiden, wählen Sie „Keine zusätzliche E-Mail“: Der Kunde klickt in der Shopify-Bestätigung auf „Bestellung ansehen“, dann auf „Rechnung herunterladen“ und bestätigt seine E-Mail-Adresse mit einem Code. Kein Konto, kein Passwort, keine Einrichtung. Nutzt Ihr Shop noch die „klassischen Konten“ von Shopify, wählen Sie die separate E-Mail.",
      ],
      [
        'Wie erhalte ich eine Kopie meiner Rechnungen?',
        'Aktivieren Sie „Mir eine Kopie jeder Rechnung senden“: Jede Rechnung geht dann auch an Ihre geschäftliche E-Mail-Adresse. Außerdem können alle Rechnungen im Tab „Start“ heruntergeladen werden.',
      ],
    ],
  },
  {
    title: 'Rechnungen und rechtliche Pflichten',
    items: [
      [
        'Sind meine Rechnungen gesetzeskonform?',
        'Die Rechnungen enthalten die in Frankreich und der EU vorgeschriebenen Angaben: fortlaufende Nummer, Daten, Verkäufer mit Registernummer, USt-IdNr., Artikel, Steuersätze und -beträge, Summen, Verzugsbedingungen. Füllen Sie alle Unternehmensdaten aus und lassen Sie die Vorlage von Ihrem Steuerberater prüfen.',
      ],
      [
        'Wie funktioniert die Nummerierung?',
        'Die Nummern sind fortlaufend, ohne Lücken oder Doppelungen (z. B. F-2026-00001, F-2026-00002 …), wie gesetzlich vorgeschrieben. Wenn Sie bereits Rechnungen ausgestellt haben, legen Sie die nächste Nummer in den Einstellungen fest: Sie kann erhöht, aber nie verringert werden.',
      ],
      [
        'Ich bin Kleinunternehmer und berechne keine Umsatzsteuer.',
        'Aktivieren Sie die Option für Kleinunternehmer in den Einstellungen: Die Steuer verschwindet von der Rechnung und der französische Pflichthinweis « TVA non applicable, art. 293 B du CGI » wird ergänzt. Prüfen Sie auch, dass Shopify Ihren Kunden keine Steuern berechnet (Einstellungen › Steuern und Zölle).',
      ],
      [
        'Kann ich eine Rechnung ändern oder löschen?',
        'Nein: Eine ausgestellte Rechnung darf nicht mehr geändert werden, das ist gesetzlich vorgeschrieben. Bei einem Fehler oder einer Erstattung muss eine Gutschrift erstellt werden. Automatische Gutschriften kommen in einer nächsten Version; bis dahin erstellen Sie sie mit Ihrer Buchhaltungssoftware.',
      ],
      [
        'Wie lange werden meine Rechnungen aufbewahrt?',
        'Sie bleiben in der App verfügbar, solange sie installiert ist. Rechnungen müssen 10 Jahre aufbewahrt werden: Behalten Sie die per E-Mail erhaltene Kopie oder laden Sie sie regelmäßig herunter. Nach einer Deinstallation fordert Shopify uns auf, Ihre Daten nach 48 Stunden zu löschen.',
      ],
    ],
  },
  {
    title: 'Factur-X und E-Rechnung',
    items: [
      [
        'Was ist Factur-X?',
        'Ein PDF, das zusätzlich die Rechnungsdaten in einer für Buchhaltungssoftware lesbaren Datei enthält (in Deutschland als ZUGFeRD bekannt). Es wird von E-Rechnungs-Plattformen akzeptiert. In Frankreich wird die E-Rechnung zwischen Unternehmen Pflicht: Empfang ab September 2026, Versand ab September 2026 (große und mittlere Unternehmen) bzw. September 2027 (KMU und Kleinstunternehmen). Verkäufe an Privatkunden sind nicht betroffen. Ihre Kunden sehen ein normales PDF.',
      ],
      [
        'Warum steht dort „Factur-X pausiert“?',
        'Eine für Factur-X erforderliche Angabe fehlt; sie wird neben der Meldung genannt (oft die USt-IdNr. oder das Land). Ergänzen Sie sie und speichern Sie: Die nächsten Rechnungen werden im Factur-X-Format erstellt. Bis dahin entstehen einfache PDFs.',
      ],
    ],
  },
  {
    title: 'Sprachen',
    items: [
      [
        'In welcher Sprache sind Rechnungen und E-Mails?',
        'In der Sprache des Kunden, wenn er auf Deutsch, Englisch, Französisch, Spanisch, Italienisch, Niederländisch oder Portugiesisch bestellt. Sonst in der von Ihnen gewählten Ersatzsprache. Sie können auch eine einzige Sprache für alle Rechnungen festlegen.',
      ],
      [
        'Kann ich die Texte anpassen?',
        'Ja: Betreff und Text der E-Mail, rechtliche Hinweise unten auf der Rechnung und Dankesnachricht. Leer gelassen, werden sie automatisch in die Sprache der Rechnung übersetzt; ein eigener Text wird unabhängig von der Sprache unverändert verwendet.',
      ],
    ],
  },
  {
    title: 'Tarif und Abrechnung',
    items: [
      [
        'Was kostet die App?',
        'Der kostenlose Tarif umfasst {freeLimit} Rechnungen pro Monat. Der Tarif Essential ({essentielPrice} pro Monat) umfasst {essentielLimit}, der Tarif Unbegrenzt ({illimitePrice} pro Monat) hat kein Limit. Bezahlte Tarife können {trialDays} Tage kostenlos getestet werden und werden über Ihr Shopify-Abonnement abgerechnet.',
      ],
      [
        'Was passiert, wenn das Monatslimit erreicht ist?',
        'Neue Bestellungen werden zurückgestellt und Sie werden per E-Mail benachrichtigt. Sobald Sie einen höheren Tarif wählen oder der neue Monat beginnt, klicken Sie auf „Rechnungen erstellen“: Keine Bestellung geht verloren. Der Zähler beginnt am 1. jedes Monats neu.',
      ],
      [
        'Wie wechsle oder kündige ich meinen Tarif?',
        'Im Tab „Tarif“: Wählen Sie einen Tarif und bestätigen Sie auf der Shopify-Seite, oder klicken Sie auf „Kündigen“, um zum kostenlosen Tarif zurückzukehren. Eine Deinstallation der App beendet das Abonnement ebenfalls.',
      ],
    ],
  },
  {
    title: 'Probleme',
    items: [
      [
        'Ein Kunde hat seine Rechnung nicht erhalten.',
        'Sehen Sie im Tab „Start“ in der Spalte E-Mail nach: „Fehlgeschlagen“ weist auf ein Problem hin (Details beim Darüberfahren mit der Maus). Prüfen Sie die Adresse des Kunden, bitten Sie ihn, im Spam-Ordner nachzusehen, und klicken Sie auf „Erneut senden“. Sie können das PDF auch herunterladen und selbst senden.',
      ],
      [
        'Mein Logo wird nicht angezeigt.',
        'Das Logo muss ein PNG- oder JPEG-Bild sein, das über https erreichbar ist. Am einfachsten: Laden Sie es in Shopify hoch (Content › Dateien), kopieren Sie den Link und fügen Sie ihn in den Einstellungen ein. Prüfen Sie das Ergebnis mit der Vorschau.',
      ],
      [
        'Was passiert mit meinen Daten und denen meiner Kunden?',
        'Die App liest Ihre Bestellungen, ohne sie ändern zu können, und speichert nur, was für die Rechnung nötig ist (Name, Adresse, E-Mail des Kunden, Artikel). Daten werden weder verkauft noch weitergegeben. Löschanfragen von Shopify (DSGVO) werden automatisch bearbeitet.',
      ],
      [
        'Wie erreiche ich den Support?',
        'Schreiben Sie uns an {support} und nennen Sie den Namen Ihres Shops. Wir antworten in der Regel innerhalb eines Werktags.',
      ],
    ],
  },
];
