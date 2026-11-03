import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

/** Clé de traduction de l'erreur de connexion. */
export function loginErrorMessage(loginErrors: LoginError): { shop?: string } {
  if (loginErrors?.shop === LoginErrorType.MissingShop) return { shop: "landing.errors.missingShop" };
  if (loginErrors?.shop === LoginErrorType.InvalidShop) return { shop: "landing.errors.invalidShop" };
  return {};
}
