import { createClient } from "redis";
import {} from "./types.js";
import { v4 as uuidv4 } from "uuid";
const redisClient = createClient({
    socket: { host: "localhost", port: 6379 },
});
const PRICE = { BTC: {}, SOL: {}, ETH: {} };
const USERS = {};
const DECIMAL_COUNT = 4;
const start = async () => {
    await redisClient.connect();
    while (true) {
        const res = await redisClient.xRead([{ key: "price_updates_stream", id: "$" }], { BLOCK: 0 });
        if (!Array.isArray(res) || res.length === 0)
            continue;
        //@ts-ignore
        const { name, messages } = res[0];
        for (const message of messages) {
            const { id, message: fields } = message;
            if (fields.type === "signup") {
                USERS[fields.email] = {
                    email: fields.email,
                    balance: 5000 * Math.pow(10, DECIMAL_COUNT),
                    openOrders: {},
                };
                console.log("New user signed up:", fields.email);
                await redisClient.xAdd("engine_response_stream", "*", {
                    status: "success",
                    type: "signup",
                    userBalance: USERS[fields.email]?.balance?.toString() ?? "0",
                    email: fields.email,
                    correlationId: fields.correlationId,
                    timestamp: Date.now().toString(),
                });
            }
            if (fields.type === "signin") {
                if (USERS[fields.email]) {
                    console.log("User signin sttempt : ", fields.email);
                    await redisClient.xAdd("engine_response_stream", "*", {
                        status: "success",
                        type: "signin",
                        email: fields.email,
                        correlationId: fields.correlationId,
                    });
                }
                else {
                    console.log("Signin failed - user not found");
                    await redisClient.xAdd("engine_response_stream", "*", {
                        status: "error",
                        type: "signin",
                        error: "User not found",
                        email: fields.email,
                        correlationId: fields.correlationId,
                    });
                }
            }
            if (fields.type === "trade_create") {
                const user = USERS[fields.email];
                if (!user) {
                    await redisClient.xAdd("engine_response_stream", "*", {
                        status: "error",
                        type: "trade_create",
                        error: "User not found",
                        correlationId: fields.correlationId,
                    });
                    continue;
                }
                const marginRaw = parseInt(fields.margin);
                if (user.balance < marginRaw) {
                    await redisClient.xAdd("engine_response_stream", "*", {
                        status: "error",
                        type: "trade_create",
                        error: "Insufficient balance",
                        correlationId: fields.correlationId,
                    });
                    continue;
                }
                const orderId = uuidv4();
                const order = {
                    id: orderId,
                    asset: fields.asset,
                    type: fields.tradeType,
                    margin: marginRaw,
                    marginDecimal: DECIMAL_COUNT,
                    leverage: parseInt(fields.leverage),
                    slippage: parseInt(fields.slippage),
                    createdAt: new Date(),
                };
                user.balance -= marginRaw;
                user.openOrders[order.id] = order;
                console.log(`Trade created for ${fields.email}:`, orderId);
                await redisClient.xAdd("engine_response_stream", "*", {
                    status: "success",
                    type: "trade_create",
                    userBalance: user.balance.toString(),
                    orderId: orderId.toString(),
                    email: fields.email,
                    correlationId: fields.correlationId,
                });
            }
            if (fields.data) {
                const data = JSON.parse(fields.data);
                const priceUpdates = data.price_updates;
                for (const update of priceUpdates) {
                    PRICE[update.asset] = {
                        price: update.price,
                        decimal: update.decimal,
                    };
                }
                console.log("Updated price:", PRICE);
            }
        }
    }
};
start();
//# sourceMappingURL=index.js.map