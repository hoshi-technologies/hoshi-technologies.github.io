import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { activeBonus, getDashboardStats, getProgram } from "../loyalty.server";
import { DailyBars } from "../components/chart";
import {
  PointsDelta,
  StatCard,
  TransactionBadge,
  TransactionDetail,
  useMemberName,
} from "../components/ui";
import { useI18n } from "../i18n/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const program = await getProgram(shop);
  const [stats, rewards, tiers] = await Promise.all([
    getDashboardStats(shop),
    db.reward.count({ where: { shop, active: true } }),
    db.tier.count({ where: { shop } }),
  ]);
  return {
    program,
    bonus: activeBonus(program),
    stats,
    rewards,
    tiers,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export default function Dashboard() {
  const { program, bonus, stats, rewards, tiers, apiKey } = useLoaderData<typeof loader>();
  const { t, money, date, dateTime } = useI18n();
  const memberName = useMemberName();
  const pointsName = program.pointsName;
  const themeEditorUrl = `shopify://admin/themes/current/editor?context=apps&activateAppId=${apiKey}/loyalty-embed`;

  const steps = [
    {
      done: program.enabled,
      title: t("dashboard.steps.enableTitle"),
      text: t("dashboard.steps.enableText"),
      action: { label: t("nav.settings"), href: "/app/program" },
    },
    {
      done: rewards > 0,
      title: t("dashboard.steps.rewardsTitle"),
      text: t("dashboard.steps.rewardsText"),
      action: { label: t("nav.rewards"), href: "/app/rewards" },
    },
    {
      done: tiers > 0,
      title: t("dashboard.steps.tiersTitle"),
      text: t("dashboard.steps.tiersText"),
      action: { label: t("nav.tiers"), href: "/app/tiers" },
    },
    {
      done: false,
      title: t("dashboard.steps.widgetTitle"),
      text: t("dashboard.steps.widgetText"),
      action: { label: t("dashboard.steps.widgetAction"), href: themeEditorUrl, external: true },
    },
  ];

  return (
    <s-page heading={t("dashboard.title")}>
      <s-button slot="primary-action" variant="primary" href="/app/rewards">
        {t("dashboard.manageRewards")}
      </s-button>
      <s-button slot="secondary-actions" href="/app/program">
        {t("nav.settings")}
      </s-button>

      {!program.enabled && (
        <s-banner tone="warning" heading={t("dashboard.pausedTitle")}>
          {t("dashboard.pausedText")} <s-link href="/app/program">{t("dashboard.reactivate")}</s-link>
        </s-banner>
      )}

      {bonus > 1 && (
        <s-banner tone="info" heading={t("dashboard.campaignTitle", { pointsName, multiplier: bonus })}>
          {program.bonusEndsAt
            ? t("dashboard.campaignUntil", { date: date(program.bonusEndsAt) })
            : t("dashboard.campaignNoEnd")}{" "}
          <s-link href="/app/program">{t("common.edit")}</s-link>
        </s-banner>
      )}

      {/* Bandeau d'accueil */}
      <s-section padding="none">
        <div
          style={{
            background: `linear-gradient(135deg, ${program.widgetColor} 0%, #1f2140 100%)`,
            color: "#fff",
            borderRadius: 12,
            padding: "24px 28px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 44 }} aria-hidden="true">
            ★
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{t("dashboard.welcome")}</div>
            <div style={{ opacity: 0.85, marginTop: 4 }}>
              {t("dashboard.summary", {
                amount: money(1),
                points: program.pointsPerUnit,
                pointsName,
                signup: program.signupPoints,
              })}
            </div>
          </div>
          <span
            style={{
              background: "rgba(255,255,255,0.18)",
              padding: "6px 14px",
              borderRadius: 999,
              fontWeight: 600,
            }}
          >
            ● {program.enabled ? t("common.active") : t("common.paused")}
          </span>
        </div>
      </s-section>

      <s-grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr 1fr, 1fr 1fr" gap="base">
        <StatCard
          emoji="👥"
          label={t("dashboard.stats.members")}
          value={stats.members}
          hint={t("dashboard.stats.newMembers", { count: stats.newMembers })}
        />
        <StatCard emoji="✨" label={t("dashboard.stats.pointsEarned", { pointsName })} value={stats.pointsEarned} />
        <StatCard emoji="🎁" label={t("dashboard.stats.pointsSpent", { pointsName })} value={stats.pointsSpent} />
        <StatCard
          emoji="🏷️"
          label={t("dashboard.stats.rewardsClaimed")}
          value={stats.redemptions}
          hint={t("dashboard.stats.rewardsUsed", { count: stats.rewardsUsed })}
        />
      </s-grid>

      <s-grid gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr, 1fr" gap="base">
        <StatCard
          emoji="💶"
          label={t("dashboard.stats.rewardRevenue")}
          value={money(stats.rewardRevenue)}
          hint={t("dashboard.stats.rewardRevenueHint")}
        />
        <StatCard
          emoji="🤝"
          label={t("dashboard.stats.referrals")}
          value={stats.referrals}
          hint={t("dashboard.stats.pendingReferrals", { count: stats.pendingReferrals })}
        />
        <StatCard
          emoji="🛒"
          label={t("dashboard.stats.referralRevenue")}
          value={money(stats.referralRevenue)}
          hint={t("dashboard.stats.referralRevenueHint")}
        />
      </s-grid>

      <s-section heading={t("dashboard.chartTitle", { pointsName })}>
        <DailyBars data={stats.daily} unit={pointsName} />
      </s-section>

      <s-section heading={t("dashboard.recentActivity")}>
        {stats.recent.length === 0 ? (
          <s-stack gap="small" alignItems="center" padding="large">
            <span style={{ fontSize: 36 }} aria-hidden="true">🌱</span>
            <s-text color="subdued">{t("dashboard.noActivity")}</s-text>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">{t("common.customer")}</s-table-header>
              <s-table-header>{t("common.type")}</s-table-header>
              <s-table-header>{t("common.detail")}</s-table-header>
              <s-table-header format="numeric">{t("common.points")}</s-table-header>
              <s-table-header>{t("common.date")}</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {stats.recent.map((tx) => (
                <s-table-row key={tx.id}>
                  <s-table-cell>
                    <s-link href={`/app/members/${tx.memberId}`}>{memberName(tx.member)}</s-link>
                  </s-table-cell>
                  <s-table-cell>
                    <TransactionBadge type={tx.type} />
                  </s-table-cell>
                  <s-table-cell>
                    <TransactionDetail tx={tx} />
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

      <s-section slot="aside" heading={t("dashboard.gettingStarted")}>
        <s-stack gap="base">
          {steps.map((step) => (
            <s-stack key={step.title} direction="inline" gap="small" alignItems="start">
              <span
                aria-hidden="true"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 13,
                  flexShrink: 0,
                  background: step.done ? "#29845a" : "transparent",
                  color: "#fff",
                  border: step.done ? "none" : "2px dashed #b5b5b5",
                }}
              >
                {step.done ? "✓" : ""}
              </span>
              <s-stack gap="small-300">
                <s-text type="strong">{step.title}</s-text>
                <s-text color="subdued">{step.text}</s-text>
                <s-link href={step.action.href} {...("external" in step.action ? { target: "_blank" } : {})}>
                  {step.action.label}
                </s-link>
              </s-stack>
            </s-stack>
          ))}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading={t("dashboard.howItWorks")}>
        <s-unordered-list>
          {["signup", "orders", "tiers", "discounts", "rewards", "more"].map((key) => (
            <s-list-item key={key}>{t(`dashboard.how.${key}`)}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
