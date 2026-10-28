import webpush from "web-push";

import { PushSubscriptionDTO } from "#lib/dto/push-subscription.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { configuration } from "#lib/server/core/config.js";
import { secrets } from "#lib/server/core/secrets.js";

export interface PushNotification {
	title: string;
	body: string;
	url: string;
}

export type SendPush = (
	subscription: ReturnType<PushSubscriptionDTO["toWebPush"]>,
	payload: string,
	options: webpush.RequestOptions,
) => Promise<unknown>;

/** Web push to people's devices, under VAPID keys this server makes on first use and keeps encrypted. */
class PushNotifications {
	/** This server's VAPID public key, created with its private half the first time anything asks. */
	vapidPublicKey(): string {
		const stored = getSetting("vapid");
		if (stored) {
			return stored.publicKey;
		}
		const keys = webpush.generateVAPIDKeys();
		setSetting("vapid", {
			publicKey: keys.publicKey,
			encryptedPrivateKey: secrets.encrypt(keys.privateKey),
		});
		return keys.publicKey;
	}

	/**
	 * Sends `notification` to every device of `userIds` and forgets the ones the push service says are gone. Returns how
	 * many devices got it.
	 */
	async deliver(
		userIds: string[],
		notification: PushNotification,
		send: SendPush = webpush.sendNotification,
	): Promise<number> {
		const subscriptions = PushSubscriptionDTO.forUsers(userIds);
		if (subscriptions.length === 0) {
			return 0;
		}
		this.vapidPublicKey();
		const keys = getSetting("vapid");
		if (!keys) {
			return 0;
		}
		const options: webpush.RequestOptions = {
			TTL: 60 * 60 * 24,
			vapidDetails: {
				subject: this.#contact(),
				publicKey: keys.publicKey,
				privateKey: secrets.decrypt(keys.encryptedPrivateKey),
			},
		};
		const payload = JSON.stringify(notification);
		let delivered = 0;
		for (const subscription of subscriptions) {
			try {
				await send(subscription.toWebPush(), payload, options);
				delivered += 1;
			} catch (error) {
				const status = (error as { statusCode?: number }).statusCode;
				if (status === 404 || status === 410) {
					PushSubscriptionDTO.removeEndpoint(subscription.endpoint);
				} else {
					throw error;
				}
			}
		}
		return delivered;
	}

	/** The contact push services see: the HTTPS origin, else the SMTP sender's address. */
	#contact(): string {
		const origin = configuration.get().origin;
		if (origin?.startsWith("https://")) {
			return origin;
		}
		const smtp = getSetting("smtp");
		return `mailto:${smtp?.fromAddress ?? "admin@localassistant.invalid"}`;
	}
}

export const pushNotifications = new PushNotifications();
