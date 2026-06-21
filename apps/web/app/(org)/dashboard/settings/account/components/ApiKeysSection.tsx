"use client";

import { Button, Card, CardDescription, CardTitle, Input } from "@cap/ui";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmationDialog } from "@/app/(org)/dashboard/_components/ConfirmationDialog";
import { deleteGeminiKey } from "@/actions/account/delete-gemini-key";
import { getGeminiKeyStatus } from "@/actions/account/get-gemini-key-status";
import { saveGeminiKey } from "@/actions/account/save-gemini-key";
import { testGeminiKey } from "@/actions/account/test-gemini-key";

export const ApiKeysSection = () => {
	const [inputValue, setInputValue] = useState("");
	const [showKey, setShowKey] = useState(false);
	const [hasKey, setHasKey] = useState(false);
	const [lastFour, setLastFour] = useState("");
	const [testResult, setTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);
	const [testing, setTesting] = useState(false);
	const [saving, setSaving] = useState(false);
	const [removing, setRemoving] = useState(false);
	const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

	useEffect(() => {
		getGeminiKeyStatus().then((status) => {
			setHasKey(status.hasKey);
			setLastFour(status.lastFour);
		});
	}, []);

	const handleTest = async () => {
		if (!inputValue.trim()) return;
		setTesting(true);
		setTestResult(null);
		const result = await testGeminiKey(inputValue.trim());
		setTestResult({
			success: result.success,
			message: result.success ? "Valid key" : result.error,
		});
		setTesting(false);
	};

	const handleSave = async () => {
		if (!inputValue.trim()) return;
		setSaving(true);
		const result = await saveGeminiKey(inputValue.trim());
		if (result.success) {
			toast.success("Gemini API key saved");
			setHasKey(true);
			setLastFour(inputValue.trim().slice(-4));
			setInputValue("");
			setTestResult(null);
		} else {
			toast.error(result.error);
		}
		setSaving(false);
	};

	const handleRemove = async () => {
		setRemoving(true);
		const result = await deleteGeminiKey();
		if (result.success) {
			toast.success("Gemini API key removed");
			setHasKey(false);
			setLastFour("");
			setInputValue("");
			setTestResult(null);
		} else {
			toast.error(result.error);
		}
		setRemoving(false);
		setConfirmRemoveOpen(false);
	};

	return (
		<Card className="flex flex-col gap-4">
			<ConfirmationDialog
				open={confirmRemoveOpen}
				title="Remove Gemini API key"
				description="Are you sure you want to remove your Gemini API key? You will need to paste it again to use it later."
				confirmLabel={removing ? "Removing..." : "Remove"}
				confirmVariant="destructive"
				loading={removing}
				onConfirm={handleRemove}
				onCancel={() => setConfirmRemoveOpen(false)}
			/>
			<div className="space-y-1">
				<CardTitle>Gemini API Key (Transcription)</CardTitle>
				<CardDescription>
					Paste your own Gemini key to use your quota for transcription & AI
					chat.
				</CardDescription>
				<a
					href="https://aistudio.google.com/apikey"
					target="_blank"
					rel="noopener noreferrer"
					className="text-xs text-blue-500 hover:text-blue-600"
				>
					Get a Gemini API key from Google AI Studio &rarr;
				</a>
			</div>

			<div className="flex gap-2 items-center">
				<div className="relative flex-1">
					<Input
						type={showKey ? "text" : "password"}
						placeholder="AIza..."
						value={inputValue}
						onChange={(e) => {
							setInputValue(e.target.value);
							setTestResult(null);
						}}
					/>
					<button
						type="button"
						onClick={() => setShowKey(!showKey)}
						className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-xs text-gray-10 hover:text-gray-12"
					>
						{showKey ? "Hide" : "Show"}
					</button>
				</div>
			</div>

			{hasKey && (
				<p className="text-xs text-gray-10">
					Key on file: AIza{"••••"}
					{lastFour}
				</p>
			)}

			{testResult && (
				<p
					className={`text-xs ${testResult.success ? "text-green-600" : "text-red-500"}`}
				>
					{testResult.message}
				</p>
			)}

			<p className="text-xs text-gray-10">
				This key is encrypted at rest and only used for transcribing your own
				recordings.
			</p>

			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="xs"
					variant="outline"
					disabled={!inputValue.trim() || testing}
					spinner={testing}
					onClick={handleTest}
				>
					{testing ? "Testing..." : "Test"}
				</Button>
				<Button
					type="button"
					size="xs"
					variant="dark"
					disabled={!inputValue.trim() || saving}
					spinner={saving}
					onClick={handleSave}
				>
					{saving ? "Saving..." : "Save"}
				</Button>
				<Button
					type="button"
					size="xs"
					variant="destructive"
					disabled={!hasKey || removing}
					spinner={removing}
					onClick={() => setConfirmRemoveOpen(true)}
				>
					{removing ? "Removing..." : "Remove"}
				</Button>
			</div>
		</Card>
	);
};
