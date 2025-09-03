import WebSocket from "ws";
import { createClient } from "redis";

const url: string = "wss://ws.backpack.exchange";
const backPackSocket: WebSocket = new WebSocket(url);

const redisClient = createClient({
    socket: {
        host: "localhost",
        port: 6379 
    }
});

redisClient.connect().then(() => {
    console.log("Connected to Redis");
}).catch((err) => {
    console.error("Redis connection error:", err);
});

interface SubscribeMessage {
    method: string;
    params: string[];
}

interface PriceUpdate {
    asset: string;
    price: number;
    decimal: number;
}

const subscribe_message: SubscribeMessage = {
    method: "SUBSCRIBE",
    params: ["bookTicker.SOL_USDC", "bookTicker.BTC_USDC", "bookTicker.ETH_USDC"]
};

const symbolMap: Record<string, { asset: string; decimal: number }> = {
    "BTC_USDC": { asset: "BTC", decimal: 4 },
    "SOL_USDC": { asset: "SOL", decimal: 6 },
    "ETH_USDC": { asset: "ETH", decimal: 4 }
};

let latestPriceUpdate: PriceUpdate | null = null;

setInterval(async () => {
    if (latestPriceUpdate) {
        await redisClient.publish("price_updates", JSON.stringify({ price_updates: [latestPriceUpdate] }));
        console.log("Published:", latestPriceUpdate);
        latestPriceUpdate = null;
    }
}, 100);

backPackSocket.on("open", async () => {
    console.log("connected to backpack");
    backPackSocket.send(JSON.stringify(subscribe_message));
});

backPackSocket.on("message", async (raw: WebSocket.Data) => {
    const msg = JSON.parse(raw.toString());
    const symbol = msg.data?.s;
    const priceStr = msg.data?.a;

    if (symbol && priceStr && symbolMap[symbol]) {
        const { asset, decimal } = symbolMap[symbol];
        const price = Math.round(parseFloat(priceStr) * Math.pow(10, decimal));
        latestPriceUpdate = { asset, price, decimal };
    }
});

backPackSocket.on("error", (error: Error) => {
    console.log("could not form connection", error);
});

backPackSocket.on("close", () => {
    console.log("connection closed");
});

console.log("application started...fetching data");