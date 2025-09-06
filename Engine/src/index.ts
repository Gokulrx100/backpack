import { createClient } from "redis";
import { type User, type Order} from "./types.js"
import {v4 as uuidv4} from "uuid";
import * as decimalUtils from "./utils/decimal.js";

const redisClient = createClient({
  socket : {
    host : "localhost",
    port : 6379
  }
});

const PRICE : Record<string, { price : number; decimal : number}> = {
  BTC: { price: 0, decimal: 4 }, 
  SOL: { price: 0, decimal: 6 }, 
  ETH: { price: 0, decimal: 4 } 
}

const USERS : Record<string, User> = {};
const DECIMAL_COUNT = 4;
const MARGIN_DECIMALS_COUNT = 2;

const start = async () => {
  await redisClient.connect();

  while(true){
    const res = await redisClient.xRead([{ key : "price_updates_stream", id : "$"}], {BLOCK : 0});

    if (!Array.isArray(res) || res.length === 0) continue;

    //@ts-ignore
    const { name, messages } = res[0];

    for (const message of messages) {
      const { id, message: fields } = message;

      if (fields.type === "signup"){
        USERS[fields.email] = {
          email: fields.email,
          balance: 5000 * Math.pow(10, DECIMAL_COUNT),
          balanceDecimal: DECIMAL_COUNT,
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

      if (fields.type === "signin"){
        if (USERS[fields.email]) {
          console.log("User signin attempt:", fields.email);

          await redisClient.xAdd("engine_response_stream", "*", {
            status: "success",
            type: "signin",
            email: fields.email,
            userBalance: USERS[fields.email]?.balance?.toString() ?? "0",
            balanceDecimal: USERS[fields.email]?.balanceDecimal?.toString() ?? DECIMAL_COUNT.toString(),
            correlationId: fields.correlationId,
          });
        } else {
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

      if(fields.type === "trade_create"){
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
        const leverage = parseInt(fields.leverage);
        const asset = fields.asset;

        if (user.balance < marginRaw) {
          await redisClient.xAdd("engine_response_stream", "*", {
            status: "error",
            type: "trade_create",
            error: "Insufficient balance",
            correlationId: fields.correlationId,
          });
          continue;
        }

        if (!PRICE[asset] || PRICE[asset].price === 0) {
          await redisClient.xAdd("engine_response_stream", "*", {
            status: "error",
            type: "trade_create",
            error: "Price not available for asset",
            correlationId: fields.correlationId,
          });
          continue;
        }

        const orderId = uuidv4();

        const { positionValueInStandard, positionSizeInAsset} = decimalUtils.calculatePositionValue(marginRaw, leverage, PRICE[asset].price, PRICE[asset].decimal);

        const order : Order = {
          id: orderId,
          asset: fields.asset,
          type: fields.tradeType as "long" | "short",
          margin: marginRaw,
          marginDecimal: MARGIN_DECIMALS_COUNT,
          leverage: leverage,
          slippage: parseInt(fields.slippage),
          createdAt: new Date(),
          entryPrice: PRICE[asset].price,
          entryPriceDecimal: PRICE[asset].decimal,
          positionSize: positionSizeInAsset,
          positionSizeDecimals: PRICE[asset].decimal
        }

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

      if(fields.type === "trade_close"){
        const user = USERS[fields.email];
        const orderId = fields.orderId;

        if (!user) {
          await redisClient.xAdd("engine_response_stream", "*", {
            status: "error",
            type: "trade_close",
            error: "User not found",
            correlationId: fields.correlationId,
          });
          continue;
        }

        const order = user.openOrders[orderId];
        if (!order) {
          await redisClient.xAdd("engine_response_stream", "*", {
            status: "error",
            type: "trade_close",
            error: "Order not found",
            correlationId: fields.correlationId,
          });
          continue;
        }

        if (!PRICE[order.asset] || PRICE[order.asset]!.price === 0) {
          await redisClient.xAdd("engine_response_stream", "*", {
            status: "error",
            type: "trade_close",
            error: "Price not available for asset",
            correlationId: fields.correlationId,
          });
          continue;
        }

        const currentPrice = PRICE[order.asset]!.price;
        const currentPriceDecimals = PRICE[order.asset]!.decimal;

        let pnl = 0;
        
        if(order.type === "long"){
           pnl = decimalUtils.subtract(
            currentPrice, currentPriceDecimals,
            order.entryPrice, order.entryPriceDecimal,
            currentPriceDecimals
          );
        }else{
            pnl = decimalUtils.subtract(
            order.entryPrice, order.entryPriceDecimal,
            currentPrice, currentPriceDecimals,
            currentPriceDecimals
          );
        }

        const totalPnlUSD = decimalUtils.multiply(
          pnl, currentPriceDecimals,
          order.positionSize, DECIMAL_COUNT,
          MARGIN_DECIMALS_COUNT
        );

        const pnlInBalanceDecimals = decimalUtils.convertDecimals(
          totalPnlUSD, MARGIN_DECIMALS_COUNT, DECIMAL_COUNT
        );

        user.balance += order.margin + pnlInBalanceDecimals;

        delete user.openOrders[orderId];

        console.log(`Trade closed for ${fields.email}:`, orderId, "PnL:", totalPnlUSD);

        await redisClient.xAdd("engine_response_stream", "*", {
          status: "success",
          type: "trade_close",
          userBalance: user.balance.toString(),
          pnl: totalPnlUSD.toString(),
          orderId: orderId,
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
}

start();