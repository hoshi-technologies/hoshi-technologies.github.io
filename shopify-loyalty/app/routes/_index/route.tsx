import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { pickMessages, publicLocale } from "../../i18n/i18n.server";
import { isRtl } from "../../i18n/config";
import { createFormatters, createTranslator } from "../../i18n/translate";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { PRICING } from "../../pricing";
import styles from "./styles.module.css";

export const meta: MetaFunction = () => [{ title: "Hoshi Club – Loyalty & Rewards for Shopify" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  const locale = publicLocale(request);
  return {
    locale,
    dir: isRtl(locale) ? "rtl" : "ltr",
    messages: pickMessages(locale, ["landing", "legal"]),
    // Sur l'App Store, l'installation se fait depuis la fiche de l'app :
    // le formulaire de connexion n'est affiché qu'en développement.
    showForm: Boolean(login) && process.env.SHOW_LOGIN_FORM === "true",
  };
};

export default function Landing() {
  const { showForm, locale, messages } = useLoaderData<typeof loader>();
  const t = createTranslator(messages, locale);
  const price = createFormatters(locale, PRICING.currency).money(PRICING.amount);
  const features = ["points", "tiers", "referrals", "widget", "languages"];

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <span className={styles.logo}>★</span>
        <h1 className={styles.heading}>Hoshi Club</h1>
        <p className={styles.text}>{t("landing.tagline")}</p>
        <p className={styles.price}>{t("landing.pricing", { price, days: PRICING.trialDays })}</p>
        {showForm ? (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>{t("landing.shopDomain")}</span>
              <input className={styles.input} type="text" name="shop" placeholder="my-shop.myshopify.com" dir="ltr" />
            </label>
            <button className={styles.button} type="submit">
              {t("landing.install")}
            </button>
          </Form>
        ) : (
          <p className={styles.text}>{t("landing.installFromStore")}</p>
        )}
        <ul className={styles.list}>
          {features.map((key) => (
            <li key={key}>
              <strong>{t(`landing.features.${key}.title`)}</strong> {t(`landing.features.${key}.text`)}
            </li>
          ))}
        </ul>
        <p className={styles.footer}>
          <a href={`/privacy?lang=${locale}`}>{t("legal.privacyLink")}</a> ·{" "}
          <a href={`/support?lang=${locale}`}>{t("legal.supportLink")}</a>
        </p>
        <LanguageSwitcher locale={locale} label={t("legal.language")} />
      </div>
    </div>
  );
}
