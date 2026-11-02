export default [
  {
    title: 'Aan de slag',
    items: [
      [
        'Hoe begin ik?',
        'Open het tabblad Instellingen, vul je bedrijfsgegevens in (naam, adres, registratie- en btw-nummer) en sla op. Dat is alles: vanaf de volgende bestelling wordt de factuur automatisch aangemaakt en naar de klant gestuurd. Met de knop „PDF-voorbeeld” controleer je het resultaat.',
      ],
      [
        'Kan ik mijn bedrijfsgegevens automatisch laten invullen?',
        'Ja. Bij de installatie neemt de app naam, juridisch adres, e-mail en telefoon van je winkel over uit Shopify. Shopify kent je registratie- en btw-nummer niet: voor Franse bedrijven typ je bij Instellingen › Automatisch invullen je SIRET of bedrijfsnaam om de rest uit het officiële register aan te vullen. Controleer en sla op.',
      ],
      [
        'Wanneer wordt de factuur aangemaakt?',
        'Standaard zodra de bestelling is betaald (bij kaartbetaling meteen). Je kunt de factuur ook al bij het plaatsen van de bestelling laten maken, maar een later geannuleerde bestelling vraagt dan om een creditnota.',
      ],
      [
        'Krijgt mijn klant de factuur automatisch?',
        'Ja: hij ontvangt een e-mail met de factuur als pdf-bijlage. Die wordt verstuurd namens je winkel en antwoorden komen binnen op het e-mailadres van je bedrijf. Je kunt automatisch verzenden uitschakelen in de instellingen. Heeft hij een klantaccount, dan ziet hij bij elke bestelling ook een knop ‘Factuur downloaden’, zonder dat je iets hoeft in te stellen.',
      ],
      [
        'Waarom zit de factuur niet in de orderbevestiging van Shopify?',
        'Shopify staat apps niet toe bijlagen aan zijn eigen e-mails toe te voegen, dus de app stuurt een aparte e-mail. Je kunt ook een knop „Mijn factuur downloaden” toevoegen aan de orderbevestiging: kopieer de code uit de instellingen en plak die in Instellingen › Meldingen › Orderbevestiging.',
      ],
      [
        'Hoe krijg ik een kopie van mijn facturen?',
        'Vink „Stuur mij een kopie van elke factuur” aan: elke factuur gaat dan ook naar het e-mailadres van je bedrijf. Bovendien kun je alle facturen downloaden via het tabblad Start.',
      ],
    ],
  },
  {
    title: 'Facturen en wettelijke verplichtingen',
    items: [
      [
        'Zijn mijn facturen in orde?',
        'De facturen bevatten de verplichte vermeldingen in Frankrijk en de EU: uniek nummer, datums, gegevens en registratienummer van de verkoper, btw-nummer, artikelen, btw-tarieven en -bedragen, totalen, voorwaarden bij te late betaling. Vul alle bedrijfsgegevens in en laat het sjabloon controleren door je boekhouder.',
      ],
      [
        'Hoe werkt de nummering?',
        'De nummers lopen door zonder gaten of dubbele nummers (bijv. F-2026-00001, F-2026-00002…), zoals de wet vereist. Had je al facturen uitgegeven, stel dan het volgende nummer in bij de instellingen: het kan omhoog, maar nooit omlaag.',
      ],
      [
        'Ik ben vrijgesteld van btw.',
        'Vink de btw-vrijstelling aan in de instellingen: de btw verdwijnt van de factuur en de Franse vermelding « TVA non applicable, art. 293 B du CGI » wordt toegevoegd. Controleer ook dat Shopify je klanten geen belasting rekent (Instellingen › Btw en heffingen).',
      ],
      [
        'Kan ik een factuur wijzigen of verwijderen?',
        'Nee: een uitgegeven factuur mag niet meer veranderen, dat is wettelijk verplicht. Bij een fout of een terugbetaling moet een creditnota worden opgemaakt. Automatische creditnota’s komen in een volgende versie; maak ze tot die tijd met je boekhoudsoftware.',
      ],
      [
        'Hoe lang worden mijn facturen bewaard?',
        'Ze blijven beschikbaar in de app zolang die is geïnstalleerd. De Franse wet verplicht bewaring gedurende 10 jaar: bewaar de kopie die je per e-mail ontvangt of download ze regelmatig. Als je de app verwijdert, vraagt Shopify ons je gegevens na 48 uur te wissen.',
      ],
    ],
  },
  {
    title: 'Factur-X en e-facturatie',
    items: [
      [
        'Wat is Factur-X?',
        'Een pdf die ook de factuurgegevens bevat in een bestand dat boekhoudsoftware kan lezen. Het wordt geaccepteerd door e-factuurplatformen, die in Frankrijk verplicht worden tussen bedrijven: ontvangen vanaf september 2026, verzenden vanaf september 2026 (grote en middelgrote bedrijven) of september 2027 (mkb en microbedrijven). Verkopen aan consumenten vallen er niet onder. Je klanten zien een gewone pdf.',
      ],
      [
        'Waarom staat er „Factur-X gepauzeerd”?',
        'Er ontbreekt een verplicht gegeven voor Factur-X, vermeld naast de melding (vaak het btw-nummer of het land). Vul het aan en sla op: de volgende facturen worden Factur-X. Tot die tijd worden ze als gewone pdf aangemaakt.',
      ],
    ],
  },
  {
    title: 'Talen',
    items: [
      [
        'In welke taal zijn facturen en e-mails?',
        'In de taal van je klant als hij bestelt in het Nederlands, Engels, Frans, Duits, Spaans, Italiaans of Portugees. Anders in de reservetaal die je kiest. Je kunt ook één taal voor alle facturen instellen.',
      ],
      [
        'Kan ik de teksten aanpassen?',
        'Ja: onderwerp en bericht van de e-mail, wettelijke vermeldingen onderaan de factuur en bedankbericht. Leeg gelaten worden ze automatisch vertaald in de taal van de factuur; een eigen tekst wordt ongewijzigd gebruikt, in elke taal.',
      ],
    ],
  },
  {
    title: 'Abonnement en betaling',
    items: [
      [
        'Wat kost het?',
        'Het gratis abonnement bevat {freeLimit} facturen per maand. Het abonnement Essentieel ({essentielPrice} per maand) bevat er {essentielLimit}, het abonnement Onbeperkt ({illimitePrice} per maand) heeft geen limiet. Betaalde abonnementen hebben {trialDays} dagen gratis proefperiode en worden via je Shopify-abonnement gefactureerd.',
      ],
      [
        'Wat gebeurt er als de maandlimiet bereikt is?',
        'Nieuwe bestellingen worden in de wacht gezet en je krijgt een e-mail. Zodra je een hoger abonnement kiest, of aan het begin van de volgende maand, klik je op „Facturen aanmaken”: er gaat geen bestelling verloren. De teller begint op de 1e van elke maand opnieuw.',
      ],
      [
        'Hoe wissel of zeg ik mijn abonnement op?',
        'In het tabblad Abonnement: kies een abonnement en keur het goed op de Shopify-pagina, of klik op „Opzeggen” om terug te gaan naar het gratis abonnement. Het verwijderen van de app beëindigt het abonnement ook.',
      ],
    ],
  },
  {
    title: 'Problemen',
    items: [
      [
        'Een klant heeft zijn factuur niet ontvangen.',
        'Kijk in het tabblad Start naar de kolom E-mail: „Mislukt” wijst op een probleem (beweeg de muis erover voor details). Controleer het adres van de klant, vraag hem in zijn spammap te kijken en klik op „Opnieuw verzenden”. Je kunt de pdf ook downloaden en zelf versturen.',
      ],
      [
        'Mijn logo wordt niet getoond.',
        'Het logo moet een PNG- of JPEG-afbeelding zijn die via https bereikbaar is. Het makkelijkst: upload het in Shopify (Content › Bestanden), kopieer de link en plak die in de instellingen. Controleer met het voorbeeld.',
      ],
      [
        'Wat gebeurt er met mijn gegevens en die van mijn klanten?',
        'De app leest je bestellingen zonder ze te kunnen wijzigen en bewaart alleen wat de factuur nodig heeft (naam, adres, e-mail van de klant, artikelen). Gegevens worden niet verkocht of gedeeld. Verwijderverzoeken van Shopify (AVG) worden automatisch verwerkt.',
      ],
      [
        'Hoe neem ik contact op met support?',
        'Mail ons op {support} met de naam van je winkel. We antwoorden meestal binnen één werkdag.',
      ],
    ],
  },
];
