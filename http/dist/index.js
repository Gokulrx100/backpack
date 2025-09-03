import express, {} from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;
const port = process.env.PORT;
const app = express();
app.use(express.json());
app.use(cors());
app.use(cookieParser());
const users = [];
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
        return res.status(400).json({ error: "pls enter an email to signup" });
    }
    const user = users.find(u => u.email === email);
    if (user) {
        return res.status(400).json({ error: "User with this email already exists" });
    }
    users.push({ email: email });
    const token = jwt.sign({ email: email }, JWT_SECRET);
    const link = `http://localhost:${port}/api/v1/signin/post?token=${token}`;
    await sendMail(email, "Signup Link", link);
    res.status(200).json({ message: "Signup successful, email sent" });
});
app.post("/api/v1/signin", async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: "pls enter an email to signin" });
    }
    const user = users.find(u => u.email === email);
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }
    const token = jwt.sign({ email }, JWT_SECRET);
    const link = `http://localhost:${port}/api/v1/signin/post?token=${token}`;
    await sendMail(email, "Signin link", link);
    res.status(200).json({ message: "signin email sent" });
});
app.get("/api/v1/signin/post", (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).json({ error: "Token not Found" });
    }
    try {
        //@ts-ignore
        const decoded = jwt.verify(token, JWT_SECRET);
        res.cookie("auth", token, { httpOnly: true });
        return res.redirect("https://github.com/Gokulrx100");
    }
    catch (err) {
        return res.status(400).json({ error: "Invalid token" });
    }
});
app.listen(port);
//# sourceMappingURL=index.js.map