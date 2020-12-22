const _ = require("lodash");
const userAgent = require("user-agents");
const puppeteer = require("puppeteer");

const { ungzip } = require("node-gzip");
const fs = require("fs");
const { exception } = require("console");

const MongoClient = require("mongodb").MongoClient;
const assert = require("assert");

const got = require("got");
const { toInteger } = require("lodash");

require("dotenv").config();
require("../utils")();

module.exports = function () {
    this.GisaidCrawler = class {
        constructor() {}

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
                console.warn(`Failed to open download gisais csv, csv file is undefined`);
                return;
            }

            const sortColumn = "gisaid_epi_isl";
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
                sortColumn,
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
                    await this.sendMetaDataList(newDataList);
                    //eventLog 초기화
                    await this.insertEventLog(newDataList);
                    console.log(`send ${newDataList.length} data via ifttt webhook`)

                } else {
                    console.log('nothing to send, terminating crawler')
                }
            } else {
                if (unsentDataList != null) {
                    console.log(`found ${unsentDataList.length} number of unsent metaData`)
                    await this.sendMetaDataList(unsentDataList);
                    //eventLog에 저장한다
                    await this.insertEventLog(unsentDataList);
                    console.log(`send ${unsentDataList.length} data via ifttt webhook`)
                } else {
                    console.log('nothing to send, terminating crawler')
                }
            }

            this.browser.close();
            this.closeMongoDB();
        }

        async connectMongoDB() {
            this.client = await MongoClient.connect(process.env.MONGO_URL, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            }).catch((e) => console.error(e));

            this.gisaidDB = this.client.db(process.env.MONGO_GISAID_DB_NAME);
        }

        async closeMongoDB() {
            await this.client.close();
            this.client = undefined;
            this.gisaidDB = undefined;
        }

        async sendMetaDataList(metaDataList) {
            const limitPerReq = toInteger(process.env.IFTTT_WEBHOOK_MAXIMUN_LENGTH_PER_REQUEST);
            const requestInterval = toInteger(process.env.IFTTT_WEBHOOK_REQUEST_INTERVAL);

            for(let i=0; i<metaDataList.length; i+=limitPerReq) {
                const payload = i+limitPerReq < metaDataList.length ? metaDataList.slice(i, i+limitPerReq) : metaDataList.slice(i, metaDataList.length);
                
                console.log(`sending webhook ${i/limitPerReq}/${metaDataList.length / limitPerReq}`)
                try {
                    await got.post(process.env.IFTTT_GISAID_WEBHOOK_URL, {
                        json: {
                            value1: payload,
                        },
                    });
                } catch(e) {
                    console.error(e);
                }
                await new Promise(r => setTimeout(r, requestInterval));
            }
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

        async startPuppeteer(enableDevtools = false) {
            // head가 있는 상태로 브라우저 실행,
            this.browser = await puppeteer.launch({ devtools: enableDevtools });
            this.page = await this.browser.newPage();
            //CAPTCHA 방어를 회피하기 위해서 user agent를 랜덤으로 생성하여 서버가 알 수 없도록 한다.
            await this.page.setUserAgent(userAgent.toString());
            //page 객체가 evaluate 과정에서 node.js 콘솔에 메시지를 뿌릴 수 있도록 healess browser의 console 객체를 재정의한다. (이게 없으면 브라우져 콘솔에 찍힘)
            this.page.on("console", async (msg) => {
                const args = await msg.args();
                args.forEach(async (arg) => {
                    const val = await arg.jsonValue();
                    // value is serializable
                    if (JSON.stringify(val) !== JSON.stringify({}))
                        console.log(val);
                    // value is unserializable (or an empty oject)
                    else {
                        const {
                            type,
                            subtype,
                            description,
                        } = arg._remoteObject;
                        console.log(
                            `type: ${type}, subtype: ${subtype}, description:\n ${description}`
                        );
                    }
                });
            });
        }

        async goToUrl(url) {
            await this.page.goto(url);
            //redirection 완료를 대기합니다.
            await this.page.waitForNavigation();
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
            if (
                (await this.checkIsGisaidCaptchaFrame(downloadFrame)) === true
            ) {
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

        // async checkIsDataExist() {
        //     //만약 아무런 데이터가 없다면 크롤러를 종료한다
        //     const noDataDiv = await this.page.$x('//div[contains(string(), "No data found.") and contains(@class, "yui-dt-empty")]');
        //     if(noDataDiv === undefined) {
        //         return false;
        //     } else {
        //         return true;
        //     }
        // }

        //     async goToBrowsePage() {
        //         //Browse 페이지로 이동 (Xpath를 이용해서 엘레먼트 핸들러를 가져온다)
        //         const browseButton = await this.page.$x('//div[@class="sys-actionbar-action" and text()="Browse"]');
        //         await browseButton[0].click();
        //         await this.page.waitForNavigation();
        //         await this.page.waitFor(5000);
        //         console.log("\npage load complete\n")
        //     }

        //     async insertSubmissionDate(from, to) {
        //         //Submission 범위를 입력하기 위해서 입력할 위치를 선택한다.
        //         const datePickerTable = (await this.page.$x('//div[text() = "Submission"]/ancestor::table[@class = "sys-form-filine"]'))[0];
        //         const fromDatePicker = await datePickerTable.$('tbody > tr > td:nth-child(5)')
        //         const toDatePicker = await datePickerTable.$('tbody > tr > td:nth-child(7)')

        //         //Submission 범위의 시작에 from 을 입력한다.
        //         await fromDatePicker.click();
        //         await this.page.waitFor(500);
        //         await fromDatePicker.type(from)
        //         //Submission 범위의 끝점에 to 를 입력한다.
        //         await toDatePicker.click();
        //         await this.page.waitFor(500);
        //         await toDatePicker.type(to);
        //         await this.page.click('body');

        //         await this.page.waitFor(5000);
        //     }

        //     async goToLastPage() {
        //         //마지막 페이지로 이동한다.
        //         await this.page.click('.yui-pg-last');
        //         await this.page.waitFor(3000);
        //     }

        //     async checkIsCaptchaFrame(frame) {
        //         //캡챠에 걸렸는지를 확인한다.
        //         const captcha = await frame.$x('//div[@class = "sys-form-label" and contains(string(), "Prove that you are not a robot:")]');
        //         if(captcha.length != 0) {
        //             return true;
        //         }
        //         else {
        //             return false;
        //         }
        //     }

        //     async crawlRow(rowId) {
        //         await this.page.click(`#${rowId}`);
        //         await this.page.waitFor(5000);

        //         //띄워진 상세정보는 iframe에 새로운 HTML 도큐먼트로 생성되며, 해당 iframe ID는 random이므로 명시적으로 0번째 iframe을 가져온다.
        //         let frame = this.page.mainFrame().childFrames()[0];

        //         //캡챠에 걸렸는지를 확인한다.
        //         if(await this.checkIsCaptchaFrame(frame)) {
        //             console.log("WARN : Got CAPTCHA check")

        //             //TODO : resolve captcha check
        //             //throw Error("CAPTCHA")

        //             await this.page.click(`#${rowId}`);
        //             await this.page.waitFor(5000);
        //             frame = page.mainFrame().childFrames()[0];
        //         }

        //         let metaData = await frame.$eval(`.sys-component-slot`, (div) => {
        //             const table = div.querySelector(`table`);
        //             const strain = table.querySelector(`tbody > tr:nth-child(2) > td:nth-child(2)`).textContent;
        //             const epi = table.querySelector(`tbody > tr:nth-child(3) > td:nth-child(2)`).textContent;
        //             const date = table.querySelector(`tbody > tr:nth-child(8) > td:nth-child(2)`).textContent;
        //             const location = table.querySelector(`tbody > tr:nth-child(9) > td:nth-child(2)`).textContent;
        //             const sex = table.querySelector(`tbody > tr:nth-child(12) > td:nth-child(2)`).textContent;
        //             const age = table.querySelector(`tbody > tr:nth-child(13) > td:nth-child(2)`).textContent;
        //             const clade = table.querySelector(`tbody > tr:nth-child(5) > td:nth-child(2)`).textContent;
        //             const submit_date = table.querySelector(`tbody > tr:nth-child(34) > td:nth-child(2)`).textContent;

        //             let result = {
        //                 strain : strain,
        //                 epi : epi,
        //                 date : date,
        //                 location : location,
        //                 sex : sex,
        //                 age : age,
        //                 clade : clade,
        //                 submit_date : submit_date
        //             }
        //             return result;
        //         });
        //         await this.page.goBack();
        //         await this.page.waitFor(3000);
        //         return new CovMetaData(metaData);
        //     }

        //     async crawlCurrentPage() {
        //         const metaDataList = [];
        //         const recordIdArray = await this.page.$$eval('.yui-dt-rec', (records) => {
        //             let recordIdArray = [];
        //             for(let record of records) {
        //                 recordIdArray.push(record.id);
        //             }
        //             return recordIdArray;
        //         })
        //         console.log(recordIdArray);

        //         //각 레코드를 클릭해서 크롤링 시작
        //         for(const recordId of recordIdArray) {
        //             metaDataList.push(await this.crawlRow(recordId));
        //         }
        //         return metaDataList
        //     }

        //     async goToNextPageAndReturnIndex(delayInSec) {
        //         let containerInfo = await this.page.$eval(`.yui-pg-pages`, (pageContainer) => {
        //             let currPageIndex = parseInt(pageContainer.querySelector(`.yui-pg-current-page`).textContent);
        //             let result = new Object();
        //             for(let i=0; i<pageContainer.childElementCount; i++) {
        //                 if( pageContainer.childNodes[i].nodeName.toLowerCase() == `span`) {
        //                     //배열은 0부터 시작하지만, nth-child는 1부터 시작하므로 i를 바로 리턴한다.
        //                     result.nextPageOrder = i;
        //                 }
        //             }
        //             result.nextPageIndex = currPageIndex - 1;
        //             result.containerId = pageContainer.id;
        //             return result;
        //         })

        //         //1번 페이지라면 undefined 반환
        //         if (containerInfo.nextPageIndex === 0) {
        //             return undefined;
        //         }

        //         await this.page.waitFor(delayInSec * _SEC_IN_MICROSECOND);
        //         console.log(`Node : Move to page #${containerInfo.nextPageIndex}, page order is #${containerInfo.nextPageOrder}`);
        //         await this.page.click(`#${containerInfo.containerId} > a:nth-child(${containerInfo.nextPageOrder})`)
        //         await this.page.waitFor(3000);
        //         return containerInfo.nextPageIndex;
        //     }

        //     async insertDataToDB(dataList) {
        //         console.log(`Node : Crawling complete. Submission FROM ${this.fromSubmission} TO ${this.toSubmission}\n\nTry to insert ${dataList.length} data to DB`);
        //         try {
        //             const bulkRes = await this.gisaidCovMetaData.bulkWrite(dataList.map(data => (
        //                     {
        //                     insertOne : {
        //                         document : data
        //                     }
        //                     }
        //                 )
        //                 )
        //             )
        //             console.log(`Bulk insertion complete, result :\n${JSON.stringify(bulkRes.result)}`);
        //         } catch(err) {
        //             console.error(err);
        //         }
        //     }

        // }

        //     this.crawlGisaid = async function(fromSubmission, toSubmission, gisaidCovMetaData) {
        //         for(let i=0; i<arguments.length; i++) {
        //             if(arguments[i] instanceof Date) {
        //                 arguments[i] = arguments[i].toISOString().slice(0, 10);
        //             }
        //         }

        //         const userAgent = require('user-agents');
        //         const puppeteer = require("puppeteer");

        //         // head가 있는 상태로 브라우저 실행,
        //         const browser = await puppeteer.launch({devtools : true});
        //         const page = await browser.newPage();
        //         //CAPTCHA 방어를 회피하기 위해서 user agent를 랜덤으로 생성하여 서버가 알 수 없도록 한다.
        //         await page.setUserAgent(userAgent.toString());
        //         //page 객체가 evaluate 과정에서 node.js 콘솔에 메시지를 뿌릴 수 있도록 healess browser의 console 객체를 재정의한다. (이게 없으면 브라우져 콘솔에 찍힘)
        //         page.on('console', async msg => {
        //             const args = await msg.args()
        //             args.forEach(async (arg) => {
        //             const val = await arg.jsonValue()
        //             // value is serializable
        //             if (JSON.stringify(val) !== JSON.stringify({})) console.log(val)
        //             // value is unserializable (or an empty oject)
        //             else {
        //                 const { type, subtype, description } = arg._remoteObject
        //                 console.log(`type: ${type}, subtype: ${subtype}, description:\n ${description}`)
        //             }
        //             })
        //         });

        //         await page.goto(process.env.GISAID_URL);
        //         //redirection 완료를 대기합니다.
        //         await page.waitForNavigation();

        //         //로그인 절차 시작
        //         await page.type('#elogin', base64ToStr(process.env.GISAID_ID));
        //         await page.type('#epassword',base64ToStr(process.env.GISAID_PW));

        //         await page.click('#login > div:nth-child(2) > input.form_button_submit')
        //         //로그인 완료 대기
        //         await page.waitForNavigation();

        //         //Browse 페이지로 이동 (Xpath를 이용해서 엘레먼트 핸들러를 가져온다)
        //         const browseButton = await page.$x('//div[@class="sys-actionbar-action" and text()="Browse"]');
        //         await browseButton[0].click();
        //         await page.waitForNavigation();
        //         await page.waitFor(5000);
        //         console.log("\npage load complete\n")

        //         //Submission 범위를 입력하기 위해서 입력할 위치를 선택한다.
        //         const datePickerTable = (await page.$x('//div[text() = "Submission"]/ancestor::table[@class = "sys-form-filine"]'))[0];
        //         const fromDatePicker = await datePickerTable.$('tbody > tr > td:nth-child(5)')
        //         const toDatePicker = await datePickerTable.$('tbody > tr > td:nth-child(7)')

        //         //Submission 범위의 시작에 fromSubmissionDate를 입력한다.
        //         await fromDatePicker.click();
        //         await page.waitFor(500);
        //         await fromDatePicker.type(fromSubmission)
        //         //Submission 범위의 끝점에 toSubmissionDate를 입력한다.
        //         await toDatePicker.click();
        //         await page.waitFor(500);
        //         await toDatePicker.type(toSubmission);
        //         await page.click('body');

        //         await page.waitFor(5000);

        //         //마지막 페이지로 이동한다.
        //         await page.click('.yui-pg-last');
        //         await page.waitFor(3000);

        //         //만약 아무런 데이터가 없다면 크롤러를 종료한다
        //         const noDataDiv = await page.$x('//div[contains(string(), "No data found.") and contains(@class, "yui-dt-empty")]');
        //         if(noDataDiv === undefined) {
        //             return;
        //         }

        //         //데이터가 있다면 크롤링 시작
        //         const metaDataList = [];

        //         //마지막 페이지부터 1번째 페이지까지 순차적으로 크롤링하여 배열에 집어넣는다.
        //         while(true) {
        //             const recordIdArray = await page.$$eval('.yui-dt-rec', (records) => {
        //                 let recordIdArray = [];
        //                 for(let record of records) {
        //                     recordIdArray.push(record.id);
        //                 }
        //                 return recordIdArray;
        //             })
        //             console.log(recordIdArray);

        //             //각 레코드를 클릭해서 크롤링 시작
        //             for(let recordId of recordIdArray) {
        //                 await page.click(`#${recordId}`);
        //                 await page.waitFor(5000);
        //                 //레코드 크롤링 시작
        //                 console.log(`Node : Crawling record`)

        //                 //띄워진 상세정보는 iframe에 새로운 HTML 도큐먼트로 생성되며, 해당 iframe ID는 random이므로 명시적으로 0번째 iframe을 가져온다.
        //                 let frame = page.mainFrame().childFrames()[0];

        //                 //캡챠에 걸렸는지를 확인한다.
        //                 const captcha = await frame.$x('//div[@class = "sys-form-label" and contains(string(), "Prove that you are not a robot:")]');
        //                 if(captcha.length != 0) {
        //                     console.log("WARN : Got CAPTCHA check")
        //                     await page.click(`#${recordId}`);
        //                     await page.waitFor(5000);
        //                     frame = page.mainFrame().childFrames()[0];
        //                 }

        //                 let metaData = await frame.$eval(`.sys-component-slot`, (div) => {
        //                     const table = div.querySelector(`table`);

        //                     const strain = table.querySelector(`tbody > tr:nth-child(2) > td:nth-child(2)`).textContent;
        //                     const epi = table.querySelector(`tbody > tr:nth-child(3) > td:nth-child(2)`).textContent;
        //                     const date = table.querySelector(`tbody > tr:nth-child(8) > td:nth-child(2)`).textContent;
        //                     const location = table.querySelector(`tbody > tr:nth-child(9) > td:nth-child(2)`).textContent;
        //                     const sex = table.querySelector(`tbody > tr:nth-child(12) > td:nth-child(2)`).textContent;
        //                     const age = table.querySelector(`tbody > tr:nth-child(13) > td:nth-child(2)`).textContent;
        //                     const clade = table.querySelector(`tbody > tr:nth-child(5) > td:nth-child(2)`).textContent;
        //                     const submit_date = table.querySelector(`tbody > tr:nth-child(34) > td:nth-child(2)`).textContent;

        //                     let result = {
        //                         strain : strain,
        //                         epi : epi,
        //                         date : date,
        //                         location : location,
        //                         sex : sex,
        //                         age : age,
        //                         clade : clade,
        //                         submit_date : submit_date
        //                     }
        //                     console.log(result);
        //                     return result;
        //                 });
        //                 //raw object 를 CovMetaData class instance로 변환한다.
        //                 metaDataList.push(new CovMetaData(metaData));

        //                 await page.goBack();
        //                 //10초 대기
        //                 await page.waitFor(10000);
        //             }

        //             let metaDataStr = JSON.stringify(metaDataList)

        //             //다음 페이지로 넘어간다.
        //         let containerInfo = await page.$eval(`.yui-pg-pages`, (pageContainer) => {
        //                 let currPageIndex = parseInt(pageContainer.querySelector(`.yui-pg-current-page`).textContent);
        //                 let result = new Object();
        //                 for(let i=0; i<pageContainer.childElementCount; i++) {
        //                     if( pageContainer.childNodes[i].nodeName.toLowerCase() == `span`) {
        //                         //배열은 0부터 시작하지만, nth-child는 1부터 시작하므로 i를 바로 리턴한다.
        //                         result.nextPageOrder = i;
        //                     }
        //                 }
        //                 result.nextPageIndex = currPageIndex - 1;
        //                 result.containerId = pageContainer.id;
        //                 return result;
        //             })

        //             //1번 페이지까지 끝내면 크롤링 탈출.
        //             if (containerInfo.nextPageIndex === 0) {
        //                 break;
        //             }

        //             const nextPageDelayInSec = process.env.NEXT_PAGE_DELAY_SECONDS;

        //             console.log(`Node : wating ${nextPageDelayInSec} seconds to avoid capcha depence`)
        //             await page.waitFor(nextPageDelayInSec * _SEC_IN_MICROSECOND);

        //             console.log(`Node : Move to page #${containerInfo.nextPageIndex}, page order is #${containerInfo.nextPageOrder}`);
        //             await page.click(`#${containerInfo.containerId} > a:nth-child(${containerInfo.nextPageOrder})`)
        //             await page.waitFor(3000);
        //         }
        //         //웹훅을 보낸다.

        //         //DB에 삽입한다.
        //         console.log(`
        // Node : Crawling complete. Submission FROM ${fromSubmission} TO ${toSubmission}

        // Try to insert ${metaDataList.length} data to DB
        //         `);
        //         try {
        //             const bulkRes = await gisaidCovMetaData.bulkWrite(metaDataList.map(data => (
        //                     {
        //                     insertOne : {
        //                         document : data
        //                     }
        //                     }
        //                 )
        //                 )
        //             )
        //             console.log(`
        // Bulk insertion complete, result :
        //     ${JSON.stringify(bulkRes.result)}
        //             `);
        //         } catch(err) {
        //             console.error(err);
        //         }

        //         //fromSubmission, toSubmission 업데이트

        //         //모든 스크래핑 작업을 마치고 브라우저 닫기
        //         await browser.close();
    };

};
