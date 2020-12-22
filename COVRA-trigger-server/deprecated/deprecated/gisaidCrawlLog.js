const mongoose = require('mongoose');

const gisaidCrawlLog = new mongoose.Schema(
    {
    fromSubmission : {type : Date},
    toSubmission : {type : Date},
    crawlingFinishDate : {type : Date},
    },
    {
        timestamps : true
    }
);

gisaidCrawlLog.statics.create = function(payload) {
    const log = new this(payload);
    return log.save();
}

gisaidCrawlLog.statics.findLatestByCrawlingFinishDate = function () {
    return this.findOne().sort({crawlingFinishDate : -1});
}

module.exports = mongoose.model('gisaidCrawlLog', gisaidCrawlLog);