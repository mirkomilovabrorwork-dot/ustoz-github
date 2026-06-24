export const Logo = ({
	className,
	showVersion,
	showBeta,
	white,
	hideLogoName,
	viewBoxDimensions = "0 0 120 40",
	style,
}: {
	className?: string;
	showVersion?: boolean;
	showBeta?: boolean;
	white?: boolean;
	hideLogoName?: boolean;
	style?: React.CSSProperties;
	viewBoxDimensions?: `${string} ${string} ${string} ${string}`;
}) => {
	return (
		<div className="flex items-center">
			<svg
				viewBox={viewBoxDimensions}
				xmlns="http://www.w3.org/2000/svg"
				preserveAspectRatio="xMidYMid meet"
				fill="none"
				style={style}
				aria-label="data365 Logo"
				className={className}
			>
				{/* <rect
          width="39.5"
          height="39.5"
          x="0.25"
          y="0.25"
          fill="#fff"
          rx="7.75"
        ></rect> */}
				{/* <rect
          width="39.5"
          height="39.5"
          x="0.25"
          y="0.25"
          stroke="#E7EAF0"
          strokeWidth="0.5"
          rx="7.75"
        ></rect> */}
				<path
					fill="#4785FF"
					d="M20 36c8.837 0 16-7.163 16-16 0-8.836-7.163-16-16-16-8.836 0-16 7.164-16 16 0 8.837 7.164 16 16 16z"
				/>
				<path
					fill="#ADC9FF"
					d="M20 33c7.18 0 13-5.82 13-13S27.18 7 20 7 7 12.82 7 20s5.82 13 13 13z"
				/>
				<path
					fill="#fff"
					d="M20 30c5.523 0 10-4.477 10-10s-4.477-10-10-10-10 4.477-10 10 4.477 10 10 10z"
				/>
				{!hideLogoName && (
					<text
						x="44"
						y="28"
						fontSize="19"
						fontWeight="600"
						letterSpacing="-0.5"
						fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
						className={`${white ? "fill-white" : "fill-gray-12"}`}
						fill={white ? "#ffffff" : "#12161F"}
					>
						data365
					</text>
				)}
			</svg>
			{showVersion && (
				<span
					className={`text-[10px] font-medium ${
						white ? "text-white" : "text-gray-1"
					}`}
				>
					v{process.env.appVersion}
				</span>
			)}
			{showBeta && (
				<span
					className={`text-[10px] font-medium min-w-[52px] ${
						white ? "text-white" : "text-gray-1"
					}`}
				>
					Beta v{process.env.appVersion}
				</span>
			)}
		</div>
	);
};
