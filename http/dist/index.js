import express, {} from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { Resend } from "resend";
import dotenv from "dotenv";
import { createClient } from "redis";
import { v4 as uuidv4 } from "uuid";
import { RedisSubscriber } from "./redisSubscriber.js";
const redisClient = createClient({
    socket: {
        host: "localhost",
        port: 6379
    }
});
const redisSubscriber = new RedisSubscriber();
dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;
const port = process.env.PORT;
const app = express();
app.use(express.json());
app.use(cors());
app.use(cookieParser());
await redisClient.connect();
const resend = new Resend(process.env.RESEND_API_KEY);
const sendMail = async (to, subject, text) => {
    if (process.env.NODE_ENV === "dev") {
        console.log(`DEV MODE : Would send email to ${to} with link : ${text}`);
        return;
    }
    try {
        await resend.emails.send({
            from: "onboarding@resend.dev",
            to,
            subject,
            text
        });
        console.log(`Email sent to ${to}`);
    }
    catch (err) {
        console.error("Error sending the email : ", err);
    }
};
app.post("/api/v1/signup", async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: "Please enter an email to signup" });
    }
    try {
        const correlationId = uuidv4();
        await redisClient.xAdd("price_updates_stream", "*", {
            type: "signup",
            email,
            createdAt: Date.now().toString(),
            correlationId
        });
        const response = await redisSubscriber.waitForMessage(correlationId);
        if (response.status !== "success") {
            return res.status(500).json({ error: response.error || "Signup Failed" });
        }
        const token = jwt.sign({ email }, JWT_SECRET);
        const link = `http://localhost:${port}/api/v1/signin/post?token=${token}`;
        await sendMail(email, "Signup Link", link);
        res.status(200).json({ message: "Signup successful, email sent" });
    }
    catch (err) {
        console.error("Signup Error : ", err);
        //@ts-ignore
        if (err.message && err.message.includes("Timeout")) {
            return res.status(504).json({ error: "Engine did not respond in time" });
        }
        return res.status(500).json({ error: "Internal Server Error" });
    }
});
app.listen(port);
//# sourceMappingURL=index.js.map