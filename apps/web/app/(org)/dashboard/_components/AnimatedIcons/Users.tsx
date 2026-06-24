"use client";

import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface UsersIconHandle {
	startAnimation: () => void;
	stopAnimation: () => void;
}

interface UsersIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number;
}

const UsersIcon = forwardRef<UsersIconHandle, UsersIconProps>(
	({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
		const controls = useAnimation();
		const isControlledRef = useRef(false);

		useImperativeHandle(ref, () => {
			isControlledRef.current = true;

			return {
				startAnimation: () => controls.start("animate"),
				stopAnimation: () => controls.start("normal"),
			};
		});

		const handleMouseEnter = useCallback(
			(e: React.MouseEvent<HTMLDivElement>) => {
				if (!isControlledRef.current) {
					controls.start("animate");
				} else {
					onMouseEnter?.(e);
				}
			},
			[controls, onMouseEnter],
		);

		const handleMouseLeave = useCallback(
			(e: React.MouseEvent<HTMLDivElement>) => {
				if (!isControlledRef.current) {
					controls.start("normal");
				} else {
					onMouseLeave?.(e);
				}
			},
			[controls, onMouseLeave],
		);

		return (
			<div
				className={cn(className)}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				{...props}
			>
				<motion.svg
					width={size}
					height={size}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					xmlns="http://www.w3.org/2000/svg"
					variants={{
						normal: { scale: 1 },
						animate: { scale: [1, 1.12, 1] },
					}}
					initial="normal"
					animate={controls}
					transition={{ duration: 0.5, ease: "easeInOut" }}
				>
					<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
					<path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</motion.svg>
			</div>
		);
	},
);

UsersIcon.displayName = "UsersIcon";

export default UsersIcon;
