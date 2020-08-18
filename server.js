const _ = require('lodash');
require('dotenv').config();
require('./utils.js')();
//require('./crawler.js')();
const GisaidCrawler = require('./GisaidCrawler');


const schedule = require('node-schedule');
const GISAID_CRON = process.env.CRWALER_GISALD_CRON;
const WHO_CRON = process.env.CRWALER_WHO_CRON;



(async () => {
    const crawler = new GisaidCrawler();
    schedule.scheduleJob(GISAID_CRON, async () => {
        console.log('running gisaid crawler')
        await crawler.crawlGisaid();
    })
})();

return 0;