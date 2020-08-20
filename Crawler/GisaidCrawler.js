const { ungzip } = require("node-gzip");
const fs = require("fs");
const { exception } = require("console");

const assert = require("assert");

const PuppeteerCrawler = require("./PuppeteerCrawler");
require("dotenv").config();
require("../utils")();

class GisaidCrawler extends PuppeteerCrawler {
    constructor() {super()}

    async crawlGisaid() {
        await this.connectMongoDB();
        await this.startPuppeteer();
        await this.goToUrl(process.env.GISAID_URL);
        await this.performGisaidLogin(
            process.env.GISAID_ID,
            process.env.GISAID_PW
        );
        const csvFileBuffer = await this.downloadGisaidCsv(
            process.env.GISAID_DATA_PATH
        );

        if (csvFileBuffer === undefined) {
            console.warn(
                `Failed to open download gisais csv, csv file is undefined`
            );
            return;
        }

        const sortColumnList = ["gisaid_epi_isl"];
        const generateCompareator = (cmpKey) => {
            return (a, b) => {
                if (b[cmpKey] > a[cmpKey]) {
                    return 1;
                } else if (b[cmpKey] == a[cmpKey]) {
                    return 0;
                } else {
                    return -1;
                }
            };
        };

        const latestMetaDataOrNull = await this.findLatestMetaData();
        //TODO : null인경우의 최소 삽입 id 명시할 것
        const latestId =
            latestMetaDataOrNull !== null
                ? latestMetaDataOrNull.gisaid_epi_isl
                : "EPI_ISL_000000";
        const newDataList = processCsvAndReturnUpdatedData(
            csvFileBuffer,
            "\t",
            "\n",
            sortColumnList,
            latestId,
            generateCompareator
        );

        if (newDataList.length != 0) {
            //데이터를 DB에 저장한다
            await this.insertManyMetaData(newDataList);
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
            if (unsentDataList != null) {
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

        const collection = this.gisaidDB.collection(
            process.env.MONGO_GISAID_COLLECTION_EVENT_LOG
        );
        await collection.insertMany([eventLog], function (err, result) {
            if (err != null) {
                console.log(err, result);
            }
            assert(metaDataList.length, result.insertedCount);
            console.log(
                `${result.insertedCount} data inserted successfully to ${process.env.MONGO_GISAID_DB_NAME}/${process.env.MONGO_GISAID_COLLECTION_EVENT_LOG} collection`
            );
        });
    }

    /**
     * 데이터 리스트를 삽입한다.
     *
     * @param {Array} metaDataList
     */
    async insertManyMetaData(metaDataList) {
        if (!(metaDataList instanceof Array)) {
            throw new exception(
                `insertManyMetaData function requires Array, current type : ${typeof metaDataList}`
            );
        }

        const collection = this.gisaidDB.collection(
            process.env.MONGO_GISAID_COLLECTION_METADATA
        );

        await collection.insertMany(metaDataList, function (err, result) {
            if (err != null) {
                console.log(err, result);
            }
            assert(metaDataList.length, result.insertedCount);
            console.log(
                `${result.insertedCount} data inserted successfully to ${process.env.MONGO_GISAID_DB_NAME}/${process.env.MONGO_GISAID_COLLECTION_METADATA} collection`
            );
        });
    }

    async findLatestMetaDataByEventLog() {
        const eventLogCol = this.gisaidDB.collection(
            process.env.MONGO_GISAID_COLLECTION_EVENT_LOG
        );
        const metaDataCol = this.gisaidDB.collection(
            process.env.MONGO_GISAID_COLLECTION_METADATA
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
                    gisaid_epi_isl: {
                        $gt: eventLog.lastData.gisaid_epi_isl,
                    },
                },
                null
            );
            return unsentDataListCursor.next();
        }
    }

    /**
     *
     * @returns {Object} : 가장 높은 epi_isl을 가진 메타데이터
     */
    async findLatestMetaData() {
        const collection = this.gisaidDB.collection(
            process.env.MONGO_GISAID_COLLECTION_METADATA
        );
        const agg = [
            {
                $sort: {
                    gisaid_epi_isl: -1,
                },
            },
            {
                $limit: 1,
            },
        ];

        const aggregateCursor = collection.aggregate(agg, null);

        const result = await aggregateCursor.next();
        return result;
    }

    async performGisaidLogin(base64Id, base64Pw) {
        //로그인 절차 시작
        await this.page.type("#elogin", base64ToStr(base64Id));
        await this.page.type("#epassword", base64ToStr(base64Pw));
        await this.page.click(
            "#login > div:nth-child(2) > input.form_button_submit"
        );
        //로그인 완료 대기
        await this.page.waitForNavigation();
    }

    /**
     * 새로운 파일인 경우 다운로드하여 tsv 파일의 저장 경로를 반환한다
     *
     * @param {string} dirPath : 다운로드 경로
     * @returns <Buffer | undefined : 다운로드 하지 않은 경우>
     */
    async downloadGisaidCsv(dirPath) {
        const downloadPageButton = await this.page.$x(
            '//div[@class="sys-actionbar-action" and text()="Downloads"]'
        );
        await downloadPageButton[0].click();
        await this.page.waitForNavigation();
        await this.page.waitFor(5000);

        const downloadFrame = this.page.mainFrame().childFrames()[0];
        if ((await this.checkIsGisaidCaptchaFrame(downloadFrame)) === true) {
            //캡차 걸림
        }

        const downloadFileButton = (
            await downloadFrame.$x(
                '//div[@class="downicon" and ./div[text()="nextmeta"]]'
            )
        )[0];
        const fileName = (await downloadFileButton.getProperty("title"))
            ._remoteObject.value;
        console.log(`current fileName = ${fileName}`);

        await this.page._client.send("Page.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: dirPath,
        });
        await downloadFileButton.click();
        const gzipFilePath = `${dirPath}/${fileName}`;
        const uncompressedFilePath = gzipFilePath.replace(".gz", "");
        try {
            await checkFileDownloadedWithinTimeout(gzipFilePath, 5000);
        } catch (e) {
            console.error(e);
            return undefined;
        }
        console.log("Download complete");

        //파일의 압축을 푼다
        const uncompressed = await ungzip(fs.readFileSync(gzipFilePath));
        fs.writeFileSync(uncompressedFilePath, uncompressed);

        //압축파일은 삭제
        fs.unlinkSync(gzipFilePath);
        return uncompressed;
    }

    async checkIsGisaidCaptchaFrame(frame) {
        //캡챠에 걸렸는지를 확인한다.
        const captcha = await frame.$x(
            '//div[@class = "sys-form-label" and contains(string(), "Prove that you are not a robot:")]'
        );
        if (captcha.length != 0) {
            return true;
        } else {
            return false;
        }
    }
};

module.exports = GisaidCrawler;