import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import styles from "../components/legal.module.css";
import { pickMessages, publicLocale } from "../i18n/i18n.server";
import { isRtl } from "../i18n/config";
import { createTranslator } from "../i18n/translate";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export const meta: MetaFunction = () => [{ title: "Hoshi Club – Help" }];

export const loader = ({ request }: LoaderFunctionArgs) => {
  const locale = publicLocale(request);
  return {
    locale,
    dir: isRtl(locale) ? "rtl" : "ltr",
    messages: pickMessages(locale, ["legal"]),
    email: process.env.SUPPORT_EMAIL || "hoshi.technologies@gmail.com",
  };
};

const FAQ = ["widget", "points", "tierDiscounts", "assignTier", "referrals", "languages", "uninstall"];

export default function Support() {
  const { email, locale, messages } = useLoaderData<typeof loader>();
  const t = createTranslator(messages, locale);
  return (
    <div className={styles.page}>
      <article className={styles.card}>
        <h1>{t("legal.support.title")}</h1>
        <p>
          {t("legal.support.intro")} <a href={`mailto:${email}`}>{email}</a>
        </p>
        <h2>{t("legal.support.faqTitle")}</h2>
        {FAQ.map((key) => (
          <p key={key}>
            <strong>{t(`legal.support.faq.${key}.q`)}</strong>
            <br />
            {t(`legal.support.faq.${key}.a`)}
          </p>
        ))}
        <p className={styles.muted}>
          <a href={`/privacy?lang=${locale}`}>{t("legal.privacyLink")}</a>
        </p>
        <LanguageSwitcher locale={locale} label={t("legal.language")} />
      </article>
    </div>
  );
}
