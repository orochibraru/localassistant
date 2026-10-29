import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { DeviceState } from "#lib/devices.js";
import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { device, type deviceKinds } from "#lib/server/db/schema.js";

export type DeviceKind = (typeof deviceKinds)[number];

export interface DeviceRow {
	id: string;
	kind: DeviceKind;
	homeId: string | null;
	ownerId: string | null;
	options: DeviceOptions | null;
	name: string;
	roomId: string | null;
	externalId: string;
	host: string | null;
	protocolVersion: string | null;
	inverted: boolean;
	buildingId: number | null;
	controlDp: number;
	positionDp: number;
	positionStateDp: number;
	state: DeviceState | null;
	stateError: string | null;
	stateAt: Date | null;
	unreachableSince: Date | null;
	unreachableAlerted: boolean;
}

export interface DeviceOptions {
	record?: boolean;
	retentionDays?: number;
	objectId?: string;
	pin?: { place: string; x: number; y: number };
}

export interface TuyaCoverSettings {
	name: string;
	roomId: string | null;
	host: string;
	protocolVersion: string;
	inverted: boolean;
	controlDp: number;
	positionDp: number;
	positionStateDp: number;
	encryptedLocalKey?: string;
}

export interface NewDevice {
	kind: DeviceKind;
	homeId: string;
	ownerId?: string | null;
	options?: DeviceOptions | null;
	name: string;
	roomId?: string | null;
	externalId: string;
	host?: string;
	protocolVersion?: string;
	encryptedLocalKey?: string;
	inverted?: boolean;
	buildingId?: number;
	controlDp?: number;
	positionDp?: number;
	positionStateDp?: number;
}

const columns = {
	id: device.id,
	kind: device.kind,
	homeId: device.homeId,
	ownerId: device.ownerId,
	options: device.options,
	name: device.name,
	roomId: device.roomId,
	externalId: device.externalId,
	host: device.host,
	protocolVersion: device.protocolVersion,
	inverted: device.inverted,
	buildingId: device.buildingId,
	controlDp: device.controlDp,
	positionDp: device.positionDp,
	positionStateDp: device.positionStateDp,
	state: device.state,
	stateError: device.stateError,
	stateAt: device.stateAt,
	unreachableSince: device.unreachableSince,
	unreachableAlerted: device.unreachableAlerted,
};

type SelectedRow = Omit<DeviceRow, "state" | "options"> & {
	state: unknown;
	options: unknown;
};

export class DeviceDTO extends BaseDTO<DeviceRow> {
	/** The devices of `homeId`, by name. */
	static inHome(homeId: string): DeviceDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(device)
			.where(eq(device.homeId, homeId))
			.orderBy(asc(device.name))
			.all()
			.map((row) => DeviceDTO.#wrap(row));
	}

	/** The devices of `homeId` in `roomId`, or its whole house's when `null`, by name. */
	static inRoom(homeId: string, roomId: string | null): DeviceDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(device)
			.where(
				and(
					eq(device.homeId, homeId),
					roomId === null ? isNull(device.roomId) : eq(device.roomId, roomId),
				),
			)
			.orderBy(asc(device.name))
			.all()
			.map((row) => DeviceDTO.#wrap(row));
	}

	/** Every device, by name. */
	static all(): DeviceDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(device)
			.orderBy(asc(device.name))
			.all()
			.map((row) => DeviceDTO.#wrap(row));
	}

	/** The device with `id`, only in `homeId` when given. */
	static find(id: string, homeId?: string): DeviceDTO | undefined {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(device)
			.where(
				homeId === undefined
					? eq(device.id, id)
					: and(eq(device.id, id), eq(device.homeId, homeId)),
			)
			.get();
		return row ? DeviceDTO.#wrap(row) : undefined;
	}

	/** Adds a device, or renames and reconfigures the one already known under the same kind and external id. */
	static upsert(values: NewDevice): DeviceDTO {
		const { encryptedLocalKey, ...rest } = values;
		const row = databaseConnection
			.get()
			.insert(device)
			.values({ ...rest, localKey: encryptedLocalKey })
			.onConflictDoUpdate({
				target: [device.kind, device.externalId],
				set: { ...rest, localKey: encryptedLocalKey, updatedAt: new Date() },
			})
			.returning(columns)
			.get();
		return DeviceDTO.#wrap(row);
	}

	/** Removes every device of the given kinds, for when an integration is disconnected. */
	static removeKinds(kinds: DeviceKind[]): number {
		return databaseConnection
			.get()
			.delete(device)
			.where(inArray(device.kind, kinds))
			.returning({ id: device.id })
			.all().length;
	}

