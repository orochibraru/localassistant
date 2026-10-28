export abstract class BaseDTO<Row extends object> {
	protected readonly row: Row;

	/** Wraps one database row. */
	protected constructor(row: Row) {
		this.row = row;
	}

	/** A plain copy of the row, safe to return from a `load`. */
	toJSON(): Row {
		return { ...this.row };
	}
}
