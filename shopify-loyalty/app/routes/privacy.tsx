import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import styles from "../components/legal.module.css";

export const meta: MetaFunction = () => [{ title: "Politique de confidentialité – Hoshi Fidélité" }];

export const loader = () => ({
  email: process.env.SUPPORT_EMAIL || "support@example.com",
  updated: "2 novembre 2026",
});

export default function Privacy() {
  const { email, updated } = useLoaderData<typeof loader>();
  return (
    <div className={styles.page}>
      <article className={styles.card}>
        <h1>Politique de confidentialité</h1>
        <p className={styles.muted}>Hoshi Fidélité, édité par Hoshi Technologies. Mise à jour : {updated}.</p>

        <p>
          Hoshi Fidélité (« l'application ») permet aux marchands Shopify de proposer un programme de
          fidélité à leurs clients. Cette politique explique quelles données l'application traite,
          pourquoi et comment.
        </p>

        <h2>Données collectées</h2>
        <ul>
          <li>
            <strong>Données de la boutique</strong> : domaine de la boutique et jetons d'accès fournis
            par Shopify lors de l'installation.
          </li>
          <li>
            <strong>Données des clients membres</strong> : identifiant client Shopify, prénom, nom,
            adresse e-mail, nombre de commandes, solde et historique de points, niveau de fidélité,
            codes de réduction obtenus, date d'anniversaire (jour et mois, si le client la renseigne),
            code de parrainage.
          </li>
          <li>
            <strong>Données de parrainage</strong> : adresse e-mail saisie par la personne invitée pour
            recevoir son code de bienvenue.
          </li>
          <li>
            <strong>Données de commande</strong> : identifiant, sous-total et total des commandes
            payées, codes de réduction utilisés, uniquement pour calculer les points.
          </li>
        </ul>
        <p>L'application ne collecte aucune donnée de paiement et n'utilise pas de cookies publicitaires.</p>

        <h2>Utilisation des données</h2>
        <p>
          Les données servent exclusivement à faire fonctionner le programme de fidélité de la
          boutique : calculer et afficher les points, attribuer les niveaux et leurs avantages, créer
          les codes de réduction, gérer le parrainage et afficher les statistiques au marchand. Elles
          ne sont ni vendues, ni louées, ni partagées avec des tiers à des fins commerciales.
        </p>

        <h2>Hébergement et sous-traitants</h2>
        <p>
          Les données sont hébergées par Cloudflare (Cloudflare Workers et D1). Shopify fournit les
          données de la boutique et des clients via ses API. Ces prestataires agissent comme
          sous-traitants et appliquent leurs propres garanties de sécurité.
        </p>

        <h2>Conservation et suppression</h2>
        <ul>
          <li>Les données sont conservées tant que l'application est installée.</li>
          <li>
            À la demande d'un client (via Shopify), ses données sont supprimées automatiquement
            (webhook <code>customers/redact</code>).
          </li>
          <li>
            48 heures après la désinstallation, Shopify demande la suppression des données de la
            boutique ; toutes ses données sont alors effacées (webhook <code>shop/redact</code>).
          </li>
          <li>
            Le marchand peut retirer à tout moment un client du programme depuis l'application.
          </li>
        </ul>

        <h2>Vos droits</h2>
        <p>
          Conformément au RGPD, les clients disposent d'un droit d'accès, de rectification,
          d'effacement et d'opposition. Ils peuvent l'exercer auprès de la boutique concernée
          (responsable du traitement) ou en nous écrivant. Les demandes d'accès transmises par Shopify
          (webhook <code>customers/data_request</code>) sont traitées.
        </p>

        <h2>Contact</h2>
        <p>
          Pour toute question : <a href={`mailto:${email}`}>{email}</a>.
        </p>

        <hr />
        <h2>Privacy policy (summary in English)</h2>
        <p>
          Hoshi Fidélité processes store data and loyalty-member data (Shopify customer ID, name,
          email, order count, points balance and history, tier, discount codes, optional birthday,
          referral code and referred friends' emails) solely to operate the merchant's loyalty
          program. Data is hosted on Cloudflare, never sold or shared for marketing, and deleted on
          Shopify's GDPR redaction requests and 48 hours after uninstall. Contact:{" "}
          <a href={`mailto:${email}`}>{email}</a>.
        </p>
      </article>
    </div>
  );
}