	static #wrap(row: SelectedRow): DeviceDTO {
		return new DeviceDTO({
			...row,
			state: row.state as DeviceState | null,
			options: row.options as DeviceOptions | null,
		});
	}

	get id(): string {
		return this.row.id;
	}

	get kind(): DeviceKind {
		return this.row.kind;
	}

	get externalId(): string {
		return this.row.externalId;
	}

	get host(): string | null {
		return this.row.host;
	}

	get protocolVersion(): string | null {
		return this.row.protocolVersion;
	}

	get inverted(): boolean {
		return this.row.inverted;
	}

	get buildingId(): number | null {
		return this.row.buildingId;
	}

	get controlDp(): number {
		return this.row.controlDp;
	}

	get positionDp(): number {
		return this.row.positionDp;
	}

	get positionStateDp(): number {
		return this.row.positionStateDp;
	}

	get state(): DeviceState | null {
		return this.row.state;
	}

	get name(): string {
		return this.row.name;
	}

	/** Whether the device has failed every read since at least `since` and nobody was told yet. */
	unreachableUnreported(since: Date): boolean {
		return (
			!this.row.unreachableAlerted &&
			this.row.unreachableSince !== null &&
			this.row.unreachableSince <= since
		);
	}

	/** The encrypted Tuya local key, kept off `toJSON()` so it never reaches a page. */
	encryptedLocalKey(): string | null {
		return (
			databaseConnection
				.get()
				.select({ localKey: device.localKey })
				.from(device)
				.where(eq(device.id, this.row.id))
				.get()?.localKey ?? null
		);
	}

	/** Records what the device last reported, clearing any earlier error and the outage it was part of. */
	saveState(state: DeviceState): void {
		this.#update({
			state,
			stateError: null,
			stateAt: new Date(),
			unreachableSince: null,
			unreachableAlerted: false,
		});
	}

	/** Records why the device couldn't be reached, keeping its last known state and when the outage started. */
	saveError(message: string): void {
		const now = new Date();
		this.#update({
			stateError: message,
			stateAt: now,
			unreachableSince: this.row.unreachableSince ?? now,
		});
	}

	/** Remembers that the current outage was reported, so it's reported once. */
	markUnreachableReported(): void {
		this.#update({ unreachableAlerted: true });
	}

	get ownerId(): string | null {
		return this.row.ownerId;
	}

	get options(): DeviceOptions {
		return this.row.options ?? {};
	}

	/** Replaces the device's kind-specific options. */
	setOptions(options: DeviceOptions): void {
		databaseConnection
			.get()
			.update(device)
			.set({ options, updatedAt: new Date() })
			.where(eq(device.id, this.row.id))
			.run();
		this.row.options = options;
	}

	/** Gives the device to `ownerId`, nobody when `null`. */
	setOwner(ownerId: string | null): void {
		databaseConnection
			.get()
			.update(device)
			.set({ ownerId, updatedAt: new Date() })
			.where(eq(device.id, this.row.id))
			.run();
		this.row.ownerId = ownerId;
	}

	/** Renames the device and moves it to `roomId`, the whole house when `null`. */
	rename(name: string, roomId: string | null): void {
		databaseConnection
			.get()
			.update(device)
			.set({ name, roomId, updatedAt: new Date() })
			.where(eq(device.id, this.row.id))
			.run();
		Object.assign(this.row, { name, roomId });
	}

	/** Changes how a Tuya cover is reached; the local key only when a new one is given. */
	reconfigure(values: TuyaCoverSettings): void {
		const { encryptedLocalKey, ...rest } = values;
		databaseConnection
			.get()
			.update(device)
			.set({ ...rest, localKey: encryptedLocalKey, updatedAt: new Date() })
			.where(eq(device.id, this.row.id))
			.run();
		Object.assign(this.row, rest);
	}

	/** Changes a printer's or camera's name and address, and its secret when a new one is given. */
	reconnect(values: {
		name: string;
		roomId: string | null;
		host: string;
		encryptedLocalKey?: string;
	}): void {
		const { encryptedLocalKey, ...rest } = values;
		databaseConnection
			.get()
			.update(device)
			.set({ ...rest, localKey: encryptedLocalKey, updatedAt: new Date() })
			.where(eq(device.id, this.row.id))
			.run();
		Object.assign(this.row, rest);
	}

	/** Points a Linky at another PRM or token, forgetting its last reading so the next one is fetched at once. */
	relink(values: {
		name: string;
		roomId: string | null;
		externalId: string;
		encryptedLocalKey?: string;
	}): void {
		const { encryptedLocalKey, ...rest } = values;
		databaseConnection
			.get()
			.update(device)
			.set({
				...rest,
				localKey: encryptedLocalKey,
				state: null,
				stateError: null,
				stateAt: null,
				updatedAt: new Date(),
			})
			.where(eq(device.id, this.row.id))
			.run();
		Object.assign(this.row, rest, {
			state: null,
			stateError: null,
			stateAt: null,
		});
	}

	/** Removes the device. */
	delete(): void {
		databaseConnection
			.get()
			.delete(device)
			.where(eq(device.id, this.row.id))
			.run();
	}

	#update(
		values: Pick<
			Partial<DeviceRow>,
			| "state"
			| "stateError"
			| "stateAt"
			| "unreachableSince"
			| "unreachableAlerted"
		>,
	) {
		databaseConnection
			.get()
			.update(device)
			.set(values)
			.where(eq(device.id, this.row.id))
			.run();
		Object.assign(this.row, values);
	}
}
