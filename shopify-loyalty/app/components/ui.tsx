import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useI18n, type UiMessage } from "../i18n/react";
import { describeTransaction } from "../labels";

/** Petite carte de statistique pour le tableau de bord. */
export function StatCard({
  label,
  value,
  hint,
  emoji,
}: {
  label: string;
  value: string | number;
  hint?: string;
  emoji: string;
}) {
  const { number } = useI18n();
  return (
    <s-box padding="base" background="base" borderRadius="large" border="base">
      <s-stack gap="small-200">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <span style={{ fontSize: 20 }} aria-hidden="true">
            {emoji}
          </span>
          <s-text color="subdued">{label}</s-text>
        </s-stack>
        <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
          {typeof value === "number" ? number(value) : value}
        </span>
        {hint && <s-text color="subdued">{hint}</s-text>}
      </s-stack>
    </s-box>
  );
}

/** Pastille de couleur (niveau, couleur du widget...). */
export function ColorDot({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        boxShadow: "0 0 0 2px rgba(0,0,0,0.06)",
        flexShrink: 0,
      }}
    />
  );
}

/** Nom affiché d'un membre (nom, sinon e-mail). */
export function useMemberName() {
  const { t } = useI18n();
  return (m: { firstName?: string | null; lastName?: string | null; email?: string | null }) =>
    [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || t("common.anonymousCustomer");
}

const TX_TONES: Record<string, "success" | "info" | "critical" | "neutral" | "caution"> = {
  SIGNUP: "info",
  ORDER: "success",
  FIRST_ORDER: "success",
  REDEEM: "caution",
  REFUND: "critical",
  ADJUST: "neutral",
  BIRTHDAY: "info",
  REFERRAL: "success",
  SOCIAL: "info",
  EXPIRE: "critical",
};

export function TransactionBadge({ type }: { type: string }) {
  const { t } = useI18n();
  return <s-badge tone={TX_TONES[type] ?? "neutral"}>{t(`tx.type.${type}`)}</s-badge>;
}

export function TransactionDetail({ tx }: { tx: { type: string; description: string } }) {
  const { t, locale } = useI18n();
  return <>{describeTransaction(tx, t, locale)}</>;
}

export function PointsDelta({ points }: { points: number }) {
  const { number } = useI18n();
  return (
    <s-text tone={points >= 0 ? "success" : "critical"} type="strong">
      {points >= 0 ? "+" : ""}
      {number(points)}
    </s-text>
  );
}

/** Résultat d'une action serveur : message de succès ou d'erreur à traduire. */
export type ActionResult = { ok?: boolean; message?: UiMessage; error?: UiMessage };

/** Affiche un toast App Bridge quand une action renvoie un message. */
export function useActionToast(data: ActionResult | undefined) {
  const shopify = useAppBridge();
  const { t } = useI18n();
  useEffect(() => {
    if (!data) return;
    if (data.error) shopify.toast.show(t(data.error.key, data.error.params), { isError: true });
    else if (data.message) shopify.toast.show(t(data.message.key, data.message.params));
  }, [data, shopify, t]);
}
