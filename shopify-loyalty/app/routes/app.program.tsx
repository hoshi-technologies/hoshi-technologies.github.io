import { useState } from "react";
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
import { getProgram } from "../loyalty.server";
import { useActionToast } from "../components/ui";
import { useI18n } from "../i18n/react";

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
  const data = await readJson(request);
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
      // Vide = titre traduit automatiquement dans la langue de la boutique
      widgetTitle: String(data.widgetTitle || "").trim().slice(0, 60),
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
  return { ok: true, message: { key: "program.saved" } };
};

const PRESET_COLORS = ["#5C6AC4", "#E4572E", "#29845A", "#D4A017", "#C2185B", "#1F2140"];

export default function ProgramSettings() {
  const { program, rewards } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);
  const { t, money, number, currency, locale } = useI18n();

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
  const save = () => fetcher.submit(form, { method: "POST", encType: "application/json" });

  const pointsName = form.pointsName || t("program.pointsNameFallback");
  const example = Math.floor(50 * (Number(form.pointsPerUnit) || 0));
  const currencySymbol =
    new Intl.NumberFormat(locale, { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? "";

  return (
    <s-page heading={t("program.title")}>
      <s-button slot="primary-action" variant="primary" onClick={save} {...(saving ? { loading: true } : {})}>
        {t("common.save")}
      </s-button>

      <s-section heading={t("program.status.title")}>
        <s-switch
          label={t("program.status.label")}
          details={t("program.status.details")}
          checked={form.enabled}
          onChange={(e) => set("enabled", e.currentTarget.checked)}
        />
      </s-section>

      <s-section heading={t("program.earn.title")}>
        <s-stack gap="base">
          <s-text-field
            label={t("program.earn.pointsName")}
            details={t("program.earn.pointsNameDetails")}
            value={form.pointsName}
            onChange={(e) => set("pointsName", e.currentTarget.value)}
          />
          <s-number-field
            label={t("program.earn.perUnit", { currency: currencySymbol })}
            details={t("program.earn.perUnitDetails", { amount: money(50), points: example, pointsName })}
            min={0}
            step={0.5}
            value={form.pointsPerUnit}
            onChange={(e) => set("pointsPerUnit", e.currentTarget.value)}
          />
          <s-grid gridTemplateColumns="@container (inline-size > 500px) 1fr 1fr, 1fr" gap="base">
            <s-number-field
              label={t("program.earn.signup")}
              details={t("program.earn.signupDetails")}
              min={0}
              suffix={pointsName}
              value={form.signupPoints}
              onChange={(e) => set("signupPoints", e.currentTarget.value)}
            />
            <s-number-field
              label={t("program.earn.firstOrder")}
              details={t("program.earn.firstOrderDetails")}
              min={0}
              suffix={pointsName}
              value={form.firstOrderPoints}
              onChange={(e) => set("firstOrderPoints", e.currentTarget.value)}
            />
          </s-grid>
        </s-stack>
      </s-section>

      <s-section heading={t("program.birthday.title")}>
        <s-number-field
          label={t("program.birthday.label")}
          details={t("program.birthday.details")}
          min={0}
          step={50}
          suffix={pointsName}
          value={form.birthdayPoints}
          onChange={(e) => set("birthdayPoints", e.currentTarget.value)}
        />
      </s-section>

      <s-section heading={t("program.referral.title")}>
        <s-stack gap="base">
          <s-switch
            label={t("program.referral.enable")}
            details={t("program.referral.enableDetails")}
            checked={form.referralEnabled}
            onChange={(e) => set("referralEnabled", e.currentTarget.checked)}
          />
          {form.referralEnabled && (
            <>
              <s-number-field
                label={t("program.referral.referrerPoints")}
                min={0}
                step={50}
                suffix={pointsName}
                value={form.referrerPoints}
                onChange={(e) => set("referrerPoints", e.currentTarget.value)}
              />
              <s-grid gridTemplateColumns="@container (inline-size > 500px) 1fr 1fr 1fr, 1fr" gap="base">
                <s-select
                  label={t("program.referral.friendGift")}
                  value={form.friendRewardType}
                  onChange={(e) => set("friendRewardType", e.currentTarget.value)}
                >
                  <s-option value="AMOUNT">{t("rewards.types.AMOUNT")}</s-option>
                  <s-option value="PERCENT">{t("rewards.types.PERCENT")}</s-option>
                  <s-option value="FREE_SHIPPING">{t("rewards.types.FREE_SHIPPING")}</s-option>
                </s-select>
                {form.friendRewardType !== "FREE_SHIPPING" && (
                  <s-number-field
                    label={t("program.referral.value")}
                    min={0}
                    suffix={form.friendRewardType === "PERCENT" ? "%" : currencySymbol}
                    value={form.friendRewardValue}
                    onChange={(e) => set("friendRewardValue", e.currentTarget.value)}
                  />
                )}
                <s-number-field
                  label={t("program.referral.minimum")}
                  min={0}
                  suffix={currencySymbol}
                  value={form.friendMinSubtotal}
                  onChange={(e) => set("friendMinSubtotal", e.currentTarget.value)}
                />
              </s-grid>
            </>
          )}
        </s-stack>
      </s-section>

      <s-section heading={t("program.social.title")}>
        <s-stack gap="base">
          <s-paragraph>{t("program.social.intro", { pointsName })}</s-paragraph>
          <s-number-field
            label={t("program.social.points")}
            min={0}
            step={10}
            suffix={pointsName}
            value={form.socialPoints}
            onChange={(e) => set("socialPoints", e.currentTarget.value)}
          />
          <s-url-field label="Instagram" placeholder="https://instagram.com/…" value={form.instagramUrl} onChange={(e) => set("instagramUrl", e.currentTarget.value)} />
          <s-url-field label="Facebook" placeholder="https://facebook.com/…" value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.currentTarget.value)} />
          <s-url-field label="TikTok" placeholder="https://tiktok.com/@…" value={form.tiktokUrl} onChange={(e) => set("tiktokUrl", e.currentTarget.value)} />
        </s-stack>
      </s-section>

      <s-section heading={t("program.bonus.title")}>
        <s-stack gap="base">
          <s-paragraph>{t("program.bonus.intro", { pointsName })}</s-paragraph>
          <s-select
            label={t("program.bonus.multiplier")}
            value={form.bonusMultiplier}
            onChange={(e) => set("bonusMultiplier", e.currentTarget.value)}
          >
            <s-option value="1">{t("program.bonus.none")}</s-option>
            {[1.5, 2, 3].map((m) => (
              <s-option key={m} value={String(m)}>
                {t("program.bonus.option", { pointsName, multiplier: number(m) })}
              </s-option>
            ))}
          </s-select>
          {Number(form.bonusMultiplier) > 1 && (
            <>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-date-field
                  label={t("program.bonus.start")}
                  value={form.bonusStartsAt}
                  onChange={(e) => set("bonusStartsAt", e.currentTarget.value)}
                />
                <s-date-field
                  label={t("program.bonus.end")}
                  value={form.bonusEndsAt}
                  onChange={(e) => set("bonusEndsAt", e.currentTarget.value)}
                />
              </s-grid>
              <s-text-field
                label={t("program.bonus.message")}
                details={t("program.bonus.messageDetails")}
                placeholder={t("program.bonus.messagePlaceholder", { pointsName, multiplier: number(Number(form.bonusMultiplier)) })}
                value={form.bonusLabel}
                onChange={(e) => set("bonusLabel", e.currentTarget.value)}
              />
            </>
          )}
        </s-stack>
      </s-section>

      <s-section heading={t("program.expiration.title")}>
        <s-select
          label={t("program.expiration.label")}
          details={t("program.expiration.details")}
          value={form.expirationMonths}
          onChange={(e) => set("expirationMonths", e.currentTarget.value)}
        >
          <s-option value="0">{t("program.expiration.never")}</s-option>
          {[6, 12, 18, 24].map((m) => (
            <s-option key={m} value={String(m)}>
              {t("program.expiration.months", { count: m })}
            </s-option>
          ))}
        </s-select>
      </s-section>

      <s-section heading={t("program.widget.title")}>
        <s-stack gap="base">
          <s-paragraph>{t("program.widget.languageNote")}</s-paragraph>
          <s-text-field
            label={t("program.widget.widgetTitle")}
            details={t("program.widget.widgetTitleDetails")}
            placeholder={t("program.widget.defaultTitle")}
            value={form.widgetTitle}
            onChange={(e) => set("widgetTitle", e.currentTarget.value)}
          />
          <s-stack gap="small-200">
            <s-text>{t("program.widget.color")}</s-text>
            <s-stack direction="inline" gap="small" alignItems="center">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t("program.widget.colorOption", { color: c })}
                  onClick={() => set("widgetColor", c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "none",
                    cursor: "pointer",
                    background: c,
                    outline: form.widgetColor.toLowerCase() === c.toLowerCase() ? "3px solid #303030" : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
              <s-color-field
                label={t("program.widget.customColor")}
                labelAccessibilityVisibility="exclusive"
                value={form.widgetColor}
                onChange={(e) => set("widgetColor", e.currentTarget.value)}
              />
            </s-stack>
          </s-stack>
          <s-select
            label={t("program.widget.position")}
            value={form.widgetPosition}
            onChange={(e) => set("widgetPosition", e.currentTarget.value)}
          >
            <s-option value="right">{t("program.widget.right")}</s-option>
            <s-option value="left">{t("program.widget.left")}</s-option>
          </s-select>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading={t("program.preview")}>
        <WidgetPreview
          title={form.widgetTitle || t("program.widget.defaultTitle")}
          color={form.widgetColor}
          position={form.widgetPosition}
          pointsName={pointsName}
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
  const { t, number } = useI18n();
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
            {number(balance)} <span style={{ fontSize: 14, fontWeight: 500 }}>{pointsName}</span>
          </div>
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>★ {t("program.previewTier")}</div>
        </div>
        <div style={{ padding: 12, display: "grid", gap: 8 }}>
          {(rewards.length ? rewards : [{ title: t("labels.freeShipping"), cost: 300 }]).map((r) => (
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
                  {number(r.cost)} {pointsName}
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
                {t("program.previewRedeem")}
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
