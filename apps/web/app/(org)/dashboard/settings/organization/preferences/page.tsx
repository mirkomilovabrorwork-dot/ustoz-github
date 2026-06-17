import type { Metadata } from "next";
import CapSettingsCard from "../components/CapSettingsCard";

export const metadata: Metadata = {
	title: "Organization Preferences — data365",
};

export default function PreferencesPage() {
	return <CapSettingsCard />;
}
