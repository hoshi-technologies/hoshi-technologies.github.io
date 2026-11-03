import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { readJson } from "../utils.server";
import db from "../db.server";
import { getProgram } from "../loyalty.server";
import { rewardLabel, rewardTitle } from "../labels";
import { useActionToast } from "../components/ui";
import { hideModal, showModal } from "../components/modal";
import { useI18n } from "../i18n/react";

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
  const data = await readJson(request);

  if (data.intent === "delete") {
    await db.reward.deleteMany({ where: { id: String(data.id), shop } });
    return { ok: true, message: { key: "rewards.deleted" } };
  }
  if (data.intent === "toggle") {
    const reward = await db.reward.findFirst({ where: { id: String(data.id), shop } });
    if (!reward) return { error: { key: "errors.rewardUnavailable" } };
    await db.reward.update({ where: { id: reward.id }, data: { active: !reward.active } });
    return { ok: true, message: { key: reward.active ? "rewards.hidden" : "rewards.shown" } };
  }

  // Création / modification
  const type = ["AMOUNT", "PERCENT", "FREE_SHIPPING"].includes(data.type) ? data.type : "AMOUNT";
  const value = type === "FREE_SHIPPING" ? 0 : Number(data.value);
  const pointsCost = Math.round(Number(data.pointsCost));
  const minSubtotal = Number(data.minSubtotal) > 0 ? Number(data.minSubtotal) : null;

  if (!Number.isFinite(pointsCost) || pointsCost <= 0) return { error: { key: "rewards.errors.cost" } };
  if (type !== "FREE_SHIPPING" && (!value || value <= 0)) return { error: { key: "rewards.errors.value" } };
  if (type === "PERCENT" && value > 100) return { error: { key: "rewards.errors.percent" } };

  // Titre vide = libellé traduit automatiquement dans la langue de chaque client.
  const title = String(data.title || "").trim().slice(0, 80);
  const fields = { title, type, value, pointsCost, minSubtotal };
  if (data.id) {
    await db.reward.updateMany({ where: { id: String(data.id), shop }, data: fields });
    return { ok: true, message: { key: "rewards.updated" }, saved: true };
  }
  await db.reward.create({ data: { shop, ...fields } });
  return { ok: true, message: { key: "rewards.created" }, saved: true };
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
const TYPE_EMOJI: Record<string, string> = { AMOUNT: "💵", PERCENT: "％", FREE_SHIPPING: "🚚" };

