"use client";

import { Button, Input, Label, Select } from "@cap/ui";
import type { Organisation } from "@cap/web-domain";
import { ChevronRightIcon, DatabaseIcon, InfoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	type OrganizationStorageSettings,
	removeOrganizationS3Config,
	saveOrganizationS3Config,
	testOrganizationS3Config,
} from "@/actions/organization/storage";
import { useDashboardContext } from "@/app/(org)/dashboard/Contexts";

const defaultS3Config = {
	provider: "aws",
	accessKeyId: "",
	secretAccessKey: "",
	endpoint: "https://s3.amazonaws.com",
	bucketName: "",
	region: "us-east-1",
};

const s3ProviderOptions = [
	{ value: "aws", label: "AWS S3" },
	{ value: "cloudflare", label: "Cloudflare R2" },
	{ value: "supabase", label: "Supabase" },
	{ value: "minio", label: "MinIO" },
	{ value: "other", label: "Other S3-Compatible" },
];

const proRequiredMessage =
	"data365 Pro is required to manage organization integrations";

const getOrganizationId = (settings: OrganizationStorageSettings) =>
	settings.organization.id as Organisation.OrganisationId;

function StatusBadge({
	configured,
	active,
}: {
	configured: boolean;
	active: boolean;
}) {
	if (active) {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-green-500/10 text-green-600">
				<span className="size-1.5 rounded-full bg-green-500" />
				Active
			</span>
		);
	}

	if (configured) {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-blue-500/10 text-blue-600">
				<span className="size-1.5 rounded-full bg-blue-500" />
				Connected
			</span>
		);
	}

	return (
		<span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md bg-gray-3 text-gray-11">
			Not configured
		</span>
	);
}

