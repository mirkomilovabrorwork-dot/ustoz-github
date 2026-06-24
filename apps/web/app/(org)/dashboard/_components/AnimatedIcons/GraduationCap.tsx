"use client";

import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface GraduationCapIconHandle {
	startAnimation: () => void;
	stopAnimation: () => void;
}

interface GraduationCapIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number;
}

const GraduationCapIcon = forwardRef<
	GraduationCapIconHandle,
	GraduationCapIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
					normal: { y: 0 },
					animate: { y: [0, -2.5, 0] },
				}}
				initial="normal"
				animate={controls}
				transition={{ duration: 0.6, ease: "easeInOut" }}
			>
				<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
				<path d="M22 10v6" />
				<path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
			</motion.svg>
		</div>
	);
});

GraduationCapIcon.displayName = "GraduationCapIcon";

export default GraduationCapIcon;
