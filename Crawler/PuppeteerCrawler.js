const _ = require("lodash");
const userAgent = require("user-agents");
const puppeteer = require("puppeteer");
const MongoClient = require("mongodb").MongoClient;
const got = require("got");
const { gzip, ungzip } = require("node-gzip");
const { toInteger, ceil } = require("lodash");

require("dotenv").config();
require("../utils")();


class PuppeteerCrawler {
    constructor() {}

    async startPuppeteer(enableDevtools = false) {
        // head가 있는 상태로 브라우저 실행,
        this.browser = await puppeteer.launch({ devtools: enableDevtools, executablePath: process.env.BROWSER_PATH });
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

    async close() {
        if(this.browser !== undefined) {
            this.browser.close();
        }
        if(this.client !== undefined) {
            this.closeMongoDB();
        }
    }

    async goToUrl(url) {
        await this.page.goto(url);
        //redirection 완료를 대기합니다.
        await this.page.waitFor(5000);
    }

    async connectMongoDB() {
        this.client = await MongoClient.connect(process.env.MONGO_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        }).catch((e) => console.error(e));

        this.gisaidDB = this.client.db(process.env.MONGO_GISAID_DB_NAME);
        this.whoDB = this.client.db(process.env.MONGO_WHO_DB_NAME);
    }

    async closeMongoDB() {
        await this.client.close();
        this.client = undefined;
        this.gisaidDB = undefined;
        this.whoDB = undefined;
    }
};

module.exports = PuppeteerCrawler;


