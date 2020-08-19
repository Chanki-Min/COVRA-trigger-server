require("dotenv").config();
require("./utils.js")();

const GisaidCrawler = require("./GisaidCrawler");
const WhoCrawler = require("./Crawler/WhoCrawler");

const schedule = require("node-schedule");
const GISAID_CRON = process.env.CRWALER_GISALD_CRON;
const WHO_CRON = process.env.CRWALER_WHO_CRON;

(async () => {
    const gisaidCrawler = new GisaidCrawler();
    const whoCrawler = new WhoCrawler();

    schedule.scheduleJob(GISAID_CRON, async () => {
        console.log("running gisaid crawler");
        //kawait gisaidCrawler.crawlGisaid();
    });

    schedule.scheduleJob(WHO_CRON, async () => {
        console.log("running who crawler");
        await whoCrawler.crawlWho();
    });
})();

return 0;
