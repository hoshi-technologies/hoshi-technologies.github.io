import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { pickMessages, publicLocale } from "../../i18n/i18n.server";
import { createTranslator } from "../../i18n/translate";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const locale = publicLocale(request);
  return { errors: loginErrorMessage(await login(request)), locale, messages: pickMessages(locale, ["landing"]) };
};

export const action = async ({ request }: ActionFunctionArgs) => ({
  errors: loginErrorMessage(await login(request)),
});

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;
  const t = createTranslator(loaderData.messages, loaderData.locale);

  return (
    <>
      <script src="https://cdn.shopify.com/shopifycloud/polaris.js" />
      <s-page>
        <Form method="post">
          <s-section heading={t("landing.login")}>
            <s-stack gap="base">
              <s-text-field
                name="shop"
                label={t("landing.shopDomain")}
                details="example.myshopify.com"
                value={shop}
                onChange={(e) => setShop(e.currentTarget.value)}
                autocomplete="on"
                error={errors.shop ? t(errors.shop) : undefined}
              ></s-text-field>
              <s-button type="submit" variant="primary">
                {t("landing.login")}
              </s-button>
            </s-stack>
          </s-section>
        </Form>
      </s-page>
    </>
  );
}
