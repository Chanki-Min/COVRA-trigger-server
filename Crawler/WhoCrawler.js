
const fs = require("fs");
const { exception } = require("console");
const assert = require("assert");

const PuppeteerCrawler = require("./PuppeteerCrawler");

require("dotenv").config();
require("../utils")();

class WhoCrawler extends PuppeteerCrawler {
    constructor() {
        super();
    }

    async crawlWho() {
        await this.startPuppeteer();
        await this.connectMongoDB();
        await this.goToUrl(process.env.WHO_URL);

        const csvFileBuffer = await this.downloadWhoCsv(
            process.env.WHO_DATA_PATH
        );
        if (csvFileBuffer === undefined) {
            console.warn(
                `Failed to open download gisais csv, csv file is undefined`
            );
            return;
        }

        const sortColumnList = ["Date_reported", "Country_code"];
        const generateCompareator = (cmpKey1, cmpKey2) => {
            return (a, b) => {
                if (b[cmpKey1] > a[cmpKey1]) {
                    return 1;
                } else if (b[cmpKey1] == a[cmpKey1]) {
                    if(a[cmpKey2] > b[cmpKey2]) {
                        return 1;
                    } else if(a[cmpKey2] == b[cmpKey2]) {
                        return 0;
                    } else {
                        return -1;
                    }
                } else {
                    return -1;
                }
            };
        };

        const latestDateOrNull = await this.findLatestDate();
        const latestDate =
            latestDateOrNull !== null ? latestDateOrNull : "0000-01-01";

        const newDataList = processCsvAndReturnUpdatedData(
            csvFileBuffer,
            ",",
            "\n",
            sortColumnList,
            latestDate,
            generateCompareator
        );
        if (newDataList.length != 0) {
            //데이터를 DB에 저장한다
            await this.insertManyWhoMetaData(newDataList);
        }

        //아직 보내지 않은 데이터를 검색한다
        const unsentDataList = await this.findLatestMetaDataByEventLog();

        if (unsentDataList === undefined) {
            //아직 eventLog에 아무런 데이터가 없다면 새로 찾은 데이터만 넣는다.
            console.warn(
                `eventLog collection doesn't have data. sending newDataList, length : ${newDataList.length}`
            );
            if (newDataList.length != 0) {
                //
                //await this.sendMetaDataList(newDataList, process.env.IFTTT_GISAID_WEBHOOK_URL);
                //eventLog 초기화
                await this.insertEventLog(newDataList);
                console.log(
                    `send ${newDataList.length} data via ifttt webhook`
                );
            } else {
                console.log("nothing to send, terminating crawler");
            }
        } else {
            if (unsentDataList.length != 0) {
                console.log(
                    `found ${unsentDataList.length} number of unsent metaData`
                );
                //await this.sendMetaDataList(unsentDataList, process.env.IFTTT_GISAID_WEBHOOK_URL);
                //eventLog에 저장한다
                await this.insertEventLog(unsentDataList);
                console.log(
                    `send ${unsentDataList.length} data via ifttt webhook`
                );
            } else {
                console.log("nothing to send, terminating crawler");
            }
        }

        this.close();
    }

    async insertEventLog(metaDataList) {
        const eventLog = {
            lastData: metaDataList[0],
            eventAt: new Date(),
        };

        const collection = this.whoDB.collection(
            process.env.MONGO_WHO_COLLECTION_EVENT_LOG
        );

        try {
            const result = await collection.insertMany([eventLog], null);
            assert(metaDataList.length, result.insertedCount);
            console.log(
                `${result.insertedCount} data inserted successfully to ${process.env.MONGO_WHO_DB_NAME}/${process.env.MONGO_WHO_COLLECTION_EVENT_LOG} collection`
            );
        } catch(error) {
            console.error(error);
        }
    }

    async insertManyWhoMetaData(metaDataList) {
        if (!(metaDataList instanceof Array)) {
            throw new exception(
                `insertManyMetaData function requires Array, current type : ${typeof metaDataList}`
            );
        }

        const collection = this.whoDB.collection(
            process.env.MONGO_WHO_COLLECTION_METADATA
        );

        try {
            const result = await collection.insertMany(metaDataList, null);
            assert(metaDataList.length, result.insertedCount);
            console.log(
                `${result.insertedCount} data inserted successfully to ${process.env.MONGO_WHO_DB_NAME}/${process.env.MONGO_WHO_COLLECTION_METADATA} collection`
            );
        } catch(error) {
            console.error(error);
        }
    }

    async findLatestMetaDataByEventLog() {
        const eventLogCol = this.whoDB.collection(
            process.env.MONGO_WHO_COLLECTION_EVENT_LOG
        );
        const metaDataCol = this.whoDB.collection(
            process.env.MONGO_WHO_COLLECTION_METADATA
        );
        const agg = [
            {
                $sort: {
                    eventAt: -1,
                },
            },
            {
                $limit: 1,
            },
        ];

        const aggregateCursor = eventLogCol.aggregate(agg, null);
        const eventLog = await aggregateCursor.next();

        //evntLog 컬렉션에 아무 데이터도 없는 경우
        if (eventLog === null) {
            return undefined;
        } else {
            const unsentDataListCursor = await metaDataCol.find(
                {
                    Date_reported: {
                        $gt: eventLog.lastData.Date_reported,
                    },
                },
                null
            );
            return unsentDataListCursor.toArray();
        }
    }

    async findLatestDate() {
        const collection = this.whoDB.collection(
            process.env.MONGO_WHO_COLLECTION_METADATA
        );
        const agg = [
            {
                $group: {
                    _id: "$Date_reported",
                },
            },
            {
                $sort: {
                    _id: -1,
                },
            },
        ];
        const aggregateCursor = collection.aggregate(agg, null);

        const result = await aggregateCursor.next();
        return result !== null ? result._id : null;
    }

    async downloadWhoCsv(dirPath) {
        const downladeButton = await this.page.$x("//a[@download]");

        const fileUrl = (await downladeButton[0].getProperty("href"))
            ._remoteObject.value;

        const fileName = fileUrl.substr(fileUrl.lastIndexOf("/") + 1);
        const filePath = `${dirPath}/${fileName}`;

        console.log(`try to download who csv data`);

        await this.page._client.send("Page.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: dirPath,
        });
        await downladeButton[0].click();
        try {
            await checkFileDownloadedWithinTimeout(filePath, 5000);
        } catch (e) {
            console.error(e);
            return undefined;
        }
        console.log("Who CSV data download complete");

        return fs.readFileSync(filePath);
    }
}

module.exports = WhoCrawler;
