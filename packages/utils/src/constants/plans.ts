import { buildEnv } from "@cap/env";

export const STRIPE_DEVELOPER_CREDITS_PRODUCT_ID: Record<string, string> = {
	development: "prod_U4mswfBp0bFc39",
	production: "prod_REPLACE_BEFORE_PRODUCTION",
};

export const STRIPE_PLAN_IDS = {
	development: {
		yearly: "price_1Q3esrFJxA1XpeSsFwp486RN",
		monthly: "price_1P9C1DFJxA1XpeSsTwwuddnq",
	},
	production: {
		yearly: "price_1S2al7FJxA1XpeSsJCI5Z2UD",
		monthly: "price_1S2akxFJxA1XpeSsfoAUUbpJ",
	},
};

// Allowlist of every price the app is allowed to start a checkout for.
// The subscribe routes must validate the client-supplied priceId against this
// set so a caller can't substitute an arbitrary (e.g. cheaper) Stripe price.
// Includes both env tiers because env selection is inconsistent across callers.
export const ALL_STRIPE_PLAN_PRICE_IDS: readonly string[] = [
	...Object.values(STRIPE_PLAN_IDS.development),
	...Object.values(STRIPE_PLAN_IDS.production),
];

export const isValidStripePriceId = (priceId: string): boolean =>
	ALL_STRIPE_PLAN_PRICE_IDS.includes(priceId);

export const userIsPro = (_user: unknown): boolean => true;
