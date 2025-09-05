export declare const CALLBACK_QUEUE = "engine_response_stream";
export declare class RedisSubscriber {
    private client;
    private callbacks;
    constructor();
    runLoop(): Promise<void>;
    waitForMessage(correlationId: string): Promise<any>;
}
//# sourceMappingURL=redisSubscriber.d.ts.map