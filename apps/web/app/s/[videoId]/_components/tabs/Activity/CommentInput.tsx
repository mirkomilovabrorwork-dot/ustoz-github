import { Button } from "@cap/ui";
import { useTranslations } from "next-intl";
import type React from "react";
import { useEffect, useRef, useState } from "react";

interface CommentInputProps {
	onSubmit?: (content: string) => void;
	onCancel?: () => void;
	placeholder?: string;
	showCancelButton?: boolean;
	buttonLabel?: string;
	autoFocus?: boolean;
	disabled?: boolean;
	defaultValue?: string;
	showNameInput?: boolean;
	name?: string;
	onNameChange?: (v: string) => void;
}

const CommentInput: React.FC<CommentInputProps> = ({
	onSubmit,
	onCancel,
	placeholder,
	showCancelButton = false,
	buttonLabel,
	autoFocus = false,
	disabled,
	defaultValue = "",
	showNameInput = false,
	name = "",
	onNameChange,
}) => {
	const t = useTranslations("share");
	const [content, setContent] = useState(defaultValue);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (autoFocus && inputRef.current) {
			inputRef.current.focus();
		}
	}, [autoFocus]);

	const isNameRequired = showNameInput && name.trim() === "";

	const handleSubmit = (e?: React.FormEvent) => {
		e?.preventDefault();
		if (content.trim() && !isNameRequired) {
			onSubmit?.(content);
			setContent("");
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	return (
		<div className="flex items-start space-x-3">
			<div className="flex-1">
				{showNameInput && (
					<div className="mb-2 p-2 rounded-lg border bg-gray-1 border-gray-5">
						<input
							type="text"
							value={name}
							onChange={(e) => onNameChange?.(e.target.value)}
							placeholder={t("yourName")}
							maxLength={50}
							className="w-full placeholder:text-gray-8 text-sm leading-[22px] text-gray-12 bg-transparent focus:outline-none"
						/>
					</div>
				)}
				<div className="p-2 rounded-lg border bg-gray-1 border-gray-5">
					<textarea
						ref={inputRef}
						data-comment-input
						value={content}
						disabled={disabled}
						onChange={(e) => setContent(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={placeholder || t("leaveACommentDefault")}
						className="w-full placeholder:text-gray-8 text-sm leading-[22px] text-gray-12 bg-transparent focus:outline-none"
					/>
					<div className="flex items-center mt-2 space-x-2">
						<Button
							size="xs"
							variant="primary"
							onClick={() => handleSubmit()}
							disabled={!content || isNameRequired}
						>
							{buttonLabel ?? t("replyTooltip")}
						</Button>
						{showCancelButton && onCancel && (
							<Button size="xs" variant="outline" onClick={onCancel}>
								{t("cancel")}
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default CommentInput;
