// Bloc « Télécharger ma facture » de la page de commande. Le lien est enregistré sur la commande
// par l'appli (champ $app.invoice_url) dès que la facture est créée ; sans facture, rien ne
// s'affiche. Pas d'appel réseau ni de connexion : Shopify ne fournit ce champ qu'à la personne
// qui consulte la commande.
import '@shopify/ui-extensions/preact';
import { render } from 'preact';

export default async () => {
  render(<DownloadInvoiceBlock />, document.body);
};

function DownloadInvoiceBlock() {
  const entry = (shopify.appMetafields.value ?? []).find(
    (item) => item.target?.type === 'order' && item.metafield?.key === 'invoice_url',
  );
  const url = entry?.metafield?.value;
  if (!url) return null;
  const { translate } = shopify.i18n;
  return (
    <s-section heading={translate('title')}>
      <s-button href={url} target="_blank">
        {translate('download')}
      </s-button>
    </s-section>
  );
}
