export class MessageCommandDeduper {
	readonly #seenMessageIds = new Set<string>();
	readonly #expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(private readonly ttlMs = 60_000) {}

	claim(messageId: string): boolean {
		if (this.#seenMessageIds.has(messageId)) {
			return false;
		}

		this.#seenMessageIds.add(messageId);

		const timer = setTimeout(() => {
			this.#seenMessageIds.delete(messageId);
			this.#expiryTimers.delete(messageId);
		}, this.ttlMs);

		timer.unref?.();
		this.#expiryTimers.set(messageId, timer);

		return true;
	}
}
