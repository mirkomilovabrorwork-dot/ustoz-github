"use client";

import { useEffect, useRef, useState } from "react";

interface Task {
	title: string;
	assignee?: string;
	priority?: "high" | "medium" | "low";
	deadline?: string;
	done: boolean;
}

interface TasksPanelProps {
	videoId: string;
	tasks?: Task[];
}

type TasksMode = "board" | "checklist";

function getTasksMode(): TasksMode {
	const val = document.documentElement.dataset.tasks;
	if (val === "checklist") return "checklist";
	return "board";
}

function priorityColor(priority?: "high" | "medium" | "low"): string {
	if (priority === "high") return "bg-red-100 text-red-700";
	if (priority === "medium") return "bg-amber-100 text-amber-700";
	if (priority === "low") return "bg-green-100 text-green-700";
	return "bg-gray-100 text-gray-500";
}

function Initials({ name }: { name: string }) {
	const parts = name.trim().split(/\s+/);
	const letters =
		parts.length >= 2
			? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
			: name.slice(0, 2).toUpperCase();
	return (
		<span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-700">
			{letters}
		</span>
	);
}

function DeadlinePill({ deadline }: { deadline: string }) {
	return (
		<span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">
			{deadline}
		</span>
	);
}

function PriorityBadge({ priority }: { priority?: "high" | "medium" | "low" }) {
	if (!priority) return null;
	return (
		<span
			className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${priorityColor(priority)}`}
		>
			{priority}
		</span>
	);
}

function ProgressBar({ done, total }: { done: number; total: number }) {
	const pct = total === 0 ? 0 : Math.round((done / total) * 100);
	return (
		<div className="flex items-center gap-3">
			<div className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
				<div
					className="absolute inset-y-0 left-0 rounded-full bg-gray-800 transition-all duration-300"
					style={{ width: `${pct}%` }}
				/>
			</div>
			<span className="w-10 shrink-0 text-right text-xs font-semibold text-gray-700">
				{pct}%
			</span>
		</div>
	);
}

export function TasksPanel({
	videoId,
	tasks: initialTasks = [],
}: TasksPanelProps) {
	const [mode, setMode] = useState<TasksMode>("board");
	const [tasks, setTasks] = useState<Task[]>(initialTasks);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		setMode(getTasksMode());
		const observer = new MutationObserver(() => setMode(getTasksMode()));
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-tasks"],
		});
		return () => observer.disconnect();
	}, []);

	const done = tasks.filter((t) => t.done).length;
	const total = tasks.length;

	function toggle(index: number) {
		setTasks((prev) => {
			const next = prev.map((t, i) =>
				i === index ? { ...t, done: !t.done } : t,
			);

			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				fetch("/api/video/tasks/toggle", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						videoId,
						taskIndex: index,
						done: next[index].done,
					}),
				}).catch(() => undefined);
			}, 400);

			return next;
		});
	}

	if (total === 0) {
		return (
			<div className="flex flex-col items-center justify-center px-4 py-10 text-center">
				<p className="text-sm text-gray-500">
					No tasks extracted from this meeting
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<ProgressBar done={done} total={total} />

			{mode === "board" ? (
				<BoardView tasks={tasks} onToggle={toggle} />
			) : (
				<ChecklistView
					tasks={tasks}
					onToggle={toggle}
					collapsed={collapsed}
					onCollapseToggle={(key) =>
						setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
					}
				/>
			)}
		</div>
	);
}

function BoardView({
	tasks,
	onToggle,
}: {
	tasks: Task[];
	onToggle: (i: number) => void;
}) {
	const todo = tasks
		.map((t, i) => ({ t, i }))
		.filter(({ t }) => !t.done && t.priority !== "high");
	const inProgress = tasks
		.map((t, i) => ({ t, i }))
		.filter(({ t }) => !t.done && t.priority === "high");
	const done = tasks.map((t, i) => ({ t, i })).filter(({ t }) => t.done);

	return (
		<div className="grid grid-cols-3 gap-3">
			<Column label="To Do" items={todo} onToggle={onToggle} />
			<Column label="In Progress" items={inProgress} onToggle={onToggle} />
			<Column label="Done" items={done} onToggle={onToggle} />
		</div>
	);
}

function Column({
	label,
	items,
	onToggle,
}: {
	label: string;
	items: { t: Task; i: number }[];
	onToggle: (i: number) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<span className="text-xs font-semibold text-gray-600">{label}</span>
				<span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
					{items.length}
				</span>
			</div>
			<div className="flex flex-col gap-2">
				{items.map(({ t, i }) => (
					<TaskCard key={i} task={t} index={i} onToggle={onToggle} />
				))}
				{items.length === 0 && (
					<div className="rounded-xl border border-dashed border-gray-200 p-3 text-center">
						<span className="text-[11px] text-gray-400">Empty</span>
					</div>
				)}
			</div>
		</div>
	);
}

function TaskCard({
	task,
	index,
	onToggle,
}: {
	task: Task;
	index: number;
	onToggle: (i: number) => void;
}) {
	return (
		<div
			className={`flex flex-col gap-2 rounded-xl border p-3 transition-opacity ${task.done ? "border-gray-100 bg-gray-50 opacity-60" : "border-gray-200 bg-white"}`}
		>
			<div className="flex items-start gap-2">
				<input
					type="checkbox"
					checked={task.done}
					onChange={() => onToggle(index)}
					className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-gray-800"
				/>
				<span
					className={`text-xs leading-snug text-gray-900 ${task.done ? "line-through" : ""}`}
				>
					{task.title}
				</span>
			</div>
			<div className="flex items-center gap-1.5 flex-wrap">
				<PriorityBadge priority={task.priority} />
				{task.assignee && <Initials name={task.assignee} />}
				{task.deadline && <DeadlinePill deadline={task.deadline} />}
			</div>
		</div>
	);
}

const PRIORITY_ORDER: Array<"high" | "medium" | "low" | undefined> = [
	"high",
	"medium",
	"low",
	undefined,
];

function ChecklistView({
	tasks,
	onToggle,
	collapsed,
	onCollapseToggle,
}: {
	tasks: Task[];
	onToggle: (i: number) => void;
	collapsed: Record<string, boolean>;
	onCollapseToggle: (key: string) => void;
}) {
	const groups = PRIORITY_ORDER.map((p) => ({
		key: p ?? "none",
		label: p ? p.charAt(0).toUpperCase() + p.slice(1) : "No priority",
		items: tasks.map((t, i) => ({ t, i })).filter(({ t }) => t.priority === p),
	})).filter(({ items }) => items.length > 0);

	return (
		<div className="flex flex-col gap-3">
			{groups.map(({ key, label, items }) => (
				<div key={key} className="flex flex-col gap-1">
					<button
						type="button"
						onClick={() => onCollapseToggle(key)}
						className="flex items-center gap-2 text-left"
					>
						<span
							className={`text-[10px] transition-transform ${collapsed[key] ? "" : "rotate-90"}`}
						>
							▶
						</span>
						<span className="text-xs font-semibold text-gray-600">{label}</span>
						<span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
							{items.length}
						</span>
					</button>

					{!collapsed[key] && (
						<div className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
							{items.map(({ t, i }) => (
								<div key={i} className="flex items-center gap-3 px-3 py-2.5">
									<input
										type="checkbox"
										checked={t.done}
										onChange={() => onToggle(i)}
										className="size-3.5 shrink-0 cursor-pointer accent-gray-800"
									/>
									<span
										className={`flex-1 text-sm text-gray-900 ${t.done ? "line-through opacity-50" : ""}`}
									>
										{t.title}
									</span>
									<PriorityBadge priority={t.priority} />
									{t.assignee && <Initials name={t.assignee} />}
									{t.deadline && <DeadlinePill deadline={t.deadline} />}
								</div>
							))}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
