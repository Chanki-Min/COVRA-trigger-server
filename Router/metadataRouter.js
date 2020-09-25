const express = require('express');
const router = express.Router();
const { gzip, ungzip } = require("node-gzip");
const MongoClient = require("mongodb").MongoClient;
require("../utils")();

const GISAID_COLLECTION = process.env.MONGO_GISAID_COLLECTION_METADATA;
const WHO_COLLECTION = process.env.MONGO_WHO_COLLECTION_METADATA;

router.get(
    '/metadata',
    wrapAsyncFn(async (req, res) => {
        const dbConnection = await connectMongoDB();
        const subject = req.query.subject;
        let payload;
        switch(subject) {
            case 'gisaid':
                payload = await findAll(dbConnection.gisaidDB, GISAID_COLLECTION);
                payload = (await gzip(JSON.stringify(payload)));
                res.set({encoding: null}).send(payload);
                break;
            case 'who':
                payload = await findAll(dbConnection.whoDB, WHO_COLLECTION);
                payload = (await gzip(JSON.stringify(payload)));
                res.set({encoding: null}).send(payload);
                break;
            default:
                res.set(404).send({error: 'no such subject'})
        }
        await closeMongoDB(dbConnection.client);
    })  
)

const connectMongoDB = async () => {
    const client = await MongoClient.connect(process.env.MONGO_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    }).catch((e) => console.error(e));

    return({
        client: client, 
        gisaidDB : client.db(process.env.MONGO_GISAID_DB_NAME),
        whoDB : client.db(process.env.MONGO_WHO_DB_NAME),
    });
}

const closeMongoDB = async (client) => {
    return await client.close();
}

const findAll = async (db, collection) => {
    const cursor = await db.collection(collection).find({});
    return(await cursor.toArray());
}

module.exports = router;