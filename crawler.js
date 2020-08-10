module.exports = function() {

    const _SEC_IN_MICROSECOND = 1*1000;

    this.crawlGisaid = async function(fromSubmission, toSubmission, gisaidCovMetaData) {
        for(let i=0; i<arguments.length; i++) {
            if(arguments[i] instanceof Date) {
                arguments[i] = arguments[i].toISOString().slice(0, 10);
            }
        }

        const userAgent = require('user-agents');
        const puppeteer = require("puppeteer");

        // head가 있는 상태로 브라우저 실행, 
        const browser = await puppeteer.launch({devtools : true});
        const page = await browser.newPage();
        //CAPTCHA 방어를 회피하기 위해서 user agent를 랜덤으로 생성하여 서버가 알 수 없도록 한다.
        await page.setUserAgent(userAgent.toString());
        //page 객체가 evaluate 과정에서 node.js 콘솔에 메시지를 뿌릴 수 있도록 healess browser의 console 객체를 재정의한다. (이게 없으면 브라우져 콘솔에 찍힘)
        page.on('console', async msg => {
            const args = await msg.args()
            args.forEach(async (arg) => {
            const val = await arg.jsonValue()
            // value is serializable
            if (JSON.stringify(val) !== JSON.stringify({})) console.log(val)
            // value is unserializable (or an empty oject)
            else {
                const { type, subtype, description } = arg._remoteObject
                console.log(`type: ${type}, subtype: ${subtype}, description:\n ${description}`)
            }
            })
        });

        await page.goto(process.env.GISAID_URL);
        //redirection 완료를 대기합니다.
        await page.waitForNavigation();

        //로그인 절차 시작
        await page.type('#elogin', base64ToStr(process.env.GISAID_ID));
        await page.type('#epassword',base64ToStr(process.env.GISAID_PW));

        await page.click('#login > div:nth-child(2) > input.form_button_submit')
        //로그인 완료 대기
        await page.waitForNavigation();

        //Browse 페이지로 이동 (Xpath를 이용해서 엘레먼트 핸들러를 가져온다)
        const browseButton = await page.$x('//div[@class="sys-actionbar-action" and text()="Browse"]');
        await browseButton[0].click();
        await page.waitForNavigation();
        await page.waitFor(5000);
        console.log("\npage load complete\n")
        
        //Submission 범위를 입력하기 위해서 입력할 위치를 선택한다.
        const datePickerTable = (await page.$x('//div[text() = "Submission"]/ancestor::table[@class = "sys-form-filine"]'))[0];
        const fromDatePicker = await datePickerTable.$('tbody > tr > td:nth-child(5)') 
        const toDatePicker = await datePickerTable.$('tbody > tr > td:nth-child(7)')

        //Submission 범위의 시작에 fromSubmissionDate를 입력한다.
        await fromDatePicker.click();
        await page.waitFor(500);
        await fromDatePicker.type(fromSubmission)
        //Submission 범위의 끝점에 toSubmissionDate를 입력한다.
        await toDatePicker.click();
        await page.waitFor(500);
        await toDatePicker.type(toSubmission);
        await page.click('body');

        await page.waitFor(5000);

        //마지막 페이지로 이동한다.
        await page.click('.yui-pg-last');
        await page.waitFor(3000);

        //만약 아무런 데이터가 없다면 크롤러를 종료한다
        const noDataDiv = await page.$x('//div[contains(string(), "No data found.") and contains(@class, "yui-dt-empty")]');


        //데이터가 있다면 크롤링을 재개한다.\

        const metaDataList = [];

        //마지막 페이지부터 1번째 페이지까지 순차적으로 크롤링하여 배열에 집어넣는다.
        while(true) {
            const recordIdArray = await page.$$eval('.yui-dt-rec', (records) => {
                let recordIdArray = [];
                for(let record of records) {
                    recordIdArray.push(record.id);
                }
                return recordIdArray;
            })
            console.log(recordIdArray);

            //각 레코드를 클릭해서 크롤링 시작
            for(let recordId of recordIdArray) {
                await page.click(`#${recordId}`);
                await page.waitFor(5000);
                //레코드 크롤링 시작
                console.log(`Node : Crawling record`)

                //띄워진 상세정보는 iframe에 새로운 HTML 도큐먼트로 생성되며, 해당 iframe ID는 random이므로 명시적으로 0번째 iframe을 가져온다.
                const frame = page.mainFrame().childFrames()[0];

                //캡챠에 걸렸는지를 확인한다.
                const captcha = await frame.$x('//div[@class = "sys-form-label" and contains(string(), "Prove that you are not a robot:")]');
                if(captcha.length != 0) {
                    for(;;) {
                    console.log("WARN : Got CAPTCHA check")
                    await page.click(`#${recordId}`);
                    await page.waitFor(5000);
                    }
                }

                let metaData = await frame.$eval(`.sys-component-slot`, (div) => {
                    const table = div.querySelector(`table`);

                    const strain = table.querySelector(`tbody > tr:nth-child(2) > td:nth-child(2)`).textContent;
                    const epi = table.querySelector(`tbody > tr:nth-child(3) > td:nth-child(2)`).textContent;
                    const date = table.querySelector(`tbody > tr:nth-child(8) > td:nth-child(2)`).textContent;
                    const location = table.querySelector(`tbody > tr:nth-child(9) > td:nth-child(2)`).textContent;
                    const sex = table.querySelector(`tbody > tr:nth-child(12) > td:nth-child(2)`).textContent;
                    const age = table.querySelector(`tbody > tr:nth-child(13) > td:nth-child(2)`).textContent;
                    const clade = table.querySelector(`tbody > tr:nth-child(5) > td:nth-child(2)`).textContent;
                    const submit_date = table.querySelector(`tbody > tr:nth-child(34) > td:nth-child(2)`).textContent;

                    let result = {
                        strain : strain,
                        epi : epi,
                        date : date,
                        location : location,
                        sex : sex,
                        age : age,
                        clade : clade,
                        submit_date : submit_date
                    }
                    console.log(result);
                    return result;
                });
                //raw object 를 CovMetaData class instance로 변환한다.
                metaDataList.push(new CovMetaData(metaData));

                await page.goBack();
                //10초 대기
                await page.waitFor(10000);
            }

            //다음 페이지로 넘어간다.
        let containerInfo = await page.$eval(`.yui-pg-pages`, (pageContainer) => {
                let currPageIndex = parseInt(pageContainer.querySelector(`.yui-pg-current-page`).textContent);
                let result = new Object();
                for(let i=0; i<pageContainer.childElementCount; i++) {
                    if( pageContainer.childNodes[i].nodeName.toLowerCase() == `span`) {
                        //배열은 0부터 시작하지만, nth-child는 1부터 시작하므로 i를 바로 리턴한다.
                        result.nextPageOrder = i;
                    }
                }
                result.nextPageIndex = currPageIndex - 1;
                result.containerId = pageContainer.id;
                return result;
            })

            //1번 페이지까지 끝내면 크롤링 탈출.
            if (containerInfo.nextPageIndex === 0) {
                break;
            }

            const nextPageDelayInSec = process.env.NEXT_PAGE_DELAY_SECONDS;

            console.log(`Node : wating ${nextPageDelayInSec} seconds to avoid capcha depence`)
            await page.waitFor(nextPageDelayInSec * _SEC_IN_MICROSECOND);

            console.log(`Node : Move to page #${containerInfo.nextPageIndex}, page order is #${containerInfo.nextPageOrder}`);
            await page.click(`#${containerInfo.containerId} > a:nth-child(${containerInfo.nextPageOrder})`)
            await page.waitFor(3000);
        }
        //웹훅을 보낸다.

        //DB에 삽입한다.
        console.log(`
Node : Crawling complete. Submission FROM ${fromSubmission} TO ${toSubmission}

Try to insert ${metaDataList.length} data to DB
        `);
        try {
            const bulkRes = await gisaidCovMetaData.bulkWrite(metaDataList.map(data => (
                    {
                    insertOne : {
                        document : data
                    }
                    }
                )
                )
            )
            console.log(`
Bulk insertion complete, result :
    ${JSON.stringify(bulkRes.result)}
            `);
        } catch(err) {
            console.error(err);
        }
        
        
        //fromSubmission, toSubmission 업데이트

        //모든 스크래핑 작업을 마치고 브라우저 닫기
        await browser.close();
    }
}