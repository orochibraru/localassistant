export interface PasswordRule {
	id: string;
	label: string;
	passed: boolean;
}

export const passwordMinLength = 12;
export const passwordMaxLength = 128;

/** Every rule a new password must pass, evaluated for `password`; `email` rules out passwords built from the address. */
export function passwordRules(password: string, email = ""): PasswordRule[] {
	const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((pattern) =>
		pattern.test(password),
	).length;
	const localPart = email.split("@")[0]?.toLowerCase() ?? "";
	return [
		{
			id: "length",
			label: `At least ${passwordMinLength} characters`,
			passed: password.length >= passwordMinLength,
		},
		{
			id: "variety",
			label: "Three of: lowercase, uppercase, digit, symbol",
			passed: classes >= 3,
		},
		{
			id: "email",
			label: "Doesn't contain your email name",
			passed:
				localPart.length < 3 || !password.toLowerCase().includes(localPart),
		},
		{
			id: "max",
			label: `At most ${passwordMaxLength} characters`,
			passed: password.length <= passwordMaxLength,
		},
	];
}

/** A 0 to 4 score for a strength meter: rules passed, plus a point for a long password. */
export function passwordScore(password: string, email = ""): number {
	if (!password) {
		return 0;
	}
	const passed = passwordRules(password, email).filter(
		(rule) => rule.passed,
	).length;
	const lengthBonus = password.length >= 16 ? 1 : 0;
	return Math.min(4, Math.max(1, passed - 1 + lengthBonus));
}
