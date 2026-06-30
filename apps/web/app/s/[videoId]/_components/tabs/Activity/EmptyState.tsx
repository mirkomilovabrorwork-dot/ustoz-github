import type { FontAwesomeIconProps } from "@fortawesome/react-fontawesome";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import React from "react";

const EmptyState = ({
	commentsDisabled,
	icon,
}: {
	commentsDisabled?: boolean;
	icon?: ReactElement<FontAwesomeIconProps>;
}) => {
	const t = useTranslations("share");

	return (
		<div className="flex flex-col justify-center items-center p-8 h-full text-center animate-in fade-in">
			{icon && (
				<div className="mb-4">
					{React.cloneElement(icon, { className: "text-gray-12 size-8" })}
				</div>
			)}
			<div className="space-y-1">
				<h3 className="text-base font-medium text-gray-12">
					{commentsDisabled ? t("commentsDisabledTitle") : t("noActivityYet")}
				</h3>
				<p className="text-sm text-gray-10">
					{commentsDisabled
						? t("commentsDisabledDesc")
						: t("beFirstToShare")}
				</p>
			</div>
		</div>
	);
};

export default EmptyState;
