import { db } from "@cap/database";
import { auditLog } from "@cap/database/schema";

export async function recordAudit(params: {
	orgId?: string;
	actorUserId?: string;
	action: string;
	entityType: string;
	entityId?: string;
	metadata?: Record<string, unknown>;
}) {
	try {
		await db().insert(auditLog).values(params);
	} catch {}
}
