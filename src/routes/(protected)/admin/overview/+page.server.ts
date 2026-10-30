import { DeviceDTO } from "#lib/dto/device.js";
import { InviteDTO } from "#lib/dto/invite.js";
import { JobDTO } from "#lib/dto/job.js";
import { PasskeyDTO } from "#lib/dto/passkey.js";
import { allSettings } from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";
import { systemHealth } from "#lib/server/core/health.js";

export const load = async ({ locals, parent }) => {
	const { user } = await parent();
	const settings = allSettings();
	const users = UserDTO.count();
	return {
		users,
		pendingInvites: InviteDTO.pendingCount(),
		emailConfigured: settings.smtp !== null,
		devices: DeviceDTO.all().length,
		requireTwoFactor: settings.requireTwoFactor,
		requirePasskey: settings.requirePasskey,
		jobs: JobDTO.counts(),
		health: systemHealth.report(),
		failures: JobDTO.recentFailures(),
		gettingStarted: {
			emailConfigured: settings.smtp !== null,
			accountSecured:
				Boolean(locals.user?.twoFactorEnabled) ||
				PasskeyDTO.forUser(user.id).length > 0,
			someoneInvited: users > 1 || InviteDTO.list().length > 0,
		},
	};
};