export default function Rewards() {
  const { rewards, pointsName } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const rowFetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);
  useActionToast(rowFetcher.data);
  const { t, number, money, currency, locale } = useI18n();
  const currencySymbol =
    new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")
      ?.value ?? "";

  const [form, setForm] = useState<FormState>(EMPTY);
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "saved" in fetcher.data) hideModal("reward-modal");
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
  const save = () => fetcher.submit({ intent: "save", ...form }, { method: "POST", encType: "application/json" });
  const rowAction = (intent: string, id: string) =>
    rowFetcher.submit({ intent, id }, { method: "POST", encType: "application/json" });

  const placeholder = rewardLabel({ type: form.type, value: Number(form.value) || 0 }, t, money);

  return (
    <s-page heading={t("rewards.title")}>
      <s-button slot="primary-action" variant="primary" onClick={openNew}>
        {t("rewards.new")}
      </s-button>

      <s-section>
        {rewards.length === 0 ? (
          <s-stack gap="base" alignItems="center" padding="large">
            <span style={{ fontSize: 44 }} aria-hidden="true">🎁</span>
            <s-heading>{t("rewards.emptyTitle")}</s-heading>
            <s-text color="subdued">{t("rewards.emptyText", { pointsName })}</s-text>
            <s-button variant="primary" onClick={openNew}>
              {t("rewards.create")}
            </s-button>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">{t("rewards.columns.reward")}</s-table-header>
              <s-table-header>{t("common.type")}</s-table-header>
              <s-table-header format="numeric">{t("rewards.columns.cost")}</s-table-header>
              <s-table-header format="numeric">{t("rewards.columns.claimed")}</s-table-header>
              <s-table-header>{t("common.status")}</s-table-header>
              <s-table-header>{t("common.actions")}</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rewards.map((r) => {
                const title = rewardTitle(r, t, money);
                return (
                  <s-table-row key={r.id}>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small" alignItems="center">
                        <span aria-hidden="true">{TYPE_EMOJI[r.type]}</span>
                        <s-stack gap="none">
                          <s-text type="strong">{title}</s-text>
                          {r.minSubtotal ? (
                            <s-text color="subdued">{t("rewards.minimumShort", { amount: money(r.minSubtotal) })}</s-text>
                          ) : null}
                          {!r.title.trim() && <s-text color="subdued">{t("rewards.autoTranslated")}</s-text>}
                        </s-stack>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>{t(`rewards.types.${r.type}`)}</s-table-cell>
                    <s-table-cell>
                      {number(r.pointsCost)} {pointsName}
                    </s-table-cell>
                    <s-table-cell>{t("rewards.timesClaimed", { count: r._count.redemptions })}</s-table-cell>
                    <s-table-cell>
                      {r.active ? (
                        <s-badge tone="success">{t("rewards.visible")}</s-badge>
                      ) : (
                        <s-badge>{t("rewards.hiddenBadge")}</s-badge>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200">
                        <s-button variant="tertiary" icon="edit" accessibilityLabel={t("common.edit")} onClick={() => openEdit(r)} />
                        <s-button
                          variant="tertiary"
                          icon={r.active ? "hide" : "view"}
                          accessibilityLabel={r.active ? t("rewards.hide") : t("rewards.show")}
                          onClick={() => rowAction("toggle", r.id)}
                        />
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          icon="delete"
                          accessibilityLabel={t("common.delete")}
                          onClick={() => {
                            if (confirm(t("rewards.confirmDelete", { title }))) rowAction("delete", r.id);
                          }}
                        />
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading={t("rewards.tipTitle")}>
        <s-paragraph>{t("rewards.tip")}</s-paragraph>
      </s-section>

      <s-modal id="reward-modal" heading={form.id ? t("rewards.editTitle") : t("rewards.new")}>
        <s-stack gap="base">
          <s-stack gap="small-200">
            <s-text>{t("rewards.typeLabel")}</s-text>
            <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="small">
              {Object.keys(TYPE_EMOJI).map((key) => (
                <s-clickable
                  key={key}
                  onClick={() => set("type", key)}
                  padding="base"
                  borderRadius="base"
                  border={form.type === key ? "large strong" : "base"}
                  background={form.type === key ? "subdued" : "base"}
                >
                  <s-stack gap="small-300" alignItems="center">
                    <span style={{ fontSize: 22 }} aria-hidden="true">{TYPE_EMOJI[key]}</span>
                    <s-text type={form.type === key ? "strong" : "generic"}>{t(`rewards.types.${key}`)}</s-text>
                  </s-stack>
                </s-clickable>
              ))}
            </s-grid>
          </s-stack>
          {form.type !== "FREE_SHIPPING" && (
            <s-number-field
              label={form.type === "PERCENT" ? t("rewards.percentLabel") : t("rewards.amountLabel")}
              suffix={form.type === "PERCENT" ? "%" : currencySymbol}
              min={0}
              max={form.type === "PERCENT" ? 100 : undefined}
              value={form.value}
              onChange={(e) => set("value", e.currentTarget.value)}
            />
          )}
          <s-number-field
            label={t("rewards.costLabel")}
            suffix={pointsName}
            min={1}
            step={50}
            value={form.pointsCost}
            onChange={(e) => set("pointsCost", e.currentTarget.value)}
          />
          <s-text-field
            label={t("rewards.nameLabel")}
            details={t("rewards.nameDetails")}
            placeholder={placeholder}
            value={form.title}
            onChange={(e) => set("title", e.currentTarget.value)}
          />
          <s-number-field
            label={t("rewards.minimumLabel")}
            suffix={currencySymbol}
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
          {t("common.save")}
        </s-button>
        <s-button slot="secondary-actions" commandFor="reward-modal" command="--hide">
          {t("common.cancel")}
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
