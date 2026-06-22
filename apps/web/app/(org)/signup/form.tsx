"use client";

import { LogoBadge } from "@cap/ui";
import { motion } from "framer-motion";
import Cookies from "js-cookie";
import Link from "next/link";
import { useEffect } from "react";

const MotionLogoBadge = motion(LogoBadge);
const MotionLink = motion(Link);

export function SignupForm() {
	const theme = Cookies.get("theme") || "light";

	useEffect(() => {
		document.body.className = theme === "dark" ? "dark" : "light";
		return () => {
			document.body.className = "light";
		};
	}, [theme]);

	return (
		<motion.div
			layout
			transition={{
				layout: { duration: 0.3, ease: "easeInOut" },
				height: { duration: 0.3, ease: "easeInOut" },
			}}
			className="overflow-hidden relative w-[calc(100%-32px)] p-[28px] max-w-[432px] bg-gray-3 border border-gray-5 rounded-2xl"
		>
			<MotionLink layout="position" className="flex mx-auto size-fit" href="/">
				<MotionLogoBadge layout="position" className="w-[72px] h-[72px]" />
			</MotionLink>
			<motion.div
				layout="position"
				className="flex flex-col justify-center items-center my-7 text-left"
			>
				<motion.h1
					key="title"
					layout="position"
					className="text-2xl font-semibold text-gray-12"
				>
					Sign up to 365
				</motion.h1>
				<motion.p
					key="subtitle"
					layout="position"
					className="text-[16px] text-gray-10 mt-2 text-center"
				>
					Signup is by invitation only. Ask your admin for an invite link.
				</motion.p>
			</motion.div>
			<motion.div layout="position" className="flex flex-col space-y-3 px-1">
				<motion.p
					layout="position"
					className="text-xs text-center text-gray-11"
				>
					Already have an account?{" "}
					<Link
						href="/login"
						className="text-xs font-semibold text-blue-9 hover:text-blue-8"
					>
						Log in here
					</Link>
				</motion.p>
			</motion.div>
		</motion.div>
	);
}
