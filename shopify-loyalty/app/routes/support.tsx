import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import styles from "../components/legal.module.css";

export const meta: MetaFunction = () => [{ title: "Aide – Hoshi Fidélité" }];

export const loader = () => ({ email: process.env.SUPPORT_EMAIL || "support@example.com" });

const FAQ = [
  {
    q: "Comment afficher le programme sur ma boutique ?",
    a: "Dans Shopify : Boutique en ligne → Thèmes → Personnaliser → Intégrations d'applications, puis activez « Fidélité Hoshi ». Le tableau de bord de l'application contient un lien direct.",
  },
  {
    q: "Quand mes clients reçoivent-ils leurs points ?",
    a: "Automatiquement dès que la commande est payée. Les points sont retirés en cas de remboursement.",
  },
  {
    q: "Comment fonctionnent les remises des niveaux ?",
    a: "Chaque niveau pose une étiquette sur le client et crée une remise automatique Shopify réservée aux clients de ce niveau. Elle s'applique au paiement, sans code. Les remises sont visibles dans Shopify → Réductions.",
  },
  {
    q: "Puis-je attribuer un niveau à un client précis ?",
    a: "Oui : page Membres → Ajouter un client, ou depuis la fiche d'un membre (section « Niveau du client »).",
  },
  {
    q: "Comment fonctionne le parrainage ?",
    a: "Chaque membre a un lien personnel. L'ami invité saisit son e-mail et reçoit un code de bienvenue ; le parrain gagne des points quand ce code est utilisé dans une commande payée.",
  },
  {
    q: "Que se passe-t-il si je désinstalle l'application ?",
    a: "Les remises automatiques restent dans Shopify jusqu'à ce que vous les supprimiez. Les données du programme sont effacées 48 heures après la désinstallation.",
  },
];

export default function Support() {
  const { email } = useLoaderData<typeof loader>();
  return (
    <div className={styles.page}>
      <article className={styles.card}>
        <h1>Aide et contact</h1>
        <p>
          Une question, un problème ? Écrivez-nous à <a href={`mailto:${email}`}>{email}</a> : nous
          répondons sous 2 jours ouvrés.
        </p>
        <h2>Questions fréquentes</h2>
        {FAQ.map((item) => (
          <div key={item.q}>
            <p>
              <strong>{item.q}</strong>
              <br />
              {item.a}
            </p>
          </div>
        ))}
        <p className={styles.muted}>
          <a href="/privacy">Politique de confidentialité</a>
        </p>
      </article>
    </div>
  );
}
