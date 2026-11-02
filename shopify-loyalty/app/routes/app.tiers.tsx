import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { readJson } from "../utils.server";
import db from "../db.server";
import { getProgram, getTiers, memberTier, tierPerks, uniqueTierTag } from "../loyalty.server";
import { deleteTier, syncAllMemberTags, syncTierDiscounts } from "../levels.server";
import { ColorDot, formatNumber, useActionToast } from "../components/ui";
import { hideModal, showModal } from "../components/modal";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const program = await getProgram(shop);
  const [tiers, members] = await Promise.all([
    getTiers(shop),
    db.member.findMany({ where: { shop }, select: { lifetimePoints: true, manualTierId: true } }),
  ]);
  const counts: Record<string, number> = {};
  for (const m of members) {
    const t = memberTier(tiers, m);
    if (t) counts[t.id] = (counts[t.id] ?? 0) + 1;
  }
  return {
    tiers: tiers.map((t) => ({ ...t, perkList: tierPerks(t, program.pointsName) })),
    counts,
    pointsName: program.pointsName,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const data = await readJson(request);

  if (data.intent === "delete") {
    await deleteTier(admin, shop, String(data.id));
    return { ok: true, message: "Niveau supprimé" };
  }
  if (data.intent === "resync") {
    const tiers = await getTiers(shop);
    for (const t of tiers) await syncTierDiscounts(admin, t.id);
    const n = await syncAllMemberTags(admin, shop);
    return { ok: true, message: `Synchronisation terminée (${n} client(s) mis à jour)` };
  }

  const name = String(data.name || "").trim().slice(0, 40);
  if (!name) return { error: "Donnez un nom au niveau" };
  const mode = data.mode === "MANUAL" ? "MANUAL" : "AUTO";
  const discountType = ["PERCENT", "AMOUNT"].includes(data.discountType) ? data.discountType : "NONE";
  const discountValue = discountType === "NONE" ? 0 : Math.max(0, Number(data.discountValue) || 0);
  if (discountType !== "NONE" && discountValue <= 0) return { error: "Indiquez la valeur de la remise" };
  if (discountType === "PERCENT" && discountValue > 100) return { error: "La remise ne peut pas dépasser 100 %" };

  const fields = {
    name,
    mode,
    minPoints: mode === "MANUAL" ? 0 : Math.max(0, Math.round(Number(data.minPoints) || 0)),
    multiplier: Math.min(10, Math.max(1, Number(data.multiplier) || 1)),
    color: /^#[0-9a-f]{6}$/i.test(String(data.color)) ? String(data.color) : "#B08D57",
    discountType,
    discountValue,
    discountMinSubtotal: Number(data.discountMinSubtotal) > 0 ? Number(data.discountMinSubtotal) : null,
    freeShipping: Boolean(data.freeShipping),
    perks: String(data.perks || "").trim().slice(0, 500) || null,
  };

  let tierId: string;
  if (data.id) {
    const existing = await db.tier.findFirst({ where: { id: String(data.id), shop } });
    if (!existing) return { error: "Niveau introuvable" };
    await db.tier.update({
      where: { id: existing.id },
      data: { ...fields, tag: existing.tag ?? (await uniqueTierTag(shop, name, existing.id)) },
    });
    tierId = existing.id;
  } else {
    const created = await db.tier.create({ data: { shop, ...fields, tag: await uniqueTierTag(shop, name) } });
    tierId = created.id;
  }

  // Remises automatiques dans Shopify + étiquettes des clients concernés
  await syncTierDiscounts(admin, tierId);
  await syncAllMemberTags(admin, shop);
  const tier = await db.tier.findUniqueOrThrow({ where: { id: tierId } });
  if (tier.syncError) {
    return { error: `Niveau enregistré, mais la remise Shopify n'a pas pu être créée : ${tier.syncError}`, saved: true };
  }
  return { ok: true, message: data.id ? "Niveau mis à jour" : "Niveau créé", saved: true };
};

type FormState = {
  id?: string;
  name: string;
  mode: string;
  minPoints: string;
  multiplier: string;
  color: string;
  discountType: string;
  discountValue: string;
  discountMinSubtotal: string;
  freeShipping: boolean;
  perks: string;
};
const EMPTY: FormState = {
  name: "",
  mode: "AUTO",
  minPoints: "1000",
  multiplier: "1",
  color: "#7C3AED",
  discountType: "NONE",
  discountValue: "10",
  discountMinSubtotal: "",
  freeShipping: false,
  perks: "",
};
const PRESETS = ["#B08D57", "#9CA3AF", "#D4A017", "#7C3AED", "#0EA5E9", "#E11D48", "#111827"];

