"use client";

import { useEffect, useState } from "react";
import "./ai-chat.css";

interface AIFabProps {
    onClick: () => void;
    isOpen?: boolean;
}

export function AIFab({ onClick, isOpen }: AIFabProps) {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        let rafId: number | null = null;

        const update = () => {
            rafId = null;
            // Share page uses document-level scroll; also check scrollingElement
            // for embedded/iframe contexts where window.scrollY may stay 0.
            const scrollTop = Math.max(
                window.scrollY,
                document.scrollingElement?.scrollTop ?? 0,
            );
            const scrollEl = document.scrollingElement ?? document.documentElement;
            const docHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
            const ratio = docHeight > 0 ? scrollTop / docHeight : 0;
            setHidden(ratio > 0.4);
        };

        const onScroll = () => {
            if (rafId != null) return;
            rafId = window.requestAnimationFrame(update);
        };

        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);

        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            if (rafId != null) cancelAnimationFrame(rafId);
        };
    }, []);

    const shouldHide = hidden && !isOpen;

    return (
        <button
            type="button"
            className={`ai-fab${isOpen ? " is-open" : ""}`}
            onClick={onClick}
            aria-label={isOpen ? "Close AI assistant" : "Ask AI about this video"}
            style={{
                opacity: shouldHide ? 0 : 1,
                pointerEvents: shouldHide ? "none" : "auto",
                transition: "opacity 200ms ease",
            }}
        >
            {isOpen ? (
                <svg
                    className="orb"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            ) : (
                <svg
                    className="orb"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M12 3v2M12 19v2M5 12H3M21 12h-2" />
                    <path
                        d="M12 7.5 13.2 11l3.3 1-3.3 1L12 16.5 10.8 13l-3.3-1 3.3-1z"
                        fill="currentColor"
                        stroke="none"
                    />
                    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
            )}
        </button>
    );
}
