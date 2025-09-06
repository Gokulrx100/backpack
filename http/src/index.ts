import express, { type Request, type Response } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { Resend } from "resend";
import dotenv from "dotenv";
import { createClient } from "redis";
import { v4 as uuidv4 } from "uuid";
import { RedisSubscriber } from "./redisSubscriber.js";


const redisClient = createClient({
    socket : {
        host : "localhost",
        port : 6379
    }
});

interface AssetInfo {
    symbol: string;
    name: string;
    imageUrl: string;
}

const SUPPORTED_ASSETS: AssetInfo[] = [
    {
        symbol: "BTC",
        name: "Bitcoin",
        imageUrl: "image.com/png"
    },
    {
        symbol: "SOL",
        name: "Solana", 
        imageUrl: "image.com/png"
    },
    {
        symbol: "ETH",
        name: "Ethereum",
        imageUrl: "image.com/png"
    }
];

const redisSubscriber = new RedisSubscriber();

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET!;
const port = process.env.PORT!;
const app = express();

app.use(express.json());
app.use(cors());
app.use(cookieParser());

await redisClient.connect();

const resend = new Resend(process.env.RESEND_API_KEY!);

const getAuthenticatedUser = (req : Request) : string | null => {
    const token = req.cookies.auth;
    if(!token) return null;

    try{
        const decoded = jwt.verify(token, JWT_SECRET) as {email : string};
        return decoded.email;
    }catch{
        return null
    }
}

const sendMail = async (to: string, subject: string, text: string) => {
    if (process.env.NODE_ENV === "dev") {
        console.log(`DEV MODE : Would send email to ${to} with link : ${text}`);
        return;
    }
    try {
        await resend.emails.send({
            from : "onboarding@resend.dev",
            to,
            subject,
            text
        });
        console.log(`Email sent to ${to}`);
    }catch(err){
        console.error("Error sending the email : ", err);
    }
}


app.post("/api/v1/signup", async (req :Request , res : Response) => {
    const {email} = req.body;

    if(!email) {
        return res.status(400).json({ error : "Please enter an email to signup"});
    }

    try{
        const correlationId = uuidv4();

        await redisClient.xAdd("price_updates_stream", "*", {
            type : "signup",
            email,
            createdAt : Date.now().toString(),
            correlationId
        });

        const response =  await redisSubscriber.waitForMessage(correlationId);

        if(response.status !== "success"){
            return res.status(500).json({ error : response.error || "Signup Failed"});
        }

        const token = jwt.sign({email}, JWT_SECRET);
        res.cookie("auth", token, { httpOnly: true });
        const link = `http://localhost:${port}/api/v1/signin/post?token=${token}`;
        await sendMail(email, "Signup Link", link);

        res.status(200).json({ message : "Signup successful, email sent"});
    }catch(err){
        console.error("Signup Error : ", err);
        //@ts-ignore
        if (err.message && err.message.includes("Timeout")) {
            return res.status(504).json({ error : "Engine did not respond in time"});
        }
        
        return res.status(500).json({ error : "Internal Server Error"});
    }
});


app.post("/api/v1/signin", async (req : Request, res : Response) => {
    const {email} = req.body;

    if(!email){
        return res.status(400).json({ error : "Please enter an email to signin"});
    }

    try{
        const correlationId = uuidv4();

        await redisClient.xAdd("price_updates_stream", "*", {
            type : "signin",
            email,
            createdAt : Date.now().toString(),
            correlationId
        });

        const response = await redisSubscriber.waitForMessage(correlationId);

        if(response.status !== "success"){
            return res.status(404).json({ error : response.error || "User not Found"});
        }

        const token = jwt.sign({email}, JWT_SECRET);
        res.cookie("auth", token, { httpOnly: true });
        const link = `http://localhost:${port}/api/v1/signin/post?token=${token}`;
        await sendMail(email, "Signup Link", link);

        res.status(200).json({ message : "Signin email sent", token});
    }catch(err){
        console.error("Signin Error : ", err);

        //@ts-ignore
        if (err.message && err.message.includes("Timeout")) {
            return res.status(504).json({ error : "Engine did not respond in time"});
        }
        
        return res.status(500).json({ error : "Internal Server Error"});
    }
});

app.get("/api/v1/signin/post", async (req: Request, res: Response) => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: "Invalid token" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { email: string };
        res.cookie("auth", token, { httpOnly: true });
        const redirectUrl = "http://localhost:3000/dashboard";
        res.redirect(redirectUrl);
    } catch (err) {
        return res.status(400).json({ error: "Invalid or expired token" });
    }
});

app.post("/api/v1/trade/create", async (req : Request, res : Response) => {

    const email = getAuthenticatedUser(req);
    if(!email){
        return res.status(401).json({ error : "Authentication required"});
    }

    const {asset, type, margin, leverage, slippage} = req.body;

    if (!asset || !type || !margin || !leverage || !slippage) {
        return res.status(400).json({ error: "all fields are required" });
    }

    try{
        const correlationId = uuidv4();

        await redisClient.xAdd("price_updates_stream", "*",{
            type : "trade_create",
            email,
            asset,
            tradeType : type,
            margin : margin.toString(),
            leverage : leverage.toString(),
            slippage : slippage.toString(),
            createdAt : Date.now().toString(),
            correlationId
        });

        const response = await redisSubscriber.waitForMessage(correlationId);

        if(response.status !== "success"){
            return res.status(400).json({
                error : response.error || "Trade creation failed"
            });
        }

        res.status(200).json({
            orderId : response.orderId
        });
    }catch(err){
        console.error("Trade creation error : ", err);

        //@ts-ignore
        if (err.message && err.message.includes("Timeout")) {
            return res.status(504).json({ error: "Engine did not respond in time" });
        }
        
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/api/v1/trade/close", async (req: Request, res: Response) => {
    const email = getAuthenticatedUser(req);
    if (!email) {
        return res.status(401).json({ error: "Authentication required" });
    }

    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
    }

    try {
        const correlationId = uuidv4();

        await redisClient.xAdd("price_updates_stream", "*", {
            type: "trade_close",
            email,
            orderId: orderId.toString(),
            createdAt: Date.now().toString(),
            correlationId
        });

        const response = await redisSubscriber.waitForMessage(correlationId);

        if (response.status !== "success") {
            return res.status(400).json({
                error: response.error || "Trade close failed"
            });
        }

        res.status(200).json({
            message: "Trade closed successfully",
            pnl: response.pnl,
            newBalance: response.userBalance
        });
    } catch (err) {
        console.error("Trade close error:", err);

        //@ts-ignore
        if (err.message && err.message.includes("Timeout")) {
            return res.status(504).json({ error: "Engine did not respond in time" });
        }

        return res.status(500).json({ error: "Internal Server Error" });
    }
});



app.listen(port);
