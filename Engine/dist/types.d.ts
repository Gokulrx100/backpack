export interface User {
    email: string;
    balance: number;
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
}
//# sourceMappingURL=types.d.ts.map