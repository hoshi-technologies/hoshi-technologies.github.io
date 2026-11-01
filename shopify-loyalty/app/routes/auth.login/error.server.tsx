import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

export function loginErrorMessage(loginErrors: LoginError): { shop?: string } {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: "Indiquez le domaine de votre boutique" };
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: "Ce domaine de boutique n'est pas valide" };
  }
  return {};
}
