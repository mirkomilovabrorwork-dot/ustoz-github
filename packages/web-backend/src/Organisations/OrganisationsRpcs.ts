import { InternalError, Organisation, Policy } from "@cap/web-domain";
import { Effect } from "effect";
import { Organisations } from ".";

export const OrganisationsRpcsLive = Organisation.OrganisationRpcs.toLayer(
	Effect.gen(function* () {
		const orgs = yield* Organisations;

		return {
			OrganisationUpdate: (data) =>
				orgs.update(data).pipe(
					Effect.mapError(
						(
							e,
						): InternalError | Organisation.NotFoundError | Policy.PolicyDeniedError => {
							if (e instanceof Organisation.NotFoundError) return e;
							if (e instanceof Policy.PolicyDeniedError) return e;
							if (e instanceof InternalError) return e;
							return new InternalError({ type: "unknown" });
						},
					),
				),
			OrganisationSoftDelete: (data) =>
				orgs.softDelete(data.id).pipe(
					Effect.mapError(
						(
							e,
						): InternalError | Organisation.NotFoundError | Policy.PolicyDeniedError => {
							if (e instanceof Organisation.NotFoundError) return e;
							if (e instanceof Policy.PolicyDeniedError) return e;
							if (e instanceof InternalError) return e;
							return new InternalError({ type: "database" });
						},
					),
				),
		};
	}),
);
