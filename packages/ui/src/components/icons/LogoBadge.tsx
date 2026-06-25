export const LogoBadge = ({ className }: { className: string }) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			fill="none"
			viewBox="0 0 40 40"
			preserveAspectRatio="xMidYMid meet"
			style={{
				aspectRatio: "1 / 1",
			}}
		>
			<rect width="40" height="40" rx="11" fill="#1f74e6"></rect>
			<circle
				cx="20"
				cy="20"
				r="9"
				fill="none"
				stroke="#fff"
				strokeWidth="2"
			></circle>
			<path fill="#fff" d="M17.8 16.4 24 20 17.8 23.6Z"></path>
		</svg>
	);
};
