require("dotenv").config();
const express = require('express');
const app = express();
const schedule = require("node-schedule");
const got = require("got");

const GisaidCrawler = require("./Crawler/GisaidCrawler");
const WhoCrawler = require("./Crawler/WhoCrawler");
const dataRouter = require('./Router/metadataRouter');

const CRWALER_CRON = process.env.CRWALER_CRON;
const IFTTT_URL = process.env.IFTTT_WEBHOOK_URL;
const GISAID_METADATA_URL = process.env.GISAID_METADATA_URL;
const WHO_METADATA_URL = process.env.WHO_METADATA_URL;

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () => {
    const gisaidCrawler = new GisaidCrawler();
    const whoCrawler = new WhoCrawler();

    schedule.scheduleJob(CRWALER_CRON, async () => {
        console.log("running gisaid crawler");
        await gisaidCrawler.crawlGisaid();
        await whoCrawler.crawlWho();
        await sendIftttTriger(IFTTT_URL, METADATA_URL);
    });

    //await delay(10000);
    //await gisaidCrawler.crawlGisaid();
    //await whoCrawler.crawlWho();
    //console.log('sending IFTTT trigger')
    //await sendIftttTriger(IFTTT_URL, GISAID_METADATA_URL, WHO_METADATA_URL);
})();

app.use(dataRouter);
app.listen(process.env.PORT, process.env.IP, () => console.log(`server listening ${process.env.IP}:${process.env.PORT}`));

async function sendIftttTriger(iftttURL, gisaidURL, whoURL) {
    try {
        await got.post(iftttURL, {
            json: {
                value1: gisaidURL,
                value2: whoURL,
            }
        });
    } catch(e) {
        console.log(e);
    }
}