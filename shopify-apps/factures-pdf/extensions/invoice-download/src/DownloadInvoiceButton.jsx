/** @jsxImportSource preact */
// Bouton du menu d'actions d'une commande (espace client) : ouvre la facture PDF.
// Le serveur vérifie le jeton de session du client et ne renvoie le lien que si la commande lui
// appartient. Sans facture (pas encore émise, quota atteint…), aucun bouton n'est affiché.
// Fonctionne aussi sans compte client créé : depuis le lien « Voir ma commande » de l'e-mail.
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { APP_URL } from './config.js';

export default async () => {
  const invoice = await findInvoice();
  render(<DownloadInvoiceButton invoice={invoice} />, document.body);
};

async function findInvoice() {
  try {
    const token = await shopify.sessionToken.get();
    const response = await fetch(`${APP_URL}/customer-api/invoice?order=${encodeURIComponent(shopify.orderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.ready ? data : null;
  } catch (error) {
    console.warn('Hoshi Factures : facture indisponible', error);
    return null;
  }
}

function DownloadInvoiceButton({ invoice }) {
  if (!invoice) return null;
  const label = shopify.i18n.translate('download');
  if (invoice.url) {
    return (
      <s-button href={invoice.url} target="_blank">
        {label}
      </s-button>
    );
  }
  // Page ouverte depuis l'e-mail de confirmation, sans connexion : Shopify demande au client un
  // code reçu par e-mail (pas de mot de passe), puis le ramène sur sa commande avec le lien.
  if (shopify.authenticationState?.value !== 'pre_authenticated') return null;
  return <s-button onClick={() => shopify.requireLogin()}>{label}</s-button>;
}
