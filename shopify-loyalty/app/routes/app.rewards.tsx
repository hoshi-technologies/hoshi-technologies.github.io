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
import { getProgram } from "../loyalty.server";
import { rewardLabel } from "../rewards";
import { formatNumber, useActionToast } from "../components/ui";
import { hideModal, showModal } from "../components/modal";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const program = await getProgram(session.shop);
  const rewards = await db.reward.findMany({
    where: { shop: session.shop },
    orderBy: { pointsCost: "asc" },
    include: { _count: { select: { redemptions: true } } },
  });
  return { rewards, pointsName: program.pointsName };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const data = await request.json();

  if (data.intent === "delete") {
    await db.reward.deleteMany({ where: { id: String(data.id), shop } });
    return { ok: true, message: "Récompense supprimée" };
  }
  if (data.intent === "toggle") {
    const reward = await db.reward.findFirst({ where: { id: String(data.id), shop } });
    if (!reward) return { error: "Récompense introuvable" };
    await db.reward.update({ where: { id: reward.id }, data: { active: !reward.active } });
    return { ok: true, message: reward.active ? "Récompense masquée" : "Récompense activée" };
  }

  // Création / modification
  const type = ["AMOUNT", "PERCENT", "FREE_SHIPPING"].includes(data.type) ? data.type : "AMOUNT";
  const value = type === "FREE_SHIPPING" ? 0 : Number(data.value);
  const pointsCost = Math.round(Number(data.pointsCost));
  const minSubtotal = Number(data.minSubtotal) > 0 ? Number(data.minSubtotal) : null;

  if (!Number.isFinite(pointsCost) || pointsCost <= 0) {
    return { error: "Le coût en points doit être supérieur à 0" };
  }
  if (type !== "FREE_SHIPPING" && (!value || value <= 0)) {
    return { error: "Indiquez la valeur de la réduction" };
  }
  if (type === "PERCENT" && value > 100) {
    return { error: "Une réduction ne peut pas dépasser 100 %" };
  }
  const title =
    String(data.title || "").trim().slice(0, 80) || rewardLabel({ type, value });

  const fields = { title, type, value, pointsCost, minSubtotal };
  if (data.id) {
    await db.reward.updateMany({ where: { id: String(data.id), shop }, data: fields });
    return { ok: true, message: "Récompense mise à jour", saved: true };
  }
  await db.reward.create({ data: { shop, ...fields } });
  return { ok: true, message: "Récompense créée", saved: true };
};

type FormState = {
  id?: string;
  title: string;
  type: string;
  value: string;
  pointsCost: string;
  minSubtotal: string;
};

const EMPTY: FormState = { title: "", type: "AMOUNT", value: "5", pointsCost: "500", minSubtotal: "" };

const TYPE_INFO: Record<string, { emoji: string; label: string }> = {
  AMOUNT: { emoji: "💶", label: "Montant fixe" },
  PERCENT: { emoji: "％", label: "Pourcentage" },
  FREE_SHIPPING: { emoji: "🚚", label: "Livraison offerte" },
};

