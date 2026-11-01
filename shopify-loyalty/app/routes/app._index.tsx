import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getDashboardStats, getProgram } from "../loyalty.server";
import {
  PointsDelta,
  StatCard,
  TransactionBadge,
  formatDate,
  memberName,
} from "../components/ui";

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
    stats,
    rewards,
    tiers,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export default function Dashboard() {
  const { program, stats, rewards, tiers, apiKey } =
    useLoaderData<typeof loader>();
  const themeEditorUrl = `shopify://admin/themes/current/editor?context=apps&activateAppId=${apiKey}/loyalty-embed`;

  const steps = [
    {
      done: program.enabled,
      title: "Activer le programme",
      text: "Vos clients gagnent des points dès que le programme est actif.",
      action: { label: "Réglages", href: "/app/program" },
    },
    {
      done: rewards > 0,
      title: "Proposer des récompenses",
      text: "Des réductions que vos clients peuvent obtenir avec leurs points.",
      action: { label: "Récompenses", href: "/app/rewards" },
    },
    {
      done: tiers > 0,
      title: "Définir vos niveaux clients",
      text: "Bronze, Argent, Or ou niveaux sur invitation, avec remises automatiques.",
      action: { label: "Niveaux clients", href: "/app/tiers" },
    },
    {
      done: false,
      title: "Afficher le widget sur la boutique",
      text: "Activez « Fidélité Hoshi » dans l'éditeur de thème (Intégrations d'applications).",
      action: { label: "Ouvrir l'éditeur de thème", href: themeEditorUrl, external: true },
    },
  ];

  return (
    <s-page heading="Tableau de bord">
      <s-button slot="primary-action" variant="primary" href="/app/rewards">
        Gérer les récompenses
      </s-button>
      <s-button slot="secondary-actions" href="/app/program">
        Réglages
      </s-button>

      {!program.enabled && (
        <s-banner tone="warning" heading="Le programme est en pause">
          Vos clients ne gagnent plus de points et ne peuvent plus échanger de
          récompenses. <s-link href="/app/program">Le réactiver</s-link>
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
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              Bienvenue dans Hoshi Fidélité
            </div>
            <div style={{ opacity: 0.85, marginTop: 4 }}>
              1 € dépensé = {program.pointsPerUnit} {program.pointsName} ·{" "}
              {program.signupPoints} {program.pointsName} offerts à l'inscription
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
            {program.enabled ? "● Actif" : "● En pause"}
          </span>
        </div>
      </s-section>

      <s-grid
        gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr 1fr, 1fr 1fr"
        gap="base"
      >
        <StatCard emoji="👥" label="Membres" value={stats.members} hint={`+${stats.newMembers} ces 30 derniers jours`} />
        <StatCard emoji="✨" label={`${capitalize(program.pointsName)} distribués`} value={stats.pointsEarned} />
        <StatCard emoji="🎁" label={`${capitalize(program.pointsName)} échangés`} value={stats.pointsSpent} />
        <StatCard emoji="🏷️" label="Récompenses obtenues" value={stats.redemptions} />
      </s-grid>

      <s-section heading="Activité récente">
        {stats.recent.length === 0 ? (
          <s-stack gap="small" alignItems="center" padding="large">
            <span style={{ fontSize: 36 }} aria-hidden="true">🌱</span>
            <s-text color="subdued">
              Aucune activité pour l'instant. Les points apparaîtront ici dès la
              première commande ou inscription.
            </s-text>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Client</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header>Détail</s-table-header>
              <s-table-header format="numeric">Points</s-table-header>
              <s-table-header>Date</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {stats.recent.map((tx) => (
                <s-table-row key={tx.id}>
                  <s-table-cell>
                    <s-link href={`/app/members/${tx.memberId}`}>
                      {memberName(tx.member)}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>
                    <TransactionBadge type={tx.type} />
                  </s-table-cell>
                  <s-table-cell>{tx.description}</s-table-cell>
                  <s-table-cell>
                    <PointsDelta points={tx.points} />
                  </s-table-cell>
                  <s-table-cell>{formatDate(tx.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Bien démarrer">
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
                <s-link
                  href={step.action.href}
                  {...("external" in step.action ? { target: "_blank" } : {})}
                >
                  {step.action.label} →
                </s-link>
              </s-stack>
            </s-stack>
          ))}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Comment ça marche ?">
        <s-unordered-list>
          <s-list-item>Le client crée un compte : bonus de bienvenue.</s-list-item>
          <s-list-item>Chaque commande payée rapporte des points.</s-list-item>
          <s-list-item>Plus il cumule, plus son niveau monte (ou vous lui attribuez un niveau).</s-list-item>
          <s-list-item>Chaque niveau peut donner une remise automatique au paiement.</s-list-item>
          <s-list-item>
            Depuis le widget, il échange ses points contre un code de réduction
            personnel.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
