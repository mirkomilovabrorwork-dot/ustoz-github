"use client";
import { buildEnv } from "@cap/env";
import {
	Button,
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@cap/ui";
import { classNames } from "@cap/utils";
import {
	faBuilding,
	faCircleInfo,
	faLink,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import clsx from "clsx";
import { motion } from "framer-motion";
import { Check, ChevronDown, Moon, MoreVertical, Plus, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
	cloneElement,
	forwardRef,
	memo,
	type RefObject,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { NewOrganization } from "@/components/forms/NewOrganization";
import { SignedImageUrl } from "@/components/SignedImageUrl";
import { StorageIndicator } from "@/components/StorageIndicator";
import { Tooltip } from "@/components/Tooltip";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
	canViewOrganizationSettings,
	getEffectiveOrganizationRole,
} from "@/lib/permissions/roles";
import { useDashboardContext, useTheme } from "../../Contexts";
import {
	ArrowUpIcon,
	CapIcon,
	ChartLineIcon,
	CodeIcon,
	CogIcon,
	HomeIcon,
	ImportIcon,
	LogoutIcon,
	ReferIcon,
	RecordIcon,
	SettingsGearIcon,
} from "../AnimatedIcons";
import type { CogIconHandle } from "../AnimatedIcons/Cog";
import type { DownloadIconHandle } from "../AnimatedIcons/Download";
import { MemberAvatars } from "./MemberAvatars";
import SpacesList from "./SpacesList";
import { updateActiveOrganization } from "./server";

interface Props {
	toggleMobileNav?: () => void;
}

const AdminNavItems = ({ toggleMobileNav }: Props) => {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	const { user, sidebarCollapsed, userCapsCount } = useDashboardContext();

	const DEVELOPER_DASHBOARD_ALLOWED_EMAILS = ["richie@cap.so"];

	const showDeveloperDashboard =
		buildEnv.NEXT_PUBLIC_IS_CAP &&
		DEVELOPER_DASHBOARD_ALLOWED_EMAILS.includes(user.email);

	const manageNavigation = [
		{
			name: "Instructional recordings",
			href: `/dashboard/caps`,
			extraText: userCapsCount,
			icon: <CapIcon />,
			subNav: [],
		},
		{
			name: "Meeting Recordings",
			href: `/dashboard/meetings`,
			matchChildren: true,
			icon: <CapIcon />,
			subNav: [],
		},
		{
			name: "Analytics",
			href: `/dashboard/analytics`,
			matchChildren: true,
			icon: <ChartLineIcon />,
			subNav: [],
		},
		{
			name: "New Recording",
			href: `/dashboard/caps/record`,
			icon: <RecordIcon />,
			subNav: [],
		},
		{
			name: "Import Video",
			href: `/dashboard/import`,
			matchChildren: true,
			icon: <ImportIcon />,
			subNav: [],
		},
		{
			name: "Organization Settings",
			href: `/dashboard/settings/organization`,
			adminOnly: true,
			matchChildren: true,
			icon: <CogIcon />,
			subNav: [],
		},
		...(showDeveloperDashboard
			? [
					{
						name: "Developers",
						href: `/dashboard/developers`,
						ownerOnly: true,
						matchChildren: true,
						icon: <CodeIcon />,
						subNav: [] as { name: string; href: string }[],
					},
				]
			: []),
		...(user.isAdmin
			? [
					{
						name: "Access Management",
						href: `/dashboard/admin/access`,
						matchChildren: true,
						icon: <CogIcon />,
						subNav: [] as { name: string; href: string }[],
					},
				]
			: []),
	];

	const [dialogOpen, setDialogOpen] = useState(false);
	const { organizationData: orgData, activeOrganization: activeOrg } =
		useDashboardContext();
	const formRef = useRef<HTMLFormElement | null>(null);
	const [createLoading, setCreateLoading] = useState(false);
	const [organizationName, setOrganizationName] = useState("");
	const isOwner = activeOrg?.organization.ownerId === user.id;
	const currentMember = activeOrg?.members.find(
		(member) => member.userId === user.id,
	);
	const currentRole = getEffectiveOrganizationRole({
		userId: user.id,
		ownerId: activeOrg?.organization.ownerId,
		memberRole: currentMember?.role,
	});
	const canViewSettings = canViewOrganizationSettings(currentRole);
	const [_openAIDialog, _setOpenAIDialog] = useState(false);
	const router = useRouter();

	const isPathActive = (path: string, matchChildren: boolean = false) => {
		if (matchChildren) {
			return pathname === path || pathname.startsWith(`${path}/`);
		}

		return pathname === path;
	};

	const isDomainSetupVerified =
		activeOrg?.organization.customDomain &&
		activeOrg?.organization.domainVerified;

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			<Popover open={open} onOpenChange={setOpen}>
				<Tooltip
					disable={open || sidebarCollapsed === false}
					position="right"
					content={activeOrg?.organization.name ?? "No organization found"}
				>
					<PopoverTrigger suppressHydrationWarning asChild>
						<motion.div
							transition={{
								type: "easeInOut",
								duration: 0.2,
							}}
							className={clsx(
								"mt-1.5 mx-auto rounded-xl cursor-pointer bg-gray-3",
								sidebarCollapsed ? "w-fit px-2 py-0.5" : "w-full p-2.5",
							)}
						>
							<div
								className={clsx(
									"flex flex-col items-center cursor-pointer",
									sidebarCollapsed ? "justify-center" : "justify-between",
								)}
								role="combobox"
								aria-expanded={open}
								tabIndex={0}
							>
								<div
									className={clsx(
										"flex items-center",
										sidebarCollapsed
											? "justify-center w-fit"
											: "justify-between gap-2.5 w-full",
									)}
								>
									<div className="flex items-center">
										<SignedImageUrl
											image={activeOrg?.organization.iconUrl}
											name={
												activeOrg?.organization.name ?? "No organization found"
											}
											letterClass={clsx(
												sidebarCollapsed ? "text-sm" : "text-[13px]",
											)}
											className={clsx(
												"relative flex-shrink-0 mx-auto",
												sidebarCollapsed ? "size-6" : "size-7",
											)}
										/>
									</div>
									<div className="flex flex-col flex-1 items-center h-10">
										<div className="flex justify-between items-center w-full">
											{!sidebarCollapsed && (
												<p className="text-sm truncate leading-0 text-gray-12">
													{activeOrg?.organization.name ??
														"No organization found"}
												</p>
											)}
											{!sidebarCollapsed && (
												<ChevronDown
													data-state={open ? "open" : "closed"}
													className="size-4 transition-transform duration-200 text-gray-10 data-[state=open]:rotate-180"
												/>
											)}
										</div>
										{!sidebarCollapsed && (
											<Link
												href={
													isDomainSetupVerified
														? `https://${activeOrg.organization.customDomain}`
														: "/dashboard/settings/organization"
												}
												rel={
													isDomainSetupVerified
														? "noopener noreferrer"
														: undefined
												}
												target={isDomainSetupVerified ? "_blank" : "_self"}
												className="flex truncate w-full overflow-hidden flex-1 gap-1.5 items-center self-start"
											>
												<FontAwesomeIcon
													icon={isDomainSetupVerified ? faLink : faCircleInfo}
													className="duration-200 size-3 text-gray-10"
												/>
												<p className="w-full text-[11px] flex-1 duration-200 truncate leading-0 text-gray-11">
													{isDomainSetupVerified
														? activeOrg?.organization.customDomain
														: "No custom domain set"}
												</p>
											</Link>
										)}
									</div>
								</div>
							</div>
							<PopoverContent
								className={clsx(
									"p-0 w-full min-w-[287px] md:min-w-fit z-[120]",
									sidebarCollapsed ? "ml-3" : "mx-auto",
								)}
							>
								<Command>
									<CommandInput placeholder="Search organizations..." />
									<CommandEmpty>No organizations found</CommandEmpty>
									<CommandGroup>
										{orgData?.map((organization) => {
											const isSelected =
												activeOrg?.organization.id ===
												organization.organization.id;
											return (
												<CommandItem
													className={clsx(
														"rounded-lg transition-colors duration-300 group",
														isSelected
															? "pointer-events-none"
															: "text-gray-10 hover:text-gray-12 hover:bg-gray-6",
													)}
													key={`${organization.organization.name}-organization-${organization.organization.id}`}
													onSelect={async () => {
														await updateActiveOrganization(
															organization.organization.id,
														);
														setOpen(false);
														router.push("/dashboard/caps");
													}}
												>
													<div className="flex gap-2 items-center w-full">
														<SignedImageUrl
															image={organization.organization.iconUrl}
															name={organization.organization.name}
															letterClass="text-xs"
															className="relative flex-shrink-0 size-5"
														/>
														<p
															className={clsx(
																"flex-1 text-sm transition-colors duration-200 group-hover:text-gray-12",
																isSelected ? "text-gray-12" : "text-gray-10",
															)}
														>
															{organization.organization.name}
														</p>
													</div>
													{isSelected && (
														<Check
															size={18}
															className={"ml-auto text-gray-12"}
														/>
													)}
												</CommandItem>
											);
										})}
										<DialogTrigger asChild>
											<Button
												variant="dark"
												size="sm"
												className="flex gap-1 items-center my-2 w-[90%] mx-auto text-sm"
											>
												<Plus className="w-3.5 h-auto" />
												New organization
											</Button>
										</DialogTrigger>
									</CommandGroup>
								</Command>
							</PopoverContent>
						</motion.div>
					</PopoverTrigger>
				</Tooltip>
			</Popover>
			<MemberAvatars />
			<nav
				className="flex flex-col w-full min-h-full"
				aria-label="Sidebar"
			>
				<div
					className={clsx(
						"mt-5 shrink-0",
						sidebarCollapsed ? "flex flex-col justify-center items-center" : "",
					)}
				>
					{manageNavigation
						.filter((item) => !item.ownerOnly || isOwner)
						.filter((item) => !item.adminOnly || canViewSettings)
						.map((item) => (
							<div
								key={item.name}
								className="flex relative justify-center items-center mb-1.5 w-full"
							>
								{isPathActive(item.href, item.matchChildren ?? false) && (
									<motion.div
										animate={{
											width: sidebarCollapsed ? 36 : "100%",
										}}
										transition={{
											layout: {
												type: "tween",
												duration: 0.15,
											},
											width: {
												type: "tween",
												duration: 0.05,
											},
										}}
										layoutId="navlinks"
										className="absolute h-[36px] w-full rounded-xl pointer-events-none bg-gray-3"
									/>
								)}

								<NavItem
									name={item.name}
									href={item.href}
									icon={item.icon}
									sidebarCollapsed={sidebarCollapsed}
									toggleMobileNav={toggleMobileNav}
									isPathActive={isPathActive}
									extraText={item.extraText}
									matchChildren={item.matchChildren ?? false}
								/>
							</div>
						))}

					<SpacesList toggleMobileNav={() => toggleMobileNav?.()} />
				</div>
				<div className="pb-4 mt-auto w-full flex flex-col gap-2 shrink-0">
					<StorageIndicator />
					<SidebarUser />
				</div>
			</nav>
			<DialogContent className="p-0 w-full max-w-md rounded-xl bg-gray-2">
				<DialogHeader
					icon={<FontAwesomeIcon icon={faBuilding} />}
					description="A new organization to share caps with your team"
				>
					<DialogTitle className="text-lg text-gray-12">
						Create New Organization
					</DialogTitle>
				</DialogHeader>
				<div className="p-5">
					<NewOrganization
						setCreateLoading={setCreateLoading}
						onOrganizationCreated={() => setDialogOpen(false)}
						formRef={formRef}
						onNameChange={setOrganizationName}
					/>
				</div>
				<DialogFooter>
					<Button variant="gray" size="sm" onClick={() => setDialogOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="dark"
						size="sm"
						disabled={createLoading || !organizationName.trim().length}
						spinner={createLoading}
						onClick={() => formRef.current?.requestSubmit()}
						type="submit"
					>
						{createLoading ? "Creating..." : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

const SidebarUser = () => {
	const [menuOpen, setMenuOpen] = useState(false);
	const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
	const { user, sidebarCollapsed } = useDashboardContext();
	const { theme, setThemeHandler } = useTheme();
	const nextTheme = theme === "light" ? "dark" : "light";
	const themeLabel =
		theme === "light" ? "Toggle Dark Mode" : "Toggle Light Mode";

	const menuItems = useMemo(
		() => [
			{
				name: "Homepage",
				icon: <HomeIcon />,
				href: "/dashboard/caps",
				onClick: () => setMenuOpen(false),
				iconClassName: "text-gray-11 group-hover:text-gray-12",
				showCondition: true,
			},
			{
				name: "Upgrade to Pro",
				icon: <ArrowUpIcon />,
				onClick: () => {
					setMenuOpen(false);
					setUpgradeModalOpen(true);
				},
				iconClassName: "text-amber-400 group-hover:text-amber-500",
				showCondition: buildEnv.NEXT_PUBLIC_IS_CAP && !user.isPro,
			},
			{
				name: "Earn 40% Referral",
				icon: <ReferIcon />,
				href: "/dashboard/refer",
				onClick: () => setMenuOpen(false),
				iconClassName: "text-gray-11 group-hover:text-gray-12",
				showCondition: buildEnv.NEXT_PUBLIC_IS_CAP,
			},
			{
				name: themeLabel,
				icon: <SidebarThemeMenuIcon />,
				onClick: () => {
					setMenuOpen(false);
					if (document.startViewTransition) {
						document.startViewTransition(() => {
							setThemeHandler(nextTheme);
						});
					} else {
						setThemeHandler(nextTheme);
					}
				},
				iconClassName: "text-gray-11 group-hover:text-gray-12",
				showCondition: true,
			},
			{
				name: "Settings",
				icon: <SettingsGearIcon />,
				href: "/dashboard/settings/account",
				onClick: () => setMenuOpen(false),
				iconClassName: "text-gray-11 group-hover:text-gray-12",
				showCondition: true,
			},
			{
				name: "Sign Out",
				icon: <LogoutIcon />,
				onClick: () => {
					setMenuOpen(false);
					signOut();
				},
				iconClassName: "text-gray-11 group-hover:text-gray-12",
				showCondition: true,
			},
		],
		[nextTheme, setThemeHandler, themeLabel, user.isPro],
	);

	return (
		<>
			<UpgradeModal
				open={upgradeModalOpen}
				onOpenChange={setUpgradeModalOpen}
			/>
			<Tooltip
				disable={!sidebarCollapsed}
				content={user.name ?? "User"}
				position="right"
			>
				<Popover open={menuOpen} onOpenChange={setMenuOpen}>
					<PopoverTrigger asChild>
						<div
							data-state={menuOpen ? "open" : "closed"}
							className={clsx(
								"flex items-center rounded-xl border cursor-pointer transition-colors",
								"data-[state=open]:border-gray-3 data-[state=open]:bg-gray-3 border-transparent hover:border-gray-3 hover:bg-gray-3",
								sidebarCollapsed
									? "justify-center p-1.5"
									: "gap-2 justify-between p-2",
							)}
						>
							<div className="flex items-center gap-2">
								<SignedImageUrl
									image={user.imageUrl}
									name={user.name ?? "User"}
									letterClass="text-xs"
									className="flex-shrink-0 size-6 text-gray-12"
								/>
								{!sidebarCollapsed && (
									<span className="text-sm truncate text-gray-12">
										{user.name ?? "User"}
									</span>
								)}
							</div>
							{!sidebarCollapsed && (
								<MoreVertical
									data-state={menuOpen ? "open" : "closed"}
									className="w-4 h-4 data-[state=open]:text-gray-12 transition-colors text-gray-10 group-hover:text-gray-12"
								/>
							)}
						</div>
					</PopoverTrigger>
					<PopoverContent
						className={clsx(
							"p-1 w-48",
							sidebarCollapsed ? "ml-3" : "mx-auto",
						)}
						side="top"
						align="start"
					>
						<Command>
							<CommandGroup>
								{menuItems
									.filter((item) => item.showCondition)
									.map((item, index) => (
										<SidebarMenuItem
											key={index.toString()}
											icon={item.icon}
											name={item.name}
											href={"href" in item ? item.href : undefined}
											onClick={item.onClick}
											iconClassName={item.iconClassName}
										/>
									))}
							</CommandGroup>
						</Command>
					</PopoverContent>
				</Popover>
			</Tooltip>
		</>
	);
};

interface SidebarMenuItemProps {
	icon: React.ReactElement<{
		ref: RefObject<DownloadIconHandle | null>;
		className: string;
		size: number;
	}>;
	name: string;
	href?: string;
	onClick: () => void;
	iconClassName?: string;
}

const SidebarMenuItem = memo(
	({ icon, name, href, onClick, iconClassName }: SidebarMenuItemProps) => {
		const iconRef = useRef<DownloadIconHandle>(null);
		const content = (
			<>
				<div className="flex flex-shrink-0 justify-center items-center w-3.5 h-3.5">
					{cloneElement(icon, {
						ref: iconRef,
						className: iconClassName,
						size: 14,
					})}
				</div>
				<p className={clsx("text-sm text-gray-12")}>{name}</p>
			</>
		);

		return (
			<CommandItem
				key={name}
				className="px-2 py-1.5 rounded-lg transition-colors duration-300 cursor-pointer hover:bg-gray-5 group"
				onSelect={onClick}
				onMouseEnter={() => {
					iconRef.current?.startAnimation();
				}}
				onMouseLeave={() => {
					iconRef.current?.stopAnimation();
				}}
			>
				{href ? (
					<Link
						className="flex gap-2 items-center w-full"
						href={href}
						prefetch={true}
						onClick={onClick}
					>
						{content}
					</Link>
				) : (
					<div className="flex gap-2 items-center w-full">{content}</div>
				)}
			</CommandItem>
		);
	},
);

SidebarMenuItem.displayName = "SidebarMenuItem";

const SidebarThemeMenuIcon = forwardRef<
	DownloadIconHandle,
	{ className?: string; size?: number }
>(({ className, size = 14 }, ref) => {
	const { theme } = useTheme();
	const Icon = theme === "light" ? Moon : Sun;

	useImperativeHandle(ref, () => ({
		startAnimation: () => undefined,
		stopAnimation: () => undefined,
	}));

	return <Icon className={className} size={size} />;
});

SidebarThemeMenuIcon.displayName = "SidebarThemeMenuIcon";

const NavItem = ({
	name,
	href,
	icon,
	sidebarCollapsed,
	toggleMobileNav,
	isPathActive,
	matchChildren,
	extraText,
}: {
	name: string;
	href: string;
	icon: React.ReactElement<{
		ref: RefObject<CogIconHandle | null>;
		className: string;
		size: number;
	}>;
	sidebarCollapsed: boolean;
	toggleMobileNav?: () => void;
	isPathActive: (path: string, matchChildren: boolean) => boolean;
	extraText: number | null | undefined;
	matchChildren: boolean;
}) => {
	const iconRef = useRef<CogIconHandle>(null);
	return (
		<Tooltip disable={!sidebarCollapsed} content={name} position="right">
			<Link
				href={href}
				onClick={() => toggleMobileNav?.()}
				onMouseEnter={() => {
					iconRef.current?.startAnimation();
				}}
				onMouseLeave={() => {
					iconRef.current?.stopAnimation();
				}}
				prefetch={true}
				passHref
				className={classNames(
					"relative border border-transparent transition z-3",
					sidebarCollapsed
						? "flex justify-center items-center px-0 w-full size-9"
						: "px-3 py-2 w-full",
					isPathActive(href, matchChildren)
						? "bg-transparent pointer-events-none"
						: "hover:bg-gray-2",
					"flex overflow-hidden justify-start items-center tracking-tight rounded-xl outline-none",
				)}
			>
				{cloneElement(icon, {
					ref: iconRef,
					className: clsx(
						sidebarCollapsed ? "text-gray-12 mx-auto" : "text-gray-10",
					),
					size: sidebarCollapsed ? 18 : 16,
				})}
				<p
					className={clsx(
						"text-sm text-gray-12 truncate",
						sidebarCollapsed ? "hidden" : "ml-2.5",
					)}
				>
					{name}
				</p>
				{extraText !== null && !sidebarCollapsed && (
					<p className="ml-auto text-xs font-medium text-gray-11">
						{extraText}
					</p>
				)}
			</Link>
		</Tooltip>
	);
};

export default AdminNavItems;
