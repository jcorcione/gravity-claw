export class EscalationError extends Error {
    constructor(public reason: string) {
        super(`Escalated to smarter model: ${reason}`);
        this.name = "EscalationError";
    }
}
