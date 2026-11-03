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
import { getProgram, getTiers, memberTier, uniqueTierTag } from "../loyalty.server";
import { tierPerks } from "../labels";
import { useI18n } from "../i18n/react";
import { deleteTier, syncAllMemberTags, syncTierDiscounts } from "../levels.server";
import { ColorDot, useActionToast } from "../components/ui";
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
    tiers,
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
    return { ok: true, message: { key: "tiers.deleted" } };
  }
  if (data.intent === "resync") {
    const tiers = await getTiers(shop);
    for (const t of tiers) await syncTierDiscounts(admin, t.id);
    const n = await syncAllMemberTags(admin, shop);
    return { ok: true, message: { key: "tiers.resynced", params: { count: n } } };
  }

  const name = String(data.name || "").trim().slice(0, 40);
  if (!name) return { error: { key: "tiers.errors.name" } };
  const mode = data.mode === "MANUAL" ? "MANUAL" : "AUTO";
  const discountType = ["PERCENT", "AMOUNT"].includes(data.discountType) ? data.discountType : "NONE";
  const discountValue = discountType === "NONE" ? 0 : Math.max(0, Number(data.discountValue) || 0);
  if (discountType !== "NONE" && discountValue <= 0) return { error: { key: "tiers.errors.value" } };
  if (discountType === "PERCENT" && discountValue > 100) return { error: { key: "tiers.errors.percent" } };

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
    if (!existing) return { error: { key: "errors.tierNotFound" } };
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
    return { error: { key: "tiers.errors.sync", params: { details: tier.syncError } }, saved: true };
  }
  return { ok: true, message: { key: data.id ? "tiers.updated" : "tiers.created" }, saved: true };
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
  const { t, number, money, currency, locale } = useI18n();
  const currencySymbol =
    new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")
      ?.value ?? "";
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "saved" in fetcher.data) hideModal("tier-modal");
  }, [fetcher.state, fetcher.data]);

  const open = (tier?: (typeof tiers)[number]) => {
    setForm(
      tier
        ? {
            id: tier.id,
            name: tier.name,
            mode: tier.mode,
            minPoints: String(tier.minPoints),
            multiplier: String(tier.multiplier),
            color: tier.color,
            discountType: tier.discountType,
            discountValue: tier.discountType === "NONE" ? "10" : String(tier.discountValue),
            discountMinSubtotal: tier.discountMinSubtotal ? String(tier.discountMinSubtotal) : "",
            freeShipping: tier.freeShipping,
            perks: tier.perks ?? "",
          }
        : EMPTY,
    );
    showModal("tier-modal");
  };

  const autoTiers = tiers.filter((tier) => tier.mode !== "MANUAL");
  const manualTiers = tiers.filter((tier) => tier.mode === "MANUAL");

  const renderCard = (tier: (typeof tiers)[number], label: string) => {
    const perkList = tierPerks(tier, t, money, pointsName);
    return (
      <div
        key={tier.id}
        style={{
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 1px 0 rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}cc)`, color: "#fff", padding: "18px 18px 14px" }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>★ {tier.name}</div>
        </div>
        <div style={{ padding: 16, flex: 1 }}>
          <s-stack gap="small">
            <s-text>
              {tier.mode === "MANUAL"
                ? t("tiers.assignedManually")
                : t("tiers.fromPoints", { points: number(tier.minPoints), pointsName })}
            </s-text>
            {perkList.length > 0 ? (
              <s-stack gap="small-300">
                {perkList.map((p) => (
                  <s-text key={p}>✓ {p}</s-text>
                ))}
              </s-stack>
            ) : (
              <s-text color="subdued">{t("tiers.noPerks")}</s-text>
            )}
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge>{t("tiers.customers", { count: counts[tier.id] ?? 0 })}</s-badge>
              {tier.tag && <s-badge tone="info">{t("tiers.tag", { tag: tier.tag })}</s-badge>}
            </s-stack>
            {tier.syncError && <s-banner tone="critical">{t("tiers.syncError", { details: tier.syncError })}</s-banner>}
            <s-stack direction="inline" gap="small-200">
              <s-button onClick={() => open(tier)}>{t("common.edit")}</s-button>
              <s-button
                variant="tertiary"
                tone="critical"
                onClick={() => {
                  if (confirm(t("tiers.confirmDelete", { name: tier.name })))
                    rowFetcher.submit({ intent: "delete", id: tier.id }, { method: "POST", encType: "application/json" });
                }}
              >
                {t("common.delete")}
              </s-button>
            </s-stack>
          </s-stack>
        </div>
      </div>
    );
  };

  return (
    <s-page heading={t("tiers.title")}>
      <s-button slot="primary-action" variant="primary" onClick={() => open()}>
        {t("tiers.new")}
      </s-button>
      <s-button
        slot="secondary-actions"
        onClick={() => rowFetcher.submit({ intent: "resync" }, { method: "POST", encType: "application/json" })}
      >
        {t("tiers.resync")}
      </s-button>

      <s-section>
        <s-paragraph>{t("tiers.intro", { pointsName })}</s-paragraph>
      </s-section>

      {tiers.length === 0 && (
        <s-section>
          <s-stack gap="base" alignItems="center" padding="large">
            <span style={{ fontSize: 44 }} aria-hidden="true">🏆</span>
            <s-heading>{t("tiers.emptyTitle")}</s-heading>
            <s-text color="subdued">{t("tiers.emptyText")}</s-text>
            <s-button variant="primary" onClick={() => open()}>
              {t("tiers.create")}
            </s-button>
          </s-stack>
        </s-section>
      )}

      {autoTiers.length > 0 && (
        <s-section heading={t("tiers.autoSection")}>
          <s-grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr, 1fr" gap="base">
            {autoTiers.map((tier, i) => renderCard(tier, t("tiers.levelNumber", { number: i + 1 })))}
          </s-grid>
        </s-section>
      )}

      {manualTiers.length > 0 && (
        <s-section heading={t("tiers.manualSection")}>
          <s-grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr, 1fr" gap="base">
            {manualTiers.map((tier) => renderCard(tier, t("tiers.invitationOnly")))}
          </s-grid>
        </s-section>
      )}

      <s-modal id="tier-modal" heading={form.id ? t("tiers.editTitle") : t("tiers.new")} size="large">
        <s-stack gap="base">
          <s-text-field
            label={t("tiers.nameLabel")}
            placeholder={t("tiers.namePlaceholder")}
            value={form.name}
            onChange={(e) => set("name", e.currentTarget.value)}
          />

          <s-stack gap="small-200">
            <s-text>{t("tiers.modeQuestion")}</s-text>
            <s-grid gridTemplateColumns="1fr 1fr" gap="small">
              {[
                { key: "AUTO", emoji: "📈", label: t("tiers.modeAuto"), text: t("tiers.modeAutoText", { pointsName }) },
                { key: "MANUAL", emoji: "✋", label: t("tiers.modeManual"), text: t("tiers.modeManualText") },
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
              label={t("tiers.minPointsLabel", { pointsName })}
              suffix={pointsName}
              min={0}
              step={100}
              value={form.minPoints}
              onChange={(e) => set("minPoints", e.currentTarget.value)}
            />
          )}

          <s-divider />
          <s-heading>{t("tiers.perksTitle")}</s-heading>

          <s-select
            label={t("tiers.discountLabel")}
            value={form.discountType}
            onChange={(e) => set("discountType", e.currentTarget.value)}
          >
            <s-option value="NONE">{t("tiers.discountNone")}</s-option>
            <s-option value="PERCENT">{t("tiers.discountPercent")}</s-option>
            <s-option value="AMOUNT">{t("tiers.discountAmount")}</s-option>
          </s-select>
          {form.discountType !== "NONE" && (
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-number-field
                label={t("tiers.discountValue")}
                suffix={form.discountType === "PERCENT" ? "%" : currencySymbol}
                min={0}
                max={form.discountType === "PERCENT" ? 100 : undefined}
                value={form.discountValue}
                onChange={(e) => set("discountValue", e.currentTarget.value)}
              />
              <s-number-field
                label={t("tiers.discountMinimum")}
                suffix={currencySymbol}
                min={0}
                value={form.discountMinSubtotal}
                onChange={(e) => set("discountMinSubtotal", e.currentTarget.value)}
              />
            </s-grid>
          )}
          <s-checkbox
            label={t("tiers.freeShipping")}
            checked={form.freeShipping}
            onChange={(e) => set("freeShipping", e.currentTarget.checked)}
          />
          <s-number-field
            label={t("tiers.multiplierLabel", { pointsName })}
            details={t("tiers.multiplierDetails", { pointsName })}
            prefix="×"
            min={1}
            max={10}
            step={0.25}
            value={form.multiplier}
            onChange={(e) => set("multiplier", e.currentTarget.value)}
          />
          <s-text-area
            label={t("tiers.otherPerks")}
            placeholder={t("tiers.otherPerksPlaceholder")}
            rows={3}
            value={form.perks}
            onChange={(e) => set("perks", e.currentTarget.value)}
          />

          <s-stack gap="small-200">
            <s-text>{t("common.color")}</s-text>
            <s-stack direction="inline" gap="small" alignItems="center">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t("program.widget.colorOption", { color: c })}
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
          {t("common.save")}
        </s-button>
        <s-button slot="secondary-actions" commandFor="tier-modal" command="--hide">
          {t("common.cancel")}
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
