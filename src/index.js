import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import dayjs from "dayjs";
import "dayjs/locale/pt-br.js";

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
        // users.findOne({ name: "Higor" }).then((user) => console.log(user));
        console.log("MongoDB server connected");
    })
    .catch((err) => {
        console.log(err);
    });

// Routes
app.post("/participants", (req, res) => {
    const { name } = req.body;
    // Check if name was sent
    if (!name) {
        res.status(422).send("Por favor, insira um nome.");
        return;
    }

    // Check if user is already registered
    users
        .findOne({ name: name })
        .then((u) => {
            if (!u) {
                const user = { name, lastStatus: Date.now() };
                const message = {
                    from: name,
                    to: "Todos",
                    text: "entra na sala...",
                    type: "stauts",
                    time: dayjs().format("hh:mm:ss"),
                };
                users.insertOne(user);
                messages.insertOne(message);
                res.sendStatus(201);
            } else {
                res.status(409).send('Este usuário já está cadastrado')
            }
        })
        .catch((err) => {
            console.log(err);
        });
});

app.get('/participants', (req,res) => {
    users.find().toArray().then((users) => {
        const allUsers = [];
        users.forEach((user) => {
            allUsers.push({name: user.name, lastStatus:user.lastStatus})
        })
        allUsers.reverse()
        res.status(200).send(allUsers)
    })
    
})

const port = 5000;
app.listen(port, () => console.log(`Backend app running on port ${port}.`));
