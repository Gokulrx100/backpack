import { createClient, type RedisClientType } from "redis";

export const CALLBACK_QUEUE = "engine_response_stream";

export class RedisSubscriber {
    private client: RedisClientType;
    private callbacks: Record<string, (data?: any) => void>;

    constructor() {
        this.client = createClient({
            socket: { host: "localhost", port: 6379 }
        });
        this.client.connect();
        this.runLoop();
        this.callbacks = {};
    }

    async runLoop() {
        while (true) {
            const response = await this.client.xRead(
                [{ key: CALLBACK_QUEUE, id: "$" }],
                { COUNT: 1, BLOCK: 0 }
            );

            if (!response) {
                continue;
            }

            //@ts-ignore
            const { name, messages } = response[0];
            const message = messages[0];
            const correlationId = message.message.correlationId;

            console.log("Received message from engine:", correlationId);

            if (this.callbacks[correlationId]) {
                this.callbacks[correlationId](message.message);
                delete this.callbacks[correlationId];
            }
        }
    }

    waitForMessage(correlationId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.callbacks[correlationId] = resolve;
            
            setTimeout(() => {
                if (this.callbacks[correlationId]) {
                    delete this.callbacks[correlationId];
                    reject(new Error("Timeout"));
                }
            }, 5000);
        });
    }
}