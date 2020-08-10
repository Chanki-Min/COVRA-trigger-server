require(`./utils.js`)();
const _ = require('lodash');
require("dotenv").config();
const mongoose = require("mongoose");
const gisaidCovMetaData = require("./Model/gisaidCovMetaData.js");
const gisaidCrawlLog = require("./Model/gisaidCrawlLog.js");

mongoose.Promise = global.Promise;
mongoose.connect(process.env.MONGO_URL, {useNewUrlParser: true, dbName : "gisaid"})
  .then(() => console.log('Successfully connected to mongodb'))
  .catch(e => console.error(e));


let covMetaData = {
    'age' :'38',
    'country' :'South Africa',
    'date' :'2020-06-16',
    'division' :'North West',
    'GISAID_clade' :'GR',
    'gisaid_epi_isl' :'EPI_ISL_504188',
    'location' : undefined,
    'pangolin_lineage' :'B.1.1.1',
    'region' :'Africa',
    'sex' :'Female',
    'strain' :'hCoV-19/South Africa/R12544-20/2020',
    'submit_date' :'2020-08-01',
};

let dataList = [];
for(let i =0; i<10; i++) {
  let data = _.cloneDeep(covMetaData);
  data.gisaid_epi_isl = addIntToEpiIsl(data.gisaid_epi_isl, i+1);
  dataList.push(data);
}




(async () => {

    const log = await gisaidCrawlLog.findLatestByCrawlingFinishDate();

    try {
      const bulkRes = await gisaidCovMetaData.bulkWrite(dataList.map(data => (
            {
              insertOne : {
                document : data
              }
            }
          )
        )
      )
    } catch(err) {
      console.log(`ERROR : ${err}`)
    }

    console.log(JSON.stringify(bulkRes, undefined, 4))

    let i = 1;
})();
