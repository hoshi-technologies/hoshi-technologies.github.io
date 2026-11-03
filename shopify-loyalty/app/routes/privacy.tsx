import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import styles from "../components/legal.module.css";
import { pickMessages, publicLocale } from "../i18n/i18n.server";
import { isRtl } from "../i18n/config";
import { createFormatters, createTranslator } from "../i18n/translate";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export const meta: MetaFunction = () => [{ title: "Hoshi Club – Privacy policy" }];

export const loader = ({ request }: LoaderFunctionArgs) => {
  const locale = publicLocale(request);
  return {
    locale,
    dir: isRtl(locale) ? "rtl" : "ltr",
    messages: pickMessages(locale, ["legal"]),
    email: process.env.SUPPORT_EMAIL || "hoshi.technologies@gmail.com",
  };
};

const UPDATED = "2026-11-03";

export default function Privacy() {
  const { email, locale, messages } = useLoaderData<typeof loader>();
  const t = createTranslator(messages, locale);
  const updated = createFormatters(locale).date(`${UPDATED}T12:00:00`, { dateStyle: "long" });
  const mail = <a href={`mailto:${email}`}>{email}</a>;

  return (
    <div className={styles.page}>
      <article className={styles.card}>
        <h1>{t("legal.privacy.title")}</h1>
        <p className={styles.muted}>{t("legal.privacy.updated", { date: updated })}</p>
        <p>{t("legal.privacy.intro")}</p>

        <h2>{t("legal.privacy.collectedTitle")}</h2>
        <ul>
          {["store", "members", "referrals", "orders"].map((key) => (
            <li key={key}>
              <strong>{t(`legal.privacy.collected.${key}.label`)}</strong> {t(`legal.privacy.collected.${key}.text`)}
            </li>
          ))}
        </ul>
        <p>{t("legal.privacy.noPayment")}</p>

        <h2>{t("legal.privacy.useTitle")}</h2>
        <p>{t("legal.privacy.use")}</p>

        <h2>{t("legal.privacy.hostingTitle")}</h2>
        <p>{t("legal.privacy.hosting")}</p>

        <h2>{t("legal.privacy.retentionTitle")}</h2>
        <ul>
          {["installed", "customerRedact", "shopRedact", "merchant"].map((key) => (
            <li key={key}>{t(`legal.privacy.retention.${key}`)}</li>
          ))}
        </ul>

        <h2>{t("legal.privacy.rightsTitle")}</h2>
        <p>{t("legal.privacy.rights")}</p>

        <h2>{t("legal.privacy.contactTitle")}</h2>
        <p>
          {t("legal.privacy.contact")} {mail}
        </p>
        <p className={styles.muted}>
          <a href={`/support?lang=${locale}`}>{t("legal.supportLink")}</a>
        </p>
        <LanguageSwitcher locale={locale} label={t("legal.language")} />
      </article>
    </div>
  );
}
