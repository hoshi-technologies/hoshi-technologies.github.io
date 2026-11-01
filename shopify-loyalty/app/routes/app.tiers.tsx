import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getProgram, getTiers, tierFor } from "../loyalty.server";
import { ColorDot, formatNumber, useActionToast } from "../components/ui";
import { hideModal, showModal } from "../components/modal";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const program = await getProgram(shop);
  const [tiers, members] = await Promise.all([
    getTiers(shop),
    db.member.findMany({ where: { shop }, select: { lifetimePoints: true } }),
  ]);
  const counts: Record<string, number> = {};
  for (const m of members) {
    const t = tierFor(tiers, m.lifetimePoints);
    if (t) counts[t.id] = (counts[t.id] ?? 0) + 1;
  }
  return { tiers, counts, pointsName: program.pointsName };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const data = await request.json();

  if (data.intent === "delete") {
    await db.tier.deleteMany({ where: { id: String(data.id), shop } });
    return { ok: true, message: "Palier supprimé" };
  }

  const name = String(data.name || "").trim().slice(0, 40);
  const minPoints = Math.max(0, Math.round(Number(data.minPoints) || 0));
  const multiplier = Math.min(10, Math.max(1, Number(data.multiplier) || 1));
  const color = /^#[0-9a-f]{6}$/i.test(String(data.color)) ? String(data.color) : "#B08D57";
  if (!name) return { error: "Donnez un nom au palier" };

  if (data.id) {
    await db.tier.updateMany({ where: { id: String(data.id), shop }, data: { name, minPoints, multiplier, color } });
    return { ok: true, message: "Palier mis à jour", saved: true };
  }
  await db.tier.create({ data: { shop, name, minPoints, multiplier, color } });
  return { ok: true, message: "Palier créé", saved: true };
};

type FormState = { id?: string; name: string; minPoints: string; multiplier: string; color: string };
const EMPTY: FormState = { name: "", minPoints: "1000", multiplier: "1.25", color: "#7C3AED" };
const PRESETS = ["#B08D57", "#9CA3AF", "#D4A017", "#7C3AED", "#0EA5E9", "#111827"];

export default function Tiers() {
  const { tiers, counts, pointsName } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const rowFetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);
  useActionToast(rowFetcher.data);
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "saved" in fetcher.data) hideModal("tier-modal");
  }, [fetcher.state, fetcher.data]);

  const open = (t?: (typeof tiers)[number]) => {
    setForm(
      t
        ? { id: t.id, name: t.name, minPoints: String(t.minPoints), multiplier: String(t.multiplier), color: t.color }
        : EMPTY,
    );
    showModal("tier-modal");
  };

  return (
    <s-page heading="Paliers VIP">
      <s-button slot="primary-action" variant="primary" onClick={() => open()}>
        Nouveau palier
      </s-button>

      <s-section>
        <s-paragraph>
          Les clients montent de palier en cumulant des {pointsName} (les
          échanges ne font pas redescendre). Chaque palier multiplie les{" "}
          {pointsName} gagnés sur les commandes.
        </s-paragraph>
      </s-section>

      {tiers.length === 0 ? (
        <s-section>
          <s-stack gap="base" alignItems="center" padding="large">
            <span style={{ fontSize: 44 }} aria-hidden="true">🏆</span>
            <s-heading>Aucun palier</s-heading>
            <s-text color="subdued">Les paliers sont facultatifs mais motivent vos clients fidèles.</s-text>
            <s-button variant="primary" onClick={() => open()}>Créer un palier</s-button>
          </s-stack>
        </s-section>
      ) : (
        <s-grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr, 1fr" gap="base">
          {tiers.map((t, i) => (
            <div
              key={t.id}
              style={{
                background: "#fff",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 1px 0 rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}cc)`, color: "#fff", padding: "18px 18px 14px" }}>
                <div style={{ fontSize: 12, opacity: 0.85 }}>Niveau {i + 1}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>★ {t.name}</div>
              </div>
              <div style={{ padding: 16 }}>
                <s-stack gap="small">
                  <s-text>
                    Dès <s-text type="strong">{formatNumber(t.minPoints)} {pointsName}</s-text> cumulés
                  </s-text>
                  <s-text>
                    Multiplicateur <s-text type="strong">×{t.multiplier}</s-text>
                  </s-text>
                  <s-text color="subdued">{counts[t.id] ?? 0} membre(s)</s-text>
                  <s-stack direction="inline" gap="small-200">
                    <s-button onClick={() => open(t)}>Modifier</s-button>
                    <s-button
                      variant="tertiary"
                      tone="critical"
                      onClick={() => {
                        if (confirm(`Supprimer le palier « ${t.name} » ?`))
                          rowFetcher.submit({ intent: "delete", id: t.id }, { method: "POST", encType: "application/json" });
                      }}
                    >
                      Supprimer
                    </s-button>
                  </s-stack>
                </s-stack>
              </div>
            </div>
          ))}
        </s-grid>
      )}

      <s-modal id="tier-modal" heading={form.id ? "Modifier le palier" : "Nouveau palier"}>
        <s-stack gap="base">
          <s-text-field label="Nom" placeholder="Ex. : Platine" value={form.name} onChange={(e) => set("name", e.currentTarget.value)} />
          <s-number-field
            label="Points cumulés nécessaires"
            suffix={pointsName}
            min={0}
            step={100}
            value={form.minPoints}
            onChange={(e) => set("minPoints", e.currentTarget.value)}
          />
          <s-number-field
            label="Multiplicateur de points"
            details="1 = normal, 1.5 = 50 % de points en plus sur chaque commande."
            prefix="×"
            min={1}
            max={10}
            step={0.25}
            value={form.multiplier}
            onChange={(e) => set("multiplier", e.currentTarget.value)}
          />
          <s-stack gap="small-200">
            <s-text>Couleur</s-text>
            <s-stack direction="inline" gap="small" alignItems="center">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Couleur ${c}`}
                  onClick={() => set("color", c)}
                  style={{
                    border: "none",
                    background: "none",
                    padding: 2,
                    cursor: "pointer",
                    borderRadius: "50%",
                    outline: form.color.toLowerCase() === c.toLowerCase() ? "2px solid #303030" : "none",
                  }}
                >
                  <ColorDot color={c} size={26} />
                </button>
              ))}
            </s-stack>
          </s-stack>
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={() => fetcher.submit({ intent: "save", ...form }, { method: "POST", encType: "application/json" })}
          {...(fetcher.state !== "idle" ? { loading: true } : {})}
        >
          Enregistrer
        </s-button>
        <s-button slot="secondary-actions" commandFor="tier-modal" command="--hide">
          Annuler
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
