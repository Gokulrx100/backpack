export interface User {
    email: string;
    balance: number;
    balanceDecimal: number;
    openOrders: Record<string, Order>;
}

export interface Order {
    id: string;
    asset: string;
    type: "long" | "short";
    margin: number;
    marginDecimal: number;
    leverage: number;
    slippage: number;
    createdAt: Date;
    entryPrice: number;
    entryPriceDecimal: number;
    positionSize: number;
    positionSizeDecimals: number;
}

export interface PriceUpdate {
    asset: string;
    price: number;
    decimal: number;
}

export interface BalanceResponse {
    [asset: string]: {
        balance: number;
        decimals: number;
    };
}

