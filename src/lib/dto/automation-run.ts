import { and, desc, eq, inArray, lt } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { automation, automationRun } from "#lib/server/db/schema.js";

export const runStatuses = [
	"running",
	"waiting",
	"done",
	"failed",
	"skipped",
] as const;
export type RunStatus = (typeof runStatuses)[number];

export interface AutomationRunRow {
	id: string;
	automationId: string;
	cause: string;
	status: RunStatus;
	error: string | null;
	startedAt: Date;
	finishedAt: Date | null;
}

export interface HomeRun extends AutomationRunRow {
	automationName: string;
}

const columns = {
	id: automationRun.id,
	automationId: automationRun.automationId,
	cause: automationRun.cause,
	status: automationRun.status,
	error: automationRun.error,
	startedAt: automationRun.startedAt,
	finishedAt: automationRun.finishedAt,
};

export class AutomationRunDTO extends BaseDTO<AutomationRunRow> {
	/** Starts recording a run of `automationId`, set off by `cause`. */
	static start(automationId: string, cause: string): AutomationRunDTO {
		const row = databaseConnection
			.get()
			.insert(automationRun)
			.values({
				automationId,
				cause,
				status: "running",
				startedAt: new Date(),
			})
			.returning(columns)
			.get();
		return new AutomationRunDTO(row as AutomationRunRow);
	}

	/** Records a run that never started because a condition didn't hold. */
	static skipped(automationId: string, cause: string, reason: string): void {
		const now = new Date();
		databaseConnection
			.get()
			.insert(automationRun)
			.values({
				automationId,
				cause,
				status: "skipped",
				error: reason,
				startedAt: now,
				finishedAt: now,
			})
			.run();
	}

	/** The run with `id`, or `undefined` once it's pruned or its routine is gone. */
	static find(id: string): AutomationRunDTO | undefined {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(automationRun)
			.where(eq(automationRun.id, id))
			.get();
		return row ? new AutomationRunDTO(row as AutomationRunRow) : undefined;
	}

	/** The latest `limit` runs of every routine in `homeId`, newest first, with the routine's name. */
	static recentInHome(homeId: string, limit = 100): HomeRun[] {
		return databaseConnection
			.get()
			.select({ ...columns, automationName: automation.name })
			.from(automationRun)
			.innerJoin(automation, eq(automation.id, automationRun.automationId))
			.where(eq(automation.homeId, homeId))
			.orderBy(desc(automationRun.startedAt))
			.limit(limit)
			.all() as HomeRun[];
	}

	/** Removes runs that started before `before`; returns how many went. */
	static prune(before: Date): number {
		return databaseConnection
			.get()
			.delete(automationRun)
			.where(lt(automationRun.startedAt, before))
			.returning({ id: automationRun.id })
			.all().length;
	}

	/** Marks every run still waiting on a delay of `automationId` as cancelled, when the routine changes or stops. */
	static cancelWaiting(automationId: string): void {
		databaseConnection
			.get()
			.update(automationRun)
			.set({
				status: "failed",
				error: "Cancelled: the routine changed or was turned off.",
				finishedAt: new Date(),
			})
			.where(
				and(
					eq(automationRun.automationId, automationId),
					inArray(automationRun.status, ["running", "waiting"]),
				),
			)
			.run();
	}

	get id(): string {
		return this.row.id;
	}

	get status(): RunStatus {
		return this.row.status;
	}

	/** Marks the run as waiting on a delay. */
	wait(): void {
		this.#update({ status: "waiting" });
	}

	/** Marks the run as going again after a delay. */
	resume(): void {
		this.#update({ status: "running" });
	}

	/** Records how the run ended: done, or failed with what went wrong. */
	finish(error: string | null): void {
		this.#update({
			status: error ? "failed" : "done",
			error,
			finishedAt: new Date(),
		});
	}

	#update(
		values: Partial<Omit<AutomationRunRow, "id" | "automationId">>,
	): void {
		databaseConnection
			.get()
			.update(automationRun)
			.set(values)
			.where(eq(automationRun.id, this.row.id))
			.run();
		Object.assign(this.row, values);
	}
}
