import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getProgram } from "../loyalty.server";
import { useActionToast } from "../components/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const program = await getProgram(session.shop);
  const rewards = await db.reward.findMany({
    where: { shop: session.shop, active: true },
    orderBy: { pointsCost: "asc" },
    take: 3,
  });
  return { program, rewards };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const data = await request.json();
  const num = (v: unknown, min = 0) => Math.max(min, Number(v) || 0);
  const color = /^#[0-9a-f]{6}$/i.test(String(data.widgetColor))
    ? String(data.widgetColor)
    : "#5C6AC4";

  await getProgram(session.shop);
  await db.program.update({
    where: { shop: session.shop },
    data: {
      enabled: Boolean(data.enabled),
      pointsName: String(data.pointsName || "points").slice(0, 30),
      pointsPerUnit: num(data.pointsPerUnit),
      signupPoints: Math.round(num(data.signupPoints)),
      firstOrderPoints: Math.round(num(data.firstOrderPoints)),
      widgetTitle: String(data.widgetTitle || "Mes récompenses").slice(0, 60),
      widgetColor: color,
      widgetPosition: data.widgetPosition === "left" ? "left" : "right",
    },
  });
  return { ok: true, message: "Réglages enregistrés" };
};

const PRESET_COLORS = ["#5C6AC4", "#E4572E", "#29845A", "#D4A017", "#C2185B", "#1F2140"];

export default function ProgramSettings() {
  const { program, rewards } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);

  const [form, setForm] = useState({
    enabled: program.enabled,
    pointsName: program.pointsName,
    pointsPerUnit: String(program.pointsPerUnit),
    signupPoints: String(program.signupPoints),
    firstOrderPoints: String(program.firstOrderPoints),
    widgetTitle: program.widgetTitle,
    widgetColor: program.widgetColor,
    widgetPosition: program.widgetPosition,
  });
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const saving = fetcher.state !== "idle";
  const save = () =>
    fetcher.submit(form, { method: "POST", encType: "application/json" });

  const example = Math.floor(50 * (Number(form.pointsPerUnit) || 0));

  return (
    <s-page heading="Réglages du programme">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={save}
        {...(saving ? { loading: true } : {})}
      >
        Enregistrer
      </s-button>

      <s-section heading="Statut">
        <s-switch
          label="Programme de fidélité actif"
          details="Désactivez-le pour mettre le programme en pause sans perdre les points de vos clients."
          checked={form.enabled}
          onChange={(e) => set("enabled", e.currentTarget.checked)}
        />
      </s-section>

      <s-section heading="Gagner des points">
        <s-stack gap="base">
          <s-text-field
            label="Nom des points"
            details="Ex. : points, étoiles, coins…"
            value={form.pointsName}
            onChange={(e) => set("pointsName", e.currentTarget.value)}
          />
          <s-number-field
            label="Points par euro dépensé"
            details={`Exemple : une commande de 50 € rapporte ${example} ${form.pointsName} (avant multiplicateur VIP).`}
            min={0}
            step={0.5}
            value={form.pointsPerUnit}
            onChange={(e) => set("pointsPerUnit", e.currentTarget.value)}
          />
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-number-field
              label="Bonus de bienvenue"
              details="Offert à la création du compte client."
              min={0}
              suffix={form.pointsName}
              value={form.signupPoints}
              onChange={(e) => set("signupPoints", e.currentTarget.value)}
            />
            <s-number-field
              label="Bonus première commande"
              details="En plus des points de la commande."
              min={0}
              suffix={form.pointsName}
              value={form.firstOrderPoints}
              onChange={(e) => set("firstOrderPoints", e.currentTarget.value)}
            />
          </s-grid>
        </s-stack>
      </s-section>

      <s-section heading="Apparence du widget">
        <s-stack gap="base">
          <s-text-field
            label="Titre du widget"
            value={form.widgetTitle}
            onChange={(e) => set("widgetTitle", e.currentTarget.value)}
          />
          <s-stack gap="small-200">
            <s-text>Couleur principale</s-text>
            <s-stack direction="inline" gap="small" alignItems="center">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Couleur ${c}`}
                  onClick={() => set("widgetColor", c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "none",
                    cursor: "pointer",
                    background: c,
                    outline:
                      form.widgetColor.toLowerCase() === c.toLowerCase()
                        ? "3px solid #303030"
                        : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
              <s-color-field
                label="Couleur personnalisée"
                labelAccessibilityVisibility="exclusive"
                value={form.widgetColor}
                onChange={(e) => set("widgetColor", e.currentTarget.value)}
              />
            </s-stack>
          </s-stack>
          <s-select
            label="Position du bouton"
            value={form.widgetPosition}
            onChange={(e) => set("widgetPosition", e.currentTarget.value)}
          >
            <s-option value="right">En bas à droite</s-option>
            <s-option value="left">En bas à gauche</s-option>
          </s-select>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Aperçu">
        <WidgetPreview
          title={form.widgetTitle}
          color={form.widgetColor}
          position={form.widgetPosition}
          pointsName={form.pointsName}
          rewards={rewards.map((r) => ({ title: r.title, cost: r.pointsCost }))}
        />
      </s-section>
    </s-page>
  );
}

function WidgetPreview({
  title,
  color,
  position,
  pointsName,
  rewards,
}: {
  title: string;
  color: string;
  position: string;
  pointsName: string;
  rewards: { title: string; cost: number }[];
}) {
  const balance = 640;
  return (
    <div
      style={{
        position: "relative",
        background: "repeating-linear-gradient(45deg,#f6f6f7,#f6f6f7 10px,#efeff1 10px,#efeff1 20px)",
        borderRadius: 12,
        height: 440,
        overflow: "hidden",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: 76,
          [position === "left" ? "left" : "right"]: 12,
          width: "calc(100% - 24px)",
          maxWidth: 280,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div style={{ background: color, color: "#fff", padding: "16px 18px" }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>{title}</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>
            {balance} <span style={{ fontSize: 14, fontWeight: 500 }}>{pointsName}</span>
          </div>
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>Palier Argent ★</div>
        </div>
        <div style={{ padding: 12, display: "grid", gap: 8 }}>
          {(rewards.length ? rewards : [{ title: "5 € de réduction", cost: 500 }]).map((r) => (
            <div
              key={r.title}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid #ececec",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 13,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{r.title}</div>
                <div style={{ color: "#6d7175", fontSize: 12 }}>
                  {r.cost} {pointsName}
                </div>
              </div>
              <span
                style={{
                  background: balance >= r.cost ? color : "#e3e3e3",
                  color: balance >= r.cost ? "#fff" : "#8a8a8a",
                  borderRadius: 8,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Obtenir
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 16,
          [position === "left" ? "left" : "right"]: 16,
          background: color,
          color: "#fff",
          borderRadius: 999,
          padding: "12px 18px",
          fontWeight: 600,
          fontSize: 14,
          boxShadow: "0 6px 18px rgba(0,0,0,0.2)",
        }}
      >
        ★ {title}
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
