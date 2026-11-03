import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Messages } from "./translate";
import { createFormatters, createTranslator } from "./translate";

interface I18nValue {
  locale: string;
  messages: Messages;
  currency: string;
}

const I18nContext = createContext<I18nValue>({ locale: "en", messages: {}, currency: "USD" });

export function I18nProvider({ children, ...value }: I18nValue & { children: ReactNode }) {
  const memo = useMemo(() => value, [value.locale, value.messages, value.currency]); // eslint-disable-line react-hooks/exhaustive-deps
  return <I18nContext.Provider value={memo}>{children}</I18nContext.Provider>;
}

/** Traduction et formats de la langue de l'administrateur. */
export function useI18n() {
  const { locale, messages, currency } = useContext(I18nContext);
  return useMemo(() => {
    const t = createTranslator(messages, locale);
    return { t, locale, currency, ...createFormatters(locale, currency) };
  }, [locale, messages, currency]);
}

/** Message renvoyé par une action serveur : clé de traduction + paramètres. */
export interface UiMessage {
  key: string;
  params?: Record<string, string | number | undefined>;
}