export function OrganizationStorageIntegrations({
	initialSettings,
}: {
	initialSettings: OrganizationStorageSettings;
}) {
	const router = useRouter();
	const { user, setUpgradeModalOpen } = useDashboardContext();
	const [settings, setSettings] = useState(initialSettings);
	const [s3Config, setS3Config] = useState(
		initialSettings.s3 ?? defaultS3Config,
	);
	const [isPending, startTransition] = useTransition();
	const [expandedIntegration, setExpandedIntegration] = useState<
		"s3" | null
	>(null);
	const organizationId = getOrganizationId(settings);
	const regionId = useId();
	const bucketId = useId();
	const endpointId = useId();
	const accessKeyId = useId();
	const secretKeyId = useId();

	useEffect(() => {
		setSettings(initialSettings);
		setS3Config(initialSettings.s3 ?? defaultS3Config);
	}, [initialSettings]);

	const requirePro = () => {
		if (user.isPro) return true;
		setUpgradeModalOpen(true);
		return false;
	};

	const runMutation = (
		action: () => Promise<unknown>,
		successMessage: string,
	) => {
		if (!requirePro()) return;

		startTransition(async () => {
			try {
				await action();
				toast.success(successMessage);
				router.refresh();
			} catch (error) {
				if (error instanceof Error && error.message === proRequiredMessage) {
					setUpgradeModalOpen(true);
					return;
				}

				toast.error(error instanceof Error ? error.message : "Request failed");
			}
		});
	};

	const saveS3 = () =>
		runMutation(
			() =>
				saveOrganizationS3Config({
					organizationId,
					provider: s3Config.provider,
					accessKeyId: s3Config.accessKeyId,
					secretAccessKey: s3Config.secretAccessKey,
					endpoint: s3Config.endpoint,
					bucketName: s3Config.bucketName,
					region: s3Config.region,
				}),
			"S3 configuration saved",
		);

	const testS3 = () =>
		runMutation(
			() =>
				testOrganizationS3Config({
					organizationId,
					provider: s3Config.provider,
					accessKeyId: s3Config.accessKeyId,
					secretAccessKey: s3Config.secretAccessKey,
					endpoint: s3Config.endpoint,
					bucketName: s3Config.bucketName,
					region: s3Config.region,
				}),
			"S3 connection verified",
		);

	const toggleExpand = (integration: "s3") => {
		if (!requirePro()) return;

		setExpandedIntegration((prev) =>
			prev === integration ? null : integration,
		);
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2 px-1">
				<InfoIcon className="size-3.5 text-gray-11 shrink-0" />
				<p className="text-[13px] text-gray-11">
					Storage applies to all members of {settings.organization.name}. Admins
					and owners can manage integrations.
				</p>
			</div>

			<div className="rounded-xl border border-gray-3 overflow-hidden">
				<button
					type="button"
					onClick={() => toggleExpand("s3")}
					className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-gray-2 transition-colors cursor-pointer"
				>
					<DatabaseIcon className="size-4 shrink-0 text-gray-10" />
					<span className="flex-1 text-[13px] font-medium text-gray-12">
						S3-Compatible Storage
					</span>
					<StatusBadge
						configured={!!settings.s3?.configured}
						active={settings.activeProvider === "s3"}
					/>
					<ChevronRightIcon
						className={`size-3.5 text-gray-8 transition-transform duration-150 shrink-0 ${
							expandedIntegration === "s3" ? "rotate-90" : ""
						}`}
					/>
				</button>

				{expandedIntegration === "s3" && (
					<div className="border-t border-gray-3 px-3.5 py-4">
						<p className="text-[12px] text-gray-10 mb-4">
							Connect your own bucket for full control.{" "}
							<a
								href="#"
								target="_blank"
								rel="noopener noreferrer"
								className="underline text-gray-12 hover:text-gray-11"
							>
								Setup guide
							</a>
						</p>
						<div className="grid gap-3 md:grid-cols-2">
							<div className="flex flex-col gap-1">
								<Label className="text-[11px]">Provider</Label>
								<Select
									value={s3Config.provider}
									onValueChange={(value) =>
										setS3Config((current) => ({
											...current,
											provider: value,
										}))
									}
									placeholder="Select provider"
									options={s3ProviderOptions}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor={accessKeyId} className="text-[11px]">
									Access Key ID
								</Label>
								<Input
									id={accessKeyId}
									type="password"
									value={s3Config.accessKeyId}
									placeholder={
										settings.s3?.configured ? "Stored securely" : "PL31OADSQNK"
									}
									autoComplete="off"
									onChange={(event) =>
										setS3Config((current) => ({
											...current,
											accessKeyId: event.target.value,
										}))
									}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor={secretKeyId} className="text-[11px]">
									Secret Access Key
								</Label>
								<Input
									id={secretKeyId}
									type="password"
									value={s3Config.secretAccessKey}
									placeholder={
										settings.s3?.configured ? "Stored securely" : "PL31OADSQNK"
									}
									autoComplete="off"
									onChange={(event) =>
										setS3Config((current) => ({
											...current,
											secretAccessKey: event.target.value,
										}))
									}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor={endpointId} className="text-[11px]">
									Endpoint
								</Label>
								<Input
									id={endpointId}
									value={s3Config.endpoint}
									placeholder="https://s3.amazonaws.com"
									onChange={(event) =>
										setS3Config((current) => ({
											...current,
											endpoint: event.target.value,
										}))
									}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor={bucketId} className="text-[11px]">
									Bucket Name
								</Label>
								<Input
									id={bucketId}
									value={s3Config.bucketName}
									placeholder="my-bucket"
									onChange={(event) =>
										setS3Config((current) => ({
											...current,
											bucketName: event.target.value,
										}))
									}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label htmlFor={regionId} className="text-[11px]">
									Region
								</Label>
								<Input
									id={regionId}
									value={s3Config.region}
									placeholder="us-east-1"
									onChange={(event) =>
										setS3Config((current) => ({
											...current,
											region: event.target.value,
										}))
									}
								/>
							</div>
						</div>
						<div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-3">
							<Button
								type="button"
								size="xs"
								onClick={saveS3}
								disabled={isPending}
							>
								Save
							</Button>
							<Button
								type="button"
								size="xs"
								variant="gray"
								onClick={testS3}
								disabled={isPending}
							>
								Test
							</Button>
							{settings.s3?.configured && (
								<Button
									type="button"
									size="xs"
									variant="destructive"
									onClick={() =>
										runMutation(
											() => removeOrganizationS3Config(organizationId),
											"S3 configuration removed",
										)
									}
									disabled={isPending}
								>
									Remove
								</Button>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
