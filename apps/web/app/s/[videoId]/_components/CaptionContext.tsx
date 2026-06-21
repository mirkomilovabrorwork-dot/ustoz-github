"use client";

import type { Video } from "@cap/web-domain";
import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";

export type CaptionLanguage = "original" | "off";

interface CaptionContextValue {
	selectedLanguage: CaptionLanguage;
	setSelectedLanguage: (language: CaptionLanguage) => void;
	currentVttContent: string | null;
	setOriginalVttContent: (content: string | null) => void;
}

const CaptionContext = createContext<CaptionContextValue | null>(null);

interface CaptionProviderProps {
	children: ReactNode;
	videoId: Video.VideoId;
	transcriptionStatus?: string | null;
}

export function CaptionProvider({
	children,
}: CaptionProviderProps) {
	const [selectedLanguage, setSelectedLanguage] =
		useState<CaptionLanguage>("original");
	const [originalVttContent, setOriginalVttContent] = useState<string | null>(
		null,
	);

	const currentVttContent = useMemo(() => {
		if (selectedLanguage === "off") {
			return null;
		}
		return originalVttContent;
	}, [selectedLanguage, originalVttContent]);

	const value: CaptionContextValue = useMemo(
		() => ({
			selectedLanguage,
			setSelectedLanguage,
			currentVttContent,
			setOriginalVttContent,
		}),
		[selectedLanguage, currentVttContent],
	);

	return (
		<CaptionContext.Provider value={value}>{children}</CaptionContext.Provider>
	);
}

export function useCaptionContext(): CaptionContextValue {
	const context = useContext(CaptionContext);
	if (!context) {
		throw new Error("useCaptionContext must be used within a CaptionProvider");
	}
	return context;
}

export function useCaptionContextOptional(): CaptionContextValue | null {
	return useContext(CaptionContext);
}
