import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import dayjs from "dayjs";
import "dayjs/locale/pt-br.js";
import joi from "joi";

//configs
const app = express();
app.use(cors());
app.use(json());
dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
let usersDB;
let messagesDB;

const participantSchema = joi.object({
    name: joi.string().required(),
});

// Connecting to the mongoDB server
try {
    await mongoClient.connect();
    db = mongoClient.db("chatDB");
    usersDB = db.collection("users");
    messagesDB = db.collection("messages");
    console.log("MongoDB server connected");
} catch (err) {
    console.log(err);
}

// Functions
async function dropUser() {
    let userArray;
    const limit = 10000;

    // Getting all connected users
    try {
        userArray = await usersDB.find().toArray();
    } catch (err) {
        console.log("An error occurred: ", err);
        return;
    }

    // Deleting users that are inactive
    try {
        userArray.forEach(async (u) => {
            const delUser = await usersDB.deleteOne({
                lastStatus: { $lt: Date.now() - limit },
            });
            console.log(delUser);

            const message = {
                from: u.name,
                to: "Todos",
                text: "Sai da sala...",
                type: "message",
                time: dayjs().format("hh:mm:ss"),
            };
            const updMessages = await messagesDB.insertOne(message);
            console.log(updMessages)
        });
    } catch (err) {
        console.log(err);
    }
    // try {
    //     const delRes = await usersDB.deleteMany({
    //         lastStatus: { $lt: Date.now() - limit },
    //     });
    //     console.log(delRes);
    // } catch (err) {
    //     console.log(err);
    //     return;
    // }
}

// Initializations
setInterval(dropUser, 15000);

// Routes
app.post("/participants", async (req, res) => {
    const { name } = req.body;

    const validError = participantSchema.validate(
        { name },
        { abortEarly: false }
    ).error;

    if (validError) {
        const errors = validError.details.map((e) => e.message);
        res.status(422).send(errors);
        return;
    }

    // Check if user is already registered
    try {
        const checkUser = await usersDB.findOne({ name: name });
        if (!checkUser) {
            const user = { name, lastStatus: Date.now() };
            const message = {
                from: name,
                to: "Todos",
                text: "entra na sala...",
                type: "status",
                time: dayjs().format("hh:mm:ss"),
            };
            usersDB.insertOne(user);
            messagesDB.insertOne(message);
            res.status(201).send("O usuário foi registrado com sucesso.");
        } else {
            res.status(409).send("Este usuário já está cadastrado.");
        }
    } catch (err) {
        console.log(err);
    }
});

app.get("/participants", async (req, res) => {
    try {
        const usersArr = await usersDB.find().toArray();
        res.status(200).send(usersArr.reverse());
    } catch (err) {
        console.log(err);
    }
});

app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body;
    const { user } = req.headers;
    // Validation block
    try {
        const allUsers = await usersDB.find().toArray();
        const usersArray = allUsers.map((u) => u.name);
        const messageSchema = joi.object({
            to: joi.string().required(),
            text: joi.string().required(),
            type: joi.string().valid("message", "private_message").required(),
            user: joi.string().valid(...usersArray),
        });

        const messageCheck = { user, to, text, type };

        const validError = messageSchema.validate(messageCheck, {
            abortEarly: false,
        });

        if (validError.error) {
            const errors = validError.error.details.map((e) => e.message);
            res.status(422).send(errors);
            return;
        }
    } catch (err) {
        res.status(500).send("Não foi possivel recuperar os usuários logados.");
        return;
    }

    const message = {
        from: user,
        to,
        text,
        type,
        time: dayjs().format("hh:mm:ss"),
    };

    try {
        await messagesDB.insertOne(message);
        res.status(201).send("Mensagem salva!");
    } catch (err) {
        res.status(500).send("Não foi possível salvar a mensagem.");
    }
});

app.get("/messages", async (req, res) => {
    const { limit } = req.query;
    const { user } = req.headers;
    try {
        const allMsg = await messagesDB
            .find({ $or: [{ from: user }, { to: user }, { to: "Todos" }] })
            .toArray();
        const orderedMsg = [...allMsg].reverse();
        if (!limit) {
            res.status(200).send(orderedMsg);
        } else {
            const msgs = orderedMsg.slice(0, limit);
            res.status(200).send(msgs);
        }
    } catch (err) {
        console.log(err);
    }
});

app.post("/status", async (req, res) => {
    const { user } = req.headers;

    // User validation
    try {
        const allUsers = await usersDB.find().toArray();
        const userArray = allUsers.map((u) => u.name);
        const userSchema = joi.object({
            user: joi
                .string()
                .valid(...userArray)
                .required(),
        });

        const errors = userSchema.validate(
            { user },
            { abortEarly: false }
        ).error;

        if (errors) {
            res.sendStatus(404);
            return;
        }
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }

    try {
        const updatedUser = { name: user, lastStatus: Date.now() };
        await usersDB.updateOne({ name: user }, { $set: updatedUser });
        res.sendStatus(200);
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});

const port = 5000;
app.listen(port, () => console.log(`Backend app running on port ${port}.`));
