import { createClient } from "redis";

const redisClient = createClient({
    socket: {
        host: "localhost",
        port: 6379
    }
});

const PRICE: Record<string, any> = { BTC: {}, SOL: {}, ETH: {} };



const start = async () => {
    await redisClient.connect();

    while (true) {
        const res = await redisClient.xRead(
            [
                {
                    key: "price_updates_stream",
                    id: "$"
                }
            ],
            { BLOCK: 0 }
        );
        //@ts-ignore
        const {name, messages} = res[0];
        
        for (const message of messages) { 
            const data = JSON.parse(message.message.data);
            const priceUpdates = data.price_updates;

            for (const update of priceUpdates){
                PRICE[update.asset] = {
                    price : update.price,
                    decimal : update.decimal
                };
            }
        }

        console.log("Updated price : ", PRICE);
    }
}

start();