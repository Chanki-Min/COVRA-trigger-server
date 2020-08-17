const _ = require('lodash');
require('dotenv').config();
require('./utils.js')();
require('./crawler.js')();

const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');


(async () => {
    const crawler = new GisaidCrawler();
    await crawler.crawlGisaid();
})();

return 0;