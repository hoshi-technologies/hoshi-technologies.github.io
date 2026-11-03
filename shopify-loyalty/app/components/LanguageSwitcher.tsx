import { LOCALES } from "../i18n/config";

/** Sélecteur de langue des pages publiques (recharge la page avec « ?lang= »). */
export function LanguageSwitcher({ locale, label }: { locale: string; label: string }) {
  return (
    <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: "0.9rem" }}>
      <span aria-hidden="true">🌐</span>
      <span className="visually-hidden" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {label}
      </span>
      <select
        value={locale}
        aria-label={label}
        onChange={(e) => {
          const url = new URL(window.location.href);
          url.searchParams.set("lang", e.currentTarget.value);
          window.location.href = url.toString();
        }}
        style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #c9cce6", font: "inherit", background: "#fff" }}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
