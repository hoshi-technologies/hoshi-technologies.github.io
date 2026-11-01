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
  const url = (v: unknown) => {
    const s = String(v || "").trim();
    if (!s) return null;
    const withProtocol = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    try {
      return new URL(withProtocol).toString();
    } catch {
      return null;
    }
  };
  // Dates « AAAA-MM-JJ » ; la date de fin couvre toute la journée.
  const date = (v: unknown, endOfDay = false) => {
    const s = String(v || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  };
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
      birthdayPoints: Math.round(num(data.birthdayPoints)),
      referralEnabled: Boolean(data.referralEnabled),
      referrerPoints: Math.round(num(data.referrerPoints)),
      friendRewardType: ["AMOUNT", "PERCENT", "FREE_SHIPPING"].includes(data.friendRewardType)
        ? data.friendRewardType
        : "AMOUNT",
      friendRewardValue: Math.min(data.friendRewardType === "PERCENT" ? 100 : 100000, num(data.friendRewardValue)),
      friendMinSubtotal: num(data.friendMinSubtotal) > 0 ? num(data.friendMinSubtotal) : null,
      socialPoints: Math.round(num(data.socialPoints)),
      instagramUrl: url(data.instagramUrl),
      facebookUrl: url(data.facebookUrl),
      tiktokUrl: url(data.tiktokUrl),
      bonusMultiplier: Math.min(10, Math.max(1, num(data.bonusMultiplier, 1))),
      bonusStartsAt: date(data.bonusStartsAt),
      bonusEndsAt: date(data.bonusEndsAt, true),
      bonusLabel: String(data.bonusLabel || "").trim().slice(0, 60) || null,
      expirationMonths: Math.round(num(data.expirationMonths)),
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
    birthdayPoints: String(program.birthdayPoints),
    referralEnabled: program.referralEnabled,
    referrerPoints: String(program.referrerPoints),
    friendRewardType: program.friendRewardType,
    friendRewardValue: String(program.friendRewardValue),
    friendMinSubtotal: program.friendMinSubtotal ? String(program.friendMinSubtotal) : "",
    socialPoints: String(program.socialPoints),
    instagramUrl: program.instagramUrl ?? "",
    facebookUrl: program.facebookUrl ?? "",
    tiktokUrl: program.tiktokUrl ?? "",
    bonusMultiplier: String(program.bonusMultiplier),
    bonusStartsAt: program.bonusStartsAt ? String(program.bonusStartsAt).slice(0, 10) : "",
    bonusEndsAt: program.bonusEndsAt ? String(program.bonusEndsAt).slice(0, 10) : "",
    bonusLabel: program.bonusLabel ?? "",
    expirationMonths: String(program.expirationMonths),
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

      <s-section heading="Anniversaire 🎂">
        <s-number-field
          label="Points offerts le jour de l'anniversaire"
          details="Le client renseigne sa date dans le widget. Pour éviter les abus, la date doit être enregistrée au moins 30 jours avant. 0 = désactivé."
          min={0}
          step={50}
          suffix={form.pointsName}
          value={form.birthdayPoints}
          onChange={(e) => set("birthdayPoints", e.currentTarget.value)}
        />
      </s-section>

      <s-section heading="Parrainage 🤝">
        <s-stack gap="base">
          <s-switch
            label="Activer le parrainage"
            details="Chaque membre a un lien personnel. L'ami reçoit un code de bienvenue ; le parrain gagne des points quand l'ami passe sa première commande."
            checked={form.referralEnabled}
            onChange={(e) => set("referralEnabled", e.currentTarget.checked)}
          />
          {form.referralEnabled && (
            <>
              <s-number-field
                label="Points gagnés par le parrain"
                min={0}
                step={50}
                suffix={form.pointsName}
                value={form.referrerPoints}
                onChange={(e) => set("referrerPoints", e.currentTarget.value)}
              />
              <s-grid gridTemplateColumns="@container (inline-size > 500px) 1fr 1fr 1fr, 1fr" gap="base">
                <s-select
                  label="Cadeau pour l'ami"
                  value={form.friendRewardType}
                  onChange={(e) => set("friendRewardType", e.currentTarget.value)}
                >
                  <s-option value="AMOUNT">Montant fixe</s-option>
                  <s-option value="PERCENT">Pourcentage</s-option>
                  <s-option value="FREE_SHIPPING">Livraison offerte</s-option>
                </s-select>
                {form.friendRewardType !== "FREE_SHIPPING" && (
                  <s-number-field
                    label="Valeur"
                    min={0}
                    suffix={form.friendRewardType === "PERCENT" ? "%" : "€"}
                    value={form.friendRewardValue}
                    onChange={(e) => set("friendRewardValue", e.currentTarget.value)}
                  />
                )}
                <s-number-field
                  label="Dès (facultatif)"
                  min={0}
                  suffix="€ d'achat"
                  value={form.friendMinSubtotal}
                  onChange={(e) => set("friendMinSubtotal", e.currentTarget.value)}
                />
              </s-grid>
            </>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Réseaux sociaux 📣">
        <s-stack gap="base">
          <s-paragraph>
            Renseignez vos pages : le widget proposera de vous suivre en échange de {form.pointsName} (une fois par réseau).
          </s-paragraph>
          <s-number-field
            label="Points par réseau suivi"
            min={0}
            step={10}
            suffix={form.pointsName}
            value={form.socialPoints}
            onChange={(e) => set("socialPoints", e.currentTarget.value)}
          />
          <s-text-field label="Instagram" placeholder="https://instagram.com/maboutique" value={form.instagramUrl} onChange={(e) => set("instagramUrl", e.currentTarget.value)} />
          <s-text-field label="Facebook" placeholder="https://facebook.com/maboutique" value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.currentTarget.value)} />
          <s-text-field label="TikTok" placeholder="https://tiktok.com/@maboutique" value={form.tiktokUrl} onChange={(e) => set("tiktokUrl", e.currentTarget.value)} />
        </s-stack>
      </s-section>

      <s-section heading="Campagne de points bonus 🔥">
        <s-stack gap="base">
          <s-paragraph>
            Multipliez les {form.pointsName} gagnés sur une période (soldes, fêtes, lancement…). Un bandeau
            s'affiche dans le widget pendant la campagne.
          </s-paragraph>
          <s-select
            label="Multiplicateur"
            value={form.bonusMultiplier}
            onChange={(e) => set("bonusMultiplier", e.currentTarget.value)}
          >
            <s-option value="1">Aucune campagne</s-option>
            <s-option value="1.5">Points ×1,5</s-option>
            <s-option value="2">Points ×2</s-option>
            <s-option value="3">Points ×3</s-option>
          </s-select>
          {Number(form.bonusMultiplier) > 1 && (
            <>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-date-field
                  label="Début (facultatif)"
                  value={form.bonusStartsAt}
                  onChange={(e) => set("bonusStartsAt", e.currentTarget.value)}
                />
                <s-date-field
                  label="Fin (facultatif)"
                  value={form.bonusEndsAt}
                  onChange={(e) => set("bonusEndsAt", e.currentTarget.value)}
                />
              </s-grid>
              <s-text-field
                label="Message affiché"
                placeholder={`Black Friday : ${form.pointsName} ×${form.bonusMultiplier} !`}
                value={form.bonusLabel}
                onChange={(e) => set("bonusLabel", e.currentTarget.value)}
              />
            </>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Expiration des points ⏳">
        <s-select
          label="Les points expirent après"
          details="Chaque achat, échange ou gain de points repousse la date. Une date d'expiration incite les clients à revenir."
          value={form.expirationMonths}
          onChange={(e) => set("expirationMonths", e.currentTarget.value)}
        >
          <s-option value="0">Jamais</s-option>
          <s-option value="6">6 mois sans activité</s-option>
          <s-option value="12">12 mois sans activité</s-option>
          <s-option value="18">18 mois sans activité</s-option>
          <s-option value="24">24 mois sans activité</s-option>
        </s-select>
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
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>Niveau Argent ★</div>
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
