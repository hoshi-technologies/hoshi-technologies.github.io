import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

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
          {typeof value === "number" ? formatNumber(value) : value}
        </span>
        {hint && (
          <s-text color="subdued">
            {hint}
          </s-text>
        )}
      </s-stack>
    </s-box>
  );
}

/** Pastille de couleur (palier, couleur du widget...). */
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

export function formatNumber(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

export function formatDate(d: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

export function memberName(m: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const name = [m.firstName, m.lastName].filter(Boolean).join(" ");
  return name || m.email || "Client anonyme";
}

const TX_LABELS: Record<string, { label: string; tone: "success" | "info" | "critical" | "neutral" | "caution" }> = {
  SIGNUP: { label: "Bienvenue", tone: "info" },
  ORDER: { label: "Commande", tone: "success" },
  FIRST_ORDER: { label: "1re commande", tone: "success" },
  REDEEM: { label: "Échange", tone: "caution" },
  REFUND: { label: "Remboursement", tone: "critical" },
  ADJUST: { label: "Ajustement", tone: "neutral" },
};

export function TransactionBadge({ type }: { type: string }) {
  const t = TX_LABELS[type] ?? { label: type, tone: "neutral" as const };
  return <s-badge tone={t.tone}>{t.label}</s-badge>;
}

export function PointsDelta({ points }: { points: number }) {
  return (
    <s-text tone={points >= 0 ? "success" : "critical"} type="strong">
      {points >= 0 ? "+" : ""}
      {formatNumber(points)}
    </s-text>
  );
}

/** Affiche un toast App Bridge quand une action renvoie un message. */
export function useActionToast(
  data: { ok?: boolean; message?: string; error?: string } | undefined,
) {
  const shopify = useAppBridge();
  useEffect(() => {
    if (!data) return;
    if (data.error) shopify.toast.show(data.error, { isError: true });
    else if (data.message) shopify.toast.show(data.message);
  }, [data, shopify]);
}
