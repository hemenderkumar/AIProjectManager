import * as samlify from "samlify";
import type { ServiceProviderInstance, IdentityProviderInstance } from "samlify";
import type { scOrganizations } from "../db/schema";

// SP-initiated SAML 2.0 SSO for enterprise Client organizations (spec: "SSO/SAML for
// enterprise Client orgs"). One shared Service Provider entity serves every org on the
// platform -- the org being logged into travels as RelayState, not as a separate SP per org
// -- while each org supplies its own Identity Provider config via the
// scOrganizations.samlEntityId/samlIdpMetadataUrl/samlIdpCert columns (see schema.ts).
//
// IMPORTANT: this has NOT been exercised against a live IdP (Okta, Azure AD, ADFS, etc.) --
// there is no such IdP reachable from this sandbox to test against. The code follows
// samlify's documented API and standard SP-initiated flow (AuthnRequest via redirect binding,
// assertion via POST binding to the ACS), but treat it as unverified scaffolding: run a real
// SSO login against a real IdP in your own environment before relying on it in production.

function baseUrl(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(requestUrl).origin;
}

export function samlEntityId(requestUrl: string) {
  return `${baseUrl(requestUrl)}/api/keelconnect/saml/metadata`;
}

export function samlAcsUrl(requestUrl: string) {
  return `${baseUrl(requestUrl)}/api/keelconnect/saml/acs`;
}

// The one shared SP. wantAssertionsSigned is left at samlify's default (true) -- we require
// the IdP to sign assertions, since KeelConnect is deciding account access based on the
// assertion's contents. No SP-side private key is configured, so outbound AuthnRequests are
// unsigned; that's an acceptable default for SP-initiated redirect binding (the IdP is not
// relying on the request's authenticity, only on its own response), but an org that requires
// signed AuthnRequests would need an SP private key added here.
export function buildServiceProvider(requestUrl: string): ServiceProviderInstance {
  return samlify.ServiceProvider({
    entityID: samlEntityId(requestUrl),
    assertionConsumerService: [
      {
        Binding: samlify.Constants.namespace.binding.post,
        Location: samlAcsUrl(requestUrl),
      },
    ],
  });
}

type OrgSamlConfig = Pick<typeof scOrganizations.$inferSelect, "samlEntityId" | "samlIdpMetadataUrl" | "samlIdpCert">;

// Builds the org's IdP from its metadata URL -- the metadata document itself carries the
// IdP's entityID, SSO redirect endpoint, and signing certificate, which is the standard way
// enterprise IdPs (Okta, Azure AD, OneLogin...) hand off configuration. samlEntityId and
// samlIdpCert are kept as separate columns for admin-facing display/verification (so an admin
// can visually confirm the fetched metadata matches what the IdP's admin console shows them)
// rather than being required inputs to this function.
export async function buildIdentityProvider(org: OrgSamlConfig): Promise<IdentityProviderInstance | null> {
  if (!org.samlIdpMetadataUrl) return null;
  const res = await fetch(org.samlIdpMetadataUrl);
  if (!res.ok) return null;
  const metadata = await res.text();
  return samlify.IdentityProvider({ metadata });
}

export { samlify };
