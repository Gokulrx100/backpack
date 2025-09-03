import {createClient} from "redis";

const redisClient = createClient({
    socket: {
        host: "localhost",
        port: 6379 
    }
});

const PRICE : Record<string, any> = {BTC : {}, SOL : {}, ETH : {}};



const start = async () => {
    await redisClient.connect();

    redisClient.subscribe("price_updates", (message, _channel) => {
        const data = JSON.parse(message);
        for (const update of data.price_updates) {
            const { asset, price, decimal } = update;
            PRICE[asset] = { price: price, decimal: decimal }
        }
        console.log(PRICE);
    });
}

start();