export default function Rewards() {
  const { rewards, pointsName } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const rowFetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);
  useActionToast(rowFetcher.data);

  const [form, setForm] = useState<FormState>(EMPTY);
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "saved" in fetcher.data) {
      hideModal("reward-modal");
    }
  }, [fetcher.state, fetcher.data]);

  const openNew = () => {
    setForm(EMPTY);
    showModal("reward-modal");
  };
  const openEdit = (r: (typeof rewards)[number]) => {
    setForm({
      id: r.id,
      title: r.title,
      type: r.type,
      value: String(r.value),
      pointsCost: String(r.pointsCost),
      minSubtotal: r.minSubtotal ? String(r.minSubtotal) : "",
    });
    showModal("reward-modal");
  };
  const save = () =>
    fetcher.submit({ intent: "save", ...form }, { method: "POST", encType: "application/json" });
  const rowAction = (intent: string, id: string) =>
    rowFetcher.submit({ intent, id }, { method: "POST", encType: "application/json" });

  const placeholder = rewardLabel({ type: form.type, value: Number(form.value) || 0 });

  return (
    <s-page heading="Récompenses">
      <s-button slot="primary-action" variant="primary" onClick={openNew}>
        Nouvelle récompense
      </s-button>

      <s-section>
        {rewards.length === 0 ? (
          <s-stack gap="base" alignItems="center" padding="large">
            <span style={{ fontSize: 44 }} aria-hidden="true">🎁</span>
            <s-heading>Aucune récompense pour l'instant</s-heading>
            <s-text color="subdued">
              Créez une première récompense : vos clients pourront l'obtenir en
              échange de leurs {pointsName}.
            </s-text>
            <s-button variant="primary" onClick={openNew}>
              Créer une récompense
            </s-button>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Récompense</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header format="numeric">Coût</s-table-header>
              <s-table-header format="numeric">Obtenue</s-table-header>
              <s-table-header>Statut</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rewards.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <span aria-hidden="true">{TYPE_INFO[r.type]?.emoji}</span>
                      <s-stack gap="none">
                        <s-text type="strong">{r.title}</s-text>
                        {r.minSubtotal ? (
                          <s-text color="subdued">
                            Dès {r.minSubtotal} € d'achat
                          </s-text>
                        ) : null}
                      </s-stack>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{TYPE_INFO[r.type]?.label}</s-table-cell>
                  <s-table-cell>
                    {formatNumber(r.pointsCost)} {pointsName}
                  </s-table-cell>
                  <s-table-cell>{r._count.redemptions} fois</s-table-cell>
                  <s-table-cell>
                    {r.active ? (
                      <s-badge tone="success">Visible</s-badge>
                    ) : (
                      <s-badge>Masquée</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button variant="tertiary" icon="edit" accessibilityLabel="Modifier" onClick={() => openEdit(r)} />
                      <s-button
                        variant="tertiary"
                        icon={r.active ? "hide" : "view"}
                        accessibilityLabel={r.active ? "Masquer" : "Afficher"}
                        onClick={() => rowAction("toggle", r.id)}
                      />
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        icon="delete"
                        accessibilityLabel="Supprimer"
                        onClick={() => {
                          if (confirm(`Supprimer « ${r.title} » ?`)) rowAction("delete", r.id);
                        }}
                      />
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Conseil">
        <s-paragraph>
          Une bonne première récompense s'obtient en 2 à 3 commandes. Avec 1
          point par euro, 500 points pour 5 € représentent 1 % de remise :
          attractif sans peser sur vos marges.
        </s-paragraph>
      </s-section>

      <s-modal id="reward-modal" heading={form.id ? "Modifier la récompense" : "Nouvelle récompense"}>
        <s-stack gap="base">
          <s-stack gap="small-200">
            <s-text>Type de récompense</s-text>
            <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="small">
              {Object.entries(TYPE_INFO).map(([key, info]) => (
                <s-clickable
                  key={key}
                  onClick={() => set("type", key)}
                  padding="base"
                  borderRadius="base"
                  border={form.type === key ? "large strong" : "base"}
                  background={form.type === key ? "subdued" : "base"}
                >
                  <s-stack gap="small-300" alignItems="center">
                    <span style={{ fontSize: 22 }} aria-hidden="true">{info.emoji}</span>
                    <s-text type={form.type === key ? "strong" : "generic"}>{info.label}</s-text>
                  </s-stack>
                </s-clickable>
              ))}
            </s-grid>
          </s-stack>
          {form.type !== "FREE_SHIPPING" && (
            <s-number-field
              label={form.type === "PERCENT" ? "Pourcentage de réduction" : "Montant de la réduction"}
              suffix={form.type === "PERCENT" ? "%" : "€"}
              min={0}
              max={form.type === "PERCENT" ? 100 : undefined}
              value={form.value}
              onChange={(e) => set("value", e.currentTarget.value)}
            />
          )}
          <s-number-field
            label="Coût en points"
            suffix={pointsName}
            min={1}
            step={50}
            value={form.pointsCost}
            onChange={(e) => set("pointsCost", e.currentTarget.value)}
          />
          <s-text-field
            label="Nom affiché (facultatif)"
            placeholder={placeholder}
            value={form.title}
            onChange={(e) => set("title", e.currentTarget.value)}
          />
          <s-number-field
            label="Montant minimum de commande (facultatif)"
            suffix="€"
            min={0}
            value={form.minSubtotal}
            onChange={(e) => set("minSubtotal", e.currentTarget.value)}
          />
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={save}
          {...(fetcher.state !== "idle" ? { loading: true } : {})}
        >
          Enregistrer
        </s-button>
        <s-button slot="secondary-actions" commandFor="reward-modal" command="--hide">
          Annuler
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
