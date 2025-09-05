import { createClient } from "redis";
import { type User } from "./types.js";

const redisClient = createClient({
    socket: { host: "localhost", port: 6379 }
});

const PRICE: Record<string, any> = { BTC: {}, SOL: {}, ETH: {} };
const USERS: Record<string, User> = {}

const start = async () => {
    await redisClient.connect();

    while (true) {
        const res = await redisClient.xRead(
            [{ key: "price_updates_stream", id: "$" }],
            { BLOCK: 0 }
        );

        if (!Array.isArray(res) || res.length === 0) continue;
        
        //@ts-ignore
        const { name, messages } = res[0];

        for (const message of messages) {
            const { id, message: fields } = message;
            
            if (fields.type === "signup") {
                USERS[fields.email] = {
                    email: fields.email,
                    balance: 5000,
                    openOrders: {}
                };

                console.log("New user signed up:", fields.email);

                await redisClient.xAdd("engine_response_stream", "*", {
                    status: "success",
                    type:"signup",
                    userBalance : USERS[fields.email]?.balance?.toString() ?? "0",
                    email: fields.email,
                    correlationId: fields.correlationId,
                    timestamp : Date.now().toString()
                });
            }

            if(fields.type === "signin") {
                if(USERS[fields.email]){
                    console.log("User signin sttempt : ", fields.email);

                    await redisClient.xAdd("engine_response_stream", "*", {
                        status : "success",
                        type : "signin",
                        email : fields.email,
                        correlationId: fields.correlationId
                    });
                }else{
                    console.log("Signin failed - user not found");

                    await redisClient.xAdd("engine_response_stream", "*", {
                        status:"error",
                        type : "signin",
                        error : "User not found",
                        email : fields.email,
                        correlationId : fields.correlationId
                    })
                }
            }

            if (fields.data) {
                const data = JSON.parse(fields.data);
                const priceUpdates = data.price_updates;

                for (const update of priceUpdates) {
                    PRICE[update.asset] = {
                        price: update.price,
                        decimal: update.decimal
                    };
                }

                console.log("Updated price:", PRICE);
            }
        }
    }
};

start();
