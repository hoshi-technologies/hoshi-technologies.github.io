# Bouton « Télécharger ma facture » dans l'espace client

Le client connecté à son compte client Shopify voit un bouton **Télécharger ma facture** :

- dans la liste de ses commandes,
- sur la page de chaque commande.

Le bouton arrive avec l'appli, sans code à coller. Shopify exige que le marchand l'active une
seule fois dans l'éditeur : **Paramètres › Paiement › Personnaliser**, page **Statut de la
commande**, icône **Applications**, **Télécharger ma facture**, **Enregistrer**. Les réglages de
l'appli affichent ces étapes et un bouton qui ouvre directement les réglages de paiement.
Le bouton n'apparaît que si la facture de la commande existe déjà.

**Sans compte client.** L'e-mail de confirmation de Shopify contient un lien « Voir ma commande ».
Ce lien ouvre la page de la commande sans connexion, et le bouton y est affiché. Au clic, Shopify
demande au client un code reçu par e-mail : aucun compte ni mot de passe à créer. Il le ramène
ensuite sur sa commande, où le bouton ouvre la facture. Le lien n'est jamais donné avant cette
confirmation.

Il faut les comptes clients actuels de Shopify (par défaut). Les anciens « comptes classiques »
n'affichent pas les extensions : ces boutiques choisissent l'e-mail séparé.

## Fonctionnement

1. L'extension `extensions/invoice-download` (cible `customer-account.order.action.menu-item.render`)
   demande à Shopify un jeton de session du client (`shopify.sessionToken.get()`).
2. Elle appelle `GET /customer-api/invoice?order=<gid de la commande>` sur le serveur.
3. Le serveur fait trois vérifications avant de renvoyer le lien `/f/<jeton>.pdf` :
   - la signature du jeton, avec le secret de l'appli ;
   - la boutique, lue dans `dest` ;
   - le client, lu dans `sub` : la commande doit lui appartenir.

   Quand la commande appartient à un autre client, ou que le client n'est pas connecté, la réponse est `{ ready: false }`, sans rien révéler.
4. Chaque accès est noté dans le journal des accès (`invoice.account_link`).

Pour les factures émises avant cette version, le client de la commande est vérifié auprès de
l'API Admin de Shopify.

## Mise en ligne (une seule fois)

1. **Accès réseau.** Dans le tableau de bord Shopify (Partners / Dev Dashboard), ouvrez l'appli
   **Hoshi Factures**, puis **Demandes d'accès à l'API**. Sous « Autoriser l'accès au réseau dans
   les extensions de paiement et de compte », cliquez sur **Autoriser l'accès au réseau**.
   L'accord est immédiat.
2. **Données client protégées.** Le droit `read_customers` a été ajouté : Shopify n'identifie
   le client connecté qu'avec lui. Dans **Demandes d'accès à l'API → Données client protégées**,
   vérifiez que l'accès est bien demandé (déjà fait pour le nom, l'e-mail et l'adresse).
3. Sur votre PC, dans le dossier `shopify-apps/factures-pdf` :

   ```
   git pull
   npm install
   npx wrangler deploy
   shopify app deploy
   ```

   - `npm install` installe Preact pour l'extension.
   - `npx wrangler deploy` met en ligne le serveur avec la nouvelle route.
   - `shopify app deploy` publie l'extension et le nouveau droit `read_customers`.

4. Ouvrez l'appli dans l'admin de votre boutique de test. Shopify demande d'accepter le nouveau
   droit : acceptez.
5. Testez : passez une commande avec un compte client, puis ouvrez **Compte › Commandes**. Le
   bouton apparaît dans le menu de la commande.

Pour tester en local avant la mise en ligne, lancez `shopify app dev`. L'extension se charge
alors dans l'aperçu de l'espace client.

> L'adresse du serveur appelée par l'extension se trouve dans
> `extensions/invoice-download/src/config.js`. Elle doit rester identique à `SHOPIFY_APP_URL`.
