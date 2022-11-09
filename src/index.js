import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

//configs
const app = express();
app.use(cors());
app.use(json());
dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
let users;
let messages;

// Connecting to the mongoDB server
mongoClient
    .connect()
    .then(() => {
        db = mongoClient.db("chatDB");
        users = db.collection("users");
        messages = db.collection("messages");
    })
    .catch((err) => {
        console.log(err);
    });

// Routes
app.post("/participants", (req, res) => {
    const { name } = req.body;
    if (!name) {
        res.status(422).send("Por favor, insira um nome.");
        return;
    }

    const user = { name, lastStatus: Date.now() };
    const message = { from: name, to: "Todos", text: 'entra na sala...', type:'stauts', time: Date.now()};
    users.insertOne(user);
    messages.insertOne(message);
    res.sendStatus(201);
});

const port = 5000;
app.listen(port, () => console.log(`Backend app running on port ${port}.`));
