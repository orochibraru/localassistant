import { and, asc, eq } from "drizzle-orm";

import type {
	AutomationAction,
	Condition,
	Period,
	Trigger,
} from "#lib/automations.js";
import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { automation } from "#lib/server/db/schema.js";

export interface AutomationDefinition {
	name: string;
	trigger: Trigger;
	period: Period;
	conditions: Condition[];
	actions: AutomationAction[];
}

export interface AutomationRow extends AutomationDefinition {
	id: string;
	homeId: string;
	enabled: boolean;
	memory: Record<string, unknown> | null;
	checkedAt: Date | null;
	ranAt: Date | null;
	runError: string | null;
}

const columns = {
	id: automation.id,
	homeId: automation.homeId,
	name: automation.name,
	enabled: automation.enabled,
	trigger: automation.trigger,
	period: automation.period,
	conditions: automation.conditions,
	actions: automation.actions,
	memory: automation.memory,
	checkedAt: automation.checkedAt,
	ranAt: automation.ranAt,
	runError: automation.runError,
};

type SelectedRow = Omit<
	AutomationRow,
	"trigger" | "period" | "conditions" | "actions" | "memory"
> & {
	trigger: unknown;
	period: unknown;
	conditions: unknown;
	actions: unknown;
	memory: unknown;
};

export class AutomationDTO extends BaseDTO<AutomationRow> {
	/** Every automation of every home, for the worker. */
	static all(): AutomationDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(automation)
			.all()
			.map((row) => AutomationDTO.#wrap(row));
	}

	/** The automations of `homeId`, by name. */
	static inHome(homeId: string): AutomationDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(automation)
			.where(eq(automation.homeId, homeId))
			.orderBy(asc(automation.name))
			.all()
			.map((row) => AutomationDTO.#wrap(row));
	}

	/** The automation with `id`, in `homeId` when given. */
	static find(id: string, homeId?: string): AutomationDTO | undefined {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(automation)
			.where(
				homeId === undefined
					? eq(automation.id, id)
					: and(eq(automation.id, id), eq(automation.homeId, homeId)),
			)
			.get();
		return row ? AutomationDTO.#wrap(row) : undefined;
	}

	/** Adds an automation to `homeId`, switched on. */
	static create(
		homeId: string,
		definition: AutomationDefinition,
	): AutomationDTO {
		const row = databaseConnection
			.get()
			.insert(automation)
			.values({ homeId, ...definition })
			.returning(columns)
			.get();
		return AutomationDTO.#wrap(row);
	}

	static #wrap(row: SelectedRow): AutomationDTO {
		return new AutomationDTO({
			...row,
			trigger: row.trigger as Trigger,
			period: row.period as Period,
			conditions: row.conditions as Condition[],
			actions: row.actions as AutomationAction[],
			memory: row.memory as Record<string, unknown> | null,
		});
	}

	get id(): string {
		return this.row.id;
	}

	get homeId(): string {
		return this.row.homeId;
	}

	get name(): string {
		return this.row.name;
	}

	get enabled(): boolean {
		return this.row.enabled;
	}

	get trigger(): Trigger {
		return this.row.trigger;
	}

	get period(): Period {
		return this.row.period;
	}

	get conditions(): Condition[] {
		return this.row.conditions;
	}

	get actions(): AutomationAction[] {
		return this.row.actions;
	}

	get memory(): Record<string, unknown> | null {
		return this.row.memory;
	}

	get checkedAt(): Date | null {
		return this.row.checkedAt;
	}

	/** Replaces what the automation does and when, forgetting what its trigger remembered. */
	update(definition: AutomationDefinition): void {
		this.#update({ ...definition, memory: null, checkedAt: null });
	}

	/** Switches the automation on or off. */
	setEnabled(enabled: boolean): void {
		this.#update({ enabled, memory: null, checkedAt: null });
	}

	/** Records that the worker looked at the automation at `checkedAt`, and what its trigger needs to remember. */
	recordCheck(checkedAt: Date, memory: Record<string, unknown> | null): void {
		this.#update({ checkedAt, memory });
	}

	/** Keeps what a door or window automation needs to undo later, such as the targets it turned down. */
	remember(memory: Record<string, unknown> | null): void {
		this.#update({ memory });
	}

	/** Records the outcome of the latest run, with what failed or `null`. */
	recordRun(runError: string | null): void {
		this.#update({ ranAt: new Date(), runError });
	}

	/** Removes the automation. */
	delete(): void {
		databaseConnection
			.get()
			.delete(automation)
			.where(eq(automation.id, this.row.id))
			.run();
	}

	#update(values: Partial<Omit<AutomationRow, "id" | "homeId">>): void {
		databaseConnection
			.get()
			.update(automation)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(automation.id, this.row.id))
			.run();
		Object.assign(this.row, values);
	}
}
