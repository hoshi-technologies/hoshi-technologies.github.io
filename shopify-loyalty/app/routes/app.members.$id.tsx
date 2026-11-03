import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { readJson } from "../utils.server";
import db from "../db.server";
import {
  adjustPoints,
  getProgram,
  getTiers,
  memberTier,
  nextTier,
  numericId,
  redeemReward,
  setMemberTier,
  tierFor,
} from "../loyalty.server";
import { rewardTitle, tierPerks } from "../labels";
import { errorPayload } from "../errors";
import { useI18n } from "../i18n/react";
import { syncMemberTag } from "../levels.server";
import { pointsExpireAt } from "../engagement.server";
import {
  ColorDot,
  PointsDelta,
  TransactionBadge,
  TransactionDetail,
  useActionToast,
  useMemberName,
} from "../components/ui";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const member = await db.member.findFirst({
    where: { id: params.id, shop },
    include: {
      transactions: { orderBy: { createdAt: "desc" }, take: 50 },
      redemptions: { orderBy: { createdAt: "desc" }, take: 20 },
      referrals: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!member) throw new Response("Not found", { status: 404 });

  const [program, tiers, rewards] = await Promise.all([
    getProgram(shop),
    getTiers(shop),
    db.reward.findMany({ where: { shop, active: true }, orderBy: { pointsCost: "asc" } }),
  ]);
  return {
    member,
    pointsName: program.pointsName,
    tier: memberTier(tiers, member),
    autoTier: tierFor(tiers, member.lifetimePoints),
    next: nextTier(tiers, member),
    tiers: tiers.map((t) => ({ id: t.id, name: t.name, mode: t.mode })),
    rewards,
    customerAdminUrl: `shopify://admin/customers/${numericId(member.customerId)}`,
    expiresAt: member.points > 0 ? pointsExpireAt(program, member) : null,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await readJson(request);
  const memberId = String(params.id);

  try {
    if (data.intent === "tier") {
      await setMemberTier(session.shop, memberId, data.tierId ? String(data.tierId) : null);
      await syncMemberTag(admin, session.shop, memberId);
      return { ok: true, message: { key: "member.tierSaved" } };
    }
    if (data.intent === "remove") {
      // Retire l'étiquette de niveau dans Shopify puis supprime le membre.
      await setMemberTier(session.shop, memberId, null);
      await syncMemberTag(admin, session.shop, memberId, []); // aucun niveau → étiquette retirée
      await db.member.deleteMany({ where: { id: memberId, shop: session.shop } });
      return redirect("/app/members");
    }
    if (data.intent === "redeem") {
      const { code } = await redeemReward(admin, session.shop, memberId, String(data.rewardId));
      return { ok: true, message: { key: "member.codeCreated", params: { code } } };
    }
    const points = Math.round(Number(data.points) || 0) * (data.direction === "remove" ? -1 : 1);
    if (!points) return { error: { key: "member.errors.points" } };
    await adjustPoints(session.shop, memberId, points, String(data.reason || ""));
    return { ok: true, message: { key: points > 0 ? "member.pointsAdded" : "member.pointsRemoved" }, adjusted: true };
  } catch (e) {
    return { error: errorPayload(e) };
  }
};

export default function MemberDetail() {
  const { member, pointsName, tier, autoTier, next, rewards, customerAdminUrl, tiers, expiresAt } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);
  const { t, number, money, date, dateTime, locale } = useI18n();
  const memberName = useMemberName();

  const [points, setPoints] = useState("100");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState("add");
  const [rewardId, setRewardId] = useState(rewards[0]?.id ?? "");
  const [tierChoice, setTierChoice] = useState(member.manualTierId ?? "");
  useEffect(() => setTierChoice(member.manualTierId ?? ""), [member.manualTierId]);

  useEffect(() => {
    if (fetcher.data && "adjusted" in fetcher.data) setReason("");
  }, [fetcher.data]);

  const progress = next
    ? Math.min(100, Math.round(((member.lifetimePoints - (tier?.minPoints ?? 0)) / (next.minPoints - (tier?.minPoints ?? 0))) * 100))
    : 100;
  const busy = fetcher.state !== "idle";
  const perkList = tier ? tierPerks(tier, t, money, pointsName) : [];
  const converted = member.referrals.filter((r) => r.status === "COMPLETED").length;

  return (
    <s-page heading={memberName(member)}>
      <s-link slot="breadcrumb-actions" href="/app/members">
        {t("nav.members")}
      </s-link>
      <s-button slot="secondary-actions" href={customerAdminUrl} target="_blank">
        {t("member.viewCustomer")}
      </s-button>

      {member.email && <s-text color="subdued">{member.email}</s-text>}
      <s-section padding="none">
        <div
          style={{
            background: `linear-gradient(135deg, ${tier?.color ?? "#5C6AC4"}, #1f2140)`,
            color: "#fff",
            borderRadius: 12,
            padding: "22px 26px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ opacity: 0.8, fontSize: 13 }}>{t("member.available")}</div>
              <div style={{ fontSize: 36, fontWeight: 700 }}>
                {number(member.points)} <span style={{ fontSize: 16, fontWeight: 500 }}>{pointsName}</span>
              </div>
            </div>
            <div style={{ textAlign: "end" }}>
              <div style={{ opacity: 0.8, fontSize: 13 }}>
                {member.manualTierId ? t("member.tierAssigned") : t("member.tier")}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>★ {tier?.name ?? t("member.noTier")}</div>
              <div style={{ opacity: 0.8, fontSize: 13 }}>
                {t("member.lifetimeAndOrders", {
                  lifetime: number(member.lifetimePoints),
                  orders: t("addMember.orders", { count: member.ordersCount }),
                })}
              </div>
            </div>
          </div>
          {next && (
            <div style={{ marginTop: 16 }}>
              <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.25)" }}>
                <div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: "#fff" }} />
              </div>
              <div style={{ fontSize: 13, marginTop: 6, opacity: 0.9 }}>
                {t("member.toNextTier", { points: number(next.minPoints - member.lifetimePoints), pointsName, tier: next.name })}
              </div>
            </div>
          )}
        </div>
      </s-section>

      <s-section heading={t("member.history")}>
        {member.transactions.length === 0 ? (
          <s-text color="subdued">{t("member.noHistory")}</s-text>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">{t("common.detail")}</s-table-header>
              <s-table-header>{t("common.type")}</s-table-header>
              <s-table-header format="numeric">{t("common.points")}</s-table-header>
              <s-table-header>{t("common.date")}</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {member.transactions.map((tx) => (
                <s-table-row key={tx.id}>
                  <s-table-cell>
                    <TransactionDetail tx={tx} />
                  </s-table-cell>
                  <s-table-cell>
                    <TransactionBadge type={tx.type} />
                  </s-table-cell>
                  <s-table-cell>
                    <PointsDelta points={tx.points} />
                  </s-table-cell>
                  <s-table-cell>{dateTime(tx.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {member.redemptions.length > 0 && (
        <s-section heading={t("member.codes")}>
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">{t("rewards.columns.reward")}</s-table-header>
              <s-table-header>{t("member.code")}</s-table-header>
              <s-table-header format="numeric">{t("rewards.columns.cost")}</s-table-header>
              <s-table-header>{t("common.status")}</s-table-header>
              <s-table-header>{t("common.date")}</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {member.redemptions.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{r.title}</s-table-cell>
                  <s-table-cell>
                    <s-badge>{r.code}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{number(r.pointsCost)}</s-table-cell>
                  <s-table-cell>
                    {r.usedAt ? (
                      <s-badge tone="success">{t("member.codeUsed")}</s-badge>
                    ) : (
                      <s-badge>{t("member.codeAvailable")}</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>{dateTime(r.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-section slot="aside" heading={t("member.adjust")}>
        <s-stack gap="base">
          <s-select label={t("member.adjustAction")} value={direction} onChange={(e) => setDirection(e.currentTarget.value)}>
            <s-option value="add">{t("member.addPoints")}</s-option>
            <s-option value="remove">{t("member.removePoints")}</s-option>
          </s-select>
          <s-number-field
            label={t("member.pointsCount")}
            min={1}
            step={10}
            value={points}
            onChange={(e) => setPoints(e.currentTarget.value)}
          />
          <s-text-field
            label={t("member.reason")}
            placeholder={t("member.reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
          <s-button
            variant="primary"
            onClick={() => fetcher.submit({ intent: "adjust", points, reason, direction }, { method: "POST", encType: "application/json" })}
            {...(busy ? { loading: true } : {})}
          >
            {t("member.confirm")}
          </s-button>
        </s-stack>
      </s-section>

      {rewards.length > 0 && (
        <s-section slot="aside" heading={t("member.giftReward")}>
          <s-stack gap="base">
            <s-text color="subdued">{t("member.giftRewardText")}</s-text>
            <s-select label={t("rewards.columns.reward")} value={rewardId} onChange={(e) => setRewardId(e.currentTarget.value)}>
              {rewards.map((r) => (
                <s-option key={r.id} value={r.id} disabled={r.pointsCost > member.points}>
                  {rewardTitle(r, t, money)} — {number(r.pointsCost)} {pointsName}
                </s-option>
              ))}
            </s-select>
            <s-button
              onClick={() => fetcher.submit({ intent: "redeem", rewardId }, { method: "POST", encType: "application/json" })}
              {...(busy ? { loading: true } : {})}
            >
              {t("member.generateCode")}
            </s-button>
          </s-stack>
        </s-section>
      )}

      <s-section slot="aside" heading={t("member.info")}>
        <s-stack gap="small">
          <s-text>
            🎂{" "}
            {t("member.birthday", {
              date: member.birthday
                ? new Date(`2024-${member.birthday}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long" })
                : t("member.notProvided"),
            })}
          </s-text>
          <s-text>🤝 {t("member.referralCode", { code: member.referralCode ?? "—" })}</s-text>
          <s-text>👥 {t("member.referrals", { converted, invited: member.referrals.length })}</s-text>
          {expiresAt && <s-text>⏳ {t("member.expiresAt", { date: date(expiresAt) })}</s-text>}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading={t("member.tierSection")}>
        <s-stack gap="base">
          <s-select
            label={t("member.tier")}
            details={
              tierChoice
                ? t("member.tierLocked")
                : t("member.tierAuto", { tier: autoTier?.name ?? t("member.noTier"), pointsName })
            }
            value={tierChoice}
            onChange={(e) => setTierChoice(e.currentTarget.value)}
          >
            <s-option value="">{t("addMember.autoTier", { pointsName })}</s-option>
            {tiers.map((option) => (
              <s-option key={option.id} value={option.id}>
                {option.mode === "MANUAL" ? t("addMember.invitationTier", { name: option.name }) : option.name}
              </s-option>
            ))}
          </s-select>
          <s-button
            disabled={tierChoice === (member.manualTierId ?? "")}
            onClick={() => fetcher.submit({ intent: "tier", tierId: tierChoice }, { method: "POST", encType: "application/json" })}
            {...(busy ? { loading: true } : {})}
          >
            {t("member.applyTier")}
          </s-button>
          {tier && (
            <s-stack gap="small-200">
              <s-stack direction="inline" gap="small" alignItems="center">
                <ColorDot color={tier.color} />
                <s-text type="strong">{t("member.perks", { tier: tier.name })}</s-text>
              </s-stack>
              {perkList.length ? (
                perkList.map((p) => <s-text key={p}>✓ {p}</s-text>)
              ) : (
                <s-text color="subdued">{t("member.noPerks")}</s-text>
              )}
              {member.appliedTag && <s-text color="subdued">{t("member.shopifyTag", { tag: member.appliedTag })}</s-text>}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading={t("member.danger")}>
        <s-button
          tone="critical"
          variant="secondary"
          onClick={() => {
            if (confirm(t("member.confirmRemove")))
              fetcher.submit({ intent: "remove" }, { method: "POST", encType: "application/json" });
          }}
        >
          {t("member.remove")}
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
