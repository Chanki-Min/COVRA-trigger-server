const _ = require('lodash');
require('dotenv').config();
require('./utils.js')();
require('./crawler.js')();

const mongoose = require("mongoose");
const gisaidCovMetaData = require("./Model/gisaidCovMetaData.js");
const gisaidCrawlLog = require("./Model/gisaidCrawlLog.js");

mongoose.Promise = global.Promise;

console.log(`
Initiaing trigger server...

Connecting to MongoDB 
URL : ${process.env.MONGO_URL}
DB name : ${process.env.MONGO_GISAID_DB_NAME}
`);

(async () => {
    try {
        mongoose.connect(process.env.MONGO_URL, {useNewUrlParser: true, dbName : process.env.MONGO_GISAID_DB_NAME})
        console.log('Successfully connected to mongodb')
    } catch(err) {
        console.error(e)
        return 1;
    }

    let latestLog = await gisaidCrawlLog.findLatestByCrawlingFinishDate();
    console.log(latestLog);
    if(latestLog === undefined) {
        console.log(`
WARN :: No crawling log in gisaidCrawlLog collection.
Try to create pesudo log
        `)
        await gisaidCrawlLog.create(
            {
                fromSubmission : new Date(),
                toSubmission : new Date(),
                crawlingFinishDate : new Date(),
            }
        )
        latestLog = await gisaidCrawlLog.findLatestByCrawlingFinishDate();

    }
    console.log(`
Current time : ${new Date().toISOString()}

Latest crawlingFinishiDate : ${latestLog.crawlingFinishDate}
Latest fromSubmission : ${latestLog.fromSubmission}
Latest toSubmission : ${latestLog.toSubmission}
    `)

    const dateDiffByDay = dateDiffInDays(new Date(), latestLog.toSubmission);
    if(dateDiffByDay > 0) {
        const crawler = new GisaidCrawler(latestLog.toSubmission, new Date(), gisaidCovMetaData);
        await crawler.crawlGisaid();
        
    } else if(dateDiffByDay < 0) {
        //예외 :: 마지막 크롤링 범위가 현재 시간보다 앞서는 경우
    } else {
        //하루 대기
    }

})();

return 0;