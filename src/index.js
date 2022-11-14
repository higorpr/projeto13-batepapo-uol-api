import express, { json } from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import dayjs from "dayjs";
import "dayjs/locale/pt-br.js";
import joi from "joi";
import { stripHtml } from "string-strip-html";

//configs 
const app = express();
app.use(cors());
app.use(json());
dotenv.config();

// global variables & constants
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
let usersDB;
let messagesDB;

const participantSchema = joi.object({
    name: joi.string().required(),
});

// Connect to the mongoDB server
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

    // Gets all connected users
    try {
        userArray = await usersDB.find().toArray();
    } catch (err) {
        console.log("An error occurred: ", err);
        return;
    }

    // Deletes users that are inactive
    try {
        userArray.forEach(async (u) => {
            if (Date.now() - u.lastStatus > limit) {
                await usersDB.deleteOne({
                    name: u.name,
                });

                const message = {
                    from: u.name,
                    to: "Todos",
                    text: "Sai da sala...",
                    type: "message",
                    time: dayjs().format("hh:mm:ss"),
                };
                await messagesDB.insertOne(message);
            }
        });
    } catch (err) {
        console.log(err);
    }
}

// Initializations
setInterval(dropUser, 15000);

// Routes
app.post("/participants", async (req, res) => {
    let { name } = req.body;
    if (name) {
        name = stripHtml(name).result.trim();
    }

    const validError = participantSchema.validate(
        { name },
        { abortEarly: false }
    ).error;

    if (validError) {
        const errors = validError.details.map((e) => e.message);
        res.status(422).send(errors);
        return;
    }

    // Checks if user is already registered
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
    let { to, text, type } = req.body;
    const { user } = req.headers;
    if (to && text && type) {
        to = stripHtml(to).result.trim();
        text = stripHtml(text).result.trim();
        type = stripHtml(type).result.trim();
    }

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

        if (!limit) {
            res.status(200).send(allMsg);
        } else {
            const msgs = allMsg.slice(-limit);
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

app.delete("/messages/:id", async (req, res) => {
    const { id } = req.params;
    const { user } = req.headers;

    try {
        const msg = await messagesDB.findOne({ _id: ObjectId(id) });
        if (msg.from !== user) {
            res.status(401).send("Você não pode deletar esta mensagem.");
            return;
        }

        if (msg) {
            await messagesDB.deleteOne({ _id: ObjectId(id) });
            res.sendStatus(200);
        }
    } catch (err) {
        console.log(err);
        res.sendStatus(404);
    }
});

app.put("/messages/:id", async (req, res) => {
    const { id } = req.params;
    const { to, text, type } = req.body;
    const { user } = req.headers;

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

    try {
        const msg = await messagesDB.findOne({ _id: ObjectId(id) });
        if (msg.from !== user) {
            res.status(401).send("Você não pode alterar esta mensagem.");
            return;
        }

        if (msg) {
            await messagesDB.updateOne(
                { _id: ObjectId(id) },
                { $set: req.body }
            );
            res.sendStatus(200);
        }
    } catch (err) {
        console.log(err);
        res.sendStatus(404);
    }
});

const port = 5000;
app.listen(port, () => console.log(`Backend app running on port ${port}.`));
