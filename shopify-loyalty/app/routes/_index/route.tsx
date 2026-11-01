import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

export default function Landing() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <span className={styles.logo}>★</span>
        <h1 className={styles.heading}>Hoshi Fidélité</h1>
        <p className={styles.text}>
          Le programme de fidélité le plus simple pour votre boutique Shopify :
          points, niveaux clients avec remises automatiques et récompenses en quelques clics.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Domaine de la boutique</span>
              <input className={styles.input} type="text" name="shop" placeholder="ma-boutique.myshopify.com" />
            </label>
            <button className={styles.button} type="submit">
              Installer
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Points automatiques.</strong> Vos clients gagnent des points à
            chaque commande, sans aucune configuration technique.
          </li>
          <li>
            <strong>Niveaux clients.</strong> Bronze, Argent, Or ou niveaux sur invitation, avec remises automatiques et
            multiplicateurs de points pour vos meilleurs clients.
          </li>
          <li>
            <strong>Widget élégant.</strong> Un bouton flottant aux couleurs de
            votre boutique pour consulter et échanger ses points.
          </li>
        </ul>
      </div>
    </div>
  );
}