export default function Tiers() {
  const { tiers, counts, pointsName } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const rowFetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);
  useActionToast(rowFetcher.data);
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "saved" in fetcher.data) hideModal("tier-modal");
  }, [fetcher.state, fetcher.data]);

  const open = (t?: (typeof tiers)[number]) => {
    setForm(
      t
        ? {
            id: t.id,
            name: t.name,
            mode: t.mode,
            minPoints: String(t.minPoints),
            multiplier: String(t.multiplier),
            color: t.color,
            discountType: t.discountType,
            discountValue: t.discountType === "NONE" ? "10" : String(t.discountValue),
            discountMinSubtotal: t.discountMinSubtotal ? String(t.discountMinSubtotal) : "",
            freeShipping: t.freeShipping,
            perks: t.perks ?? "",
          }
        : EMPTY,
    );
    showModal("tier-modal");
  };

  const autoTiers = tiers.filter((t) => t.mode !== "MANUAL");
  const manualTiers = tiers.filter((t) => t.mode === "MANUAL");

  const renderCard = (t: (typeof tiers)[number], label: string) => (
    <div
      key={t.id}
      style={{
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 0 rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}cc)`, color: "#fff", padding: "18px 18px 14px" }}>
        <div style={{ fontSize: 12, opacity: 0.9 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>★ {t.name}</div>
      </div>
      <div style={{ padding: 16, flex: 1 }}>
        <s-stack gap="small">
          <s-text>
            {t.mode === "MANUAL" ? (
              "Attribué manuellement"
            ) : (
              <>
                Dès <s-text type="strong">{formatNumber(t.minPoints)} {pointsName}</s-text> cumulés
              </>
            )}
          </s-text>
          {t.perkList.length > 0 ? (
            <s-stack gap="small-300">
              {t.perkList.map((p) => (
                <s-text key={p}>✓ {p}</s-text>
              ))}
            </s-stack>
          ) : (
            <s-text color="subdued">Aucun avantage défini</s-text>
          )}
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge>{counts[t.id] ?? 0} client(s)</s-badge>
            {t.tag && <s-badge tone="info">Étiquette : {t.tag}</s-badge>}
          </s-stack>
          {t.syncError && (
            <s-banner tone="critical">Remise Shopify non créée : {t.syncError}</s-banner>
          )}
          <s-stack direction="inline" gap="small-200">
            <s-button onClick={() => open(t)}>Modifier</s-button>
            <s-button
              variant="tertiary"
              tone="critical"
              onClick={() => {
                if (confirm(`Supprimer le niveau « ${t.name} » ? Ses remises automatiques seront supprimées.`))
                  rowFetcher.submit({ intent: "delete", id: t.id }, { method: "POST", encType: "application/json" });
              }}
            >
              Supprimer
            </s-button>
          </s-stack>
        </s-stack>
      </div>
    </div>
  );

  return (
    <s-page heading="Niveaux clients">
      <s-button slot="primary-action" variant="primary" onClick={() => open()}>
        Nouveau niveau
      </s-button>
      <s-button
        slot="secondary-actions"
        onClick={() => rowFetcher.submit({ intent: "resync" }, { method: "POST", encType: "application/json" })}
      >
        Resynchroniser avec Shopify
      </s-button>

      <s-section>
        <s-paragraph>
          Chaque niveau peut offrir des <s-text type="strong">avantages appliqués automatiquement au paiement</s-text>{" "}
          (remise permanente, livraison offerte), un multiplicateur de {pointsName} et des avantages libres.
          Un niveau est soit <s-text type="strong">automatique</s-text> (atteint en cumulant des {pointsName}),
          soit <s-text type="strong">manuel</s-text> (vous l'attribuez vous-même depuis la fiche du client, par
          exemple « Ambassadrice » ou « Professionnelle »). Un niveau manuel a toujours priorité.
        </s-paragraph>
      </s-section>

      {tiers.length === 0 && (
        <s-section>
          <s-stack gap="base" alignItems="center" padding="large">
            <span style={{ fontSize: 44 }} aria-hidden="true">🏆</span>
            <s-heading>Aucun niveau</s-heading>
            <s-text color="subdued">Créez vos niveaux de clientèle et leurs avantages.</s-text>
            <s-button variant="primary" onClick={() => open()}>Créer un niveau</s-button>
          </s-stack>
        </s-section>
      )}

      {autoTiers.length > 0 && (
        <s-section heading="Niveaux automatiques (selon les points)">
          <s-grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr, 1fr" gap="base">
            {autoTiers.map((t, i) => renderCard(t, `Niveau ${i + 1}`))}
          </s-grid>
        </s-section>
      )}

      {manualTiers.length > 0 && (
        <s-section heading="Niveaux attribués manuellement">
          <s-grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr, 1fr" gap="base">
            {manualTiers.map((t) => renderCard(t, "Sur invitation"))}
          </s-grid>
        </s-section>
      )}

      <s-modal id="tier-modal" heading={form.id ? "Modifier le niveau" : "Nouveau niveau"} size="large">
        <s-stack gap="base">
          <s-text-field
            label="Nom du niveau"
            placeholder="Ex. : Or, Ambassadrice, Cliente pro…"
            value={form.name}
            onChange={(e) => set("name", e.currentTarget.value)}
          />

          <s-stack gap="small-200">
            <s-text>Comment le client obtient ce niveau ?</s-text>
            <s-grid gridTemplateColumns="1fr 1fr" gap="small">
              {[
                { key: "AUTO", emoji: "📈", label: "Automatiquement", text: `En cumulant des ${pointsName}` },
                { key: "MANUAL", emoji: "✋", label: "Manuellement", text: "Vous l'attribuez vous-même" },
              ].map((o) => (
                <s-clickable
                  key={o.key}
                  onClick={() => set("mode", o.key)}
                  padding="base"
                  borderRadius="base"
                  border={form.mode === o.key ? "large strong" : "base"}
                  background={form.mode === o.key ? "subdued" : "base"}
                >
                  <s-stack gap="small-300">
                    <s-text type="strong">
                      {o.emoji} {o.label}
                    </s-text>
                    <s-text color="subdued">{o.text}</s-text>
                  </s-stack>
                </s-clickable>
              ))}
            </s-grid>
          </s-stack>

          {form.mode === "AUTO" && (
            <s-number-field
              label={`${pointsName} cumulés nécessaires`}
              suffix={pointsName}
              min={0}
              step={100}
              value={form.minPoints}
              onChange={(e) => set("minPoints", e.currentTarget.value)}
            />
          )}

          <s-divider />
          <s-heading>Avantages automatiques</s-heading>

          <s-select
            label="Remise permanente sur les commandes"
            value={form.discountType}
            onChange={(e) => set("discountType", e.currentTarget.value)}
          >
            <s-option value="NONE">Aucune remise</s-option>
            <s-option value="PERCENT">Pourcentage (ex. -10 %)</s-option>
            <s-option value="AMOUNT">Montant fixe (ex. -5 €)</s-option>
          </s-select>
          {form.discountType !== "NONE" && (
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-number-field
                label="Valeur de la remise"
                suffix={form.discountType === "PERCENT" ? "%" : "€"}
                min={0}
                max={form.discountType === "PERCENT" ? 100 : undefined}
                value={form.discountValue}
                onChange={(e) => set("discountValue", e.currentTarget.value)}
              />
              <s-number-field
                label="À partir de (facultatif)"
                suffix="€ d'achat"
                min={0}
                value={form.discountMinSubtotal}
                onChange={(e) => set("discountMinSubtotal", e.currentTarget.value)}
              />
            </s-grid>
          )}
          <s-checkbox
            label="Livraison offerte sur toutes les commandes"
            checked={form.freeShipping}
            onChange={(e) => set("freeShipping", e.currentTarget.checked)}
          />
          <s-number-field
            label={`Multiplicateur de ${pointsName}`}
            details={`1 = normal, 2 = deux fois plus de ${pointsName} par commande.`}
            prefix="×"
            min={1}
            max={10}
            step={0.25}
            value={form.multiplier}
            onChange={(e) => set("multiplier", e.currentTarget.value)}
          />
          <s-text-area
            label="Autres avantages (un par ligne, affichés au client)"
            placeholder={"Accès aux ventes privées\nCadeau d'anniversaire"}
            rows={3}
            value={form.perks}
            onChange={(e) => set("perks", e.currentTarget.value)}
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
