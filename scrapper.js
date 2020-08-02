const puppeteer = require("puppeteer");
require('dotenv').config();
require('./utils.js')();

class CovMetaData {
	/**
	 * 
	 * @param {*} strain : 바이러스 이름 (hCoV-19/Brazil/PE-COV0260/2020)
	 * @param {*} epi : EPI_ISL 등록번호 (EPI_ISL_502875)
	 * @param {*} date : 발병일자 (2020-06-24)
	 * @param {*} location : 발병 위치 (South America / Brazil / Pernambuco / Recife)
	 * @param {*} age : 나이 (23)
	 * @param {*} sex : 성별 (Male)
	 * @param {*} clade : GISAID 홈페이지 계통 형식 (B.1.1.28 (G))
	 * @param {*} submit_date : 제출일자 (2020-07-31)
	 */
	constructor(strain, epi, date, location, age, sex, clade, submit_date) {
		this.strain = strain,
		this.gisaid_epi_isl = epi,
		this.date = date,
		this.age = age,
		this.sex = sex,
		this.submit_date = submit_date;

		let regionInfo = parseLocation(location);
		this.region = regionInfo.region;
		this.country = regionInfo.country;
		this.division = regionInfo.division;
		this.location = regionInfo.location;

		let cladeInfo = parseClade(clade);
		this.pangolin_lineage = cladeInfo.pangolin_lineage;
		this.GISAID_clade = cladeInfo.GISAID_clade;
	}
}


let lastEpiIsl = "EPI_ISL_501594";

(async () => {
	// head가 있는 상태로 브라우저 실행, 
	const browser = await puppeteer.launch({headless : false});
	const page = await browser.newPage();
	//page 객체가 evaluate 과정에서 node.js 콘솔에 메시지를 뿌릴 수 있도록 healess browser의 console 객체를 재정의한다. (이게 없으면 브라우져 콘솔에 찍힘)
	page.on('console', (msg) => console[msg._type]('PAGE LOG:', msg._text));

	await page.goto(process.env.GISAID_URL);
	//redirection 완료를 대기합니다.
	await page.waitForNavigation();

	//로그인 절차 시작
	await page.type('#elogin', base64ToStr(process.env.GISAID_ID));
	await page.type('#epassword',base64ToStr(process.env.GISAID_PW));

	await page.click('#login > div:nth-child(2) > input.form_button_submit')
	//로그인 완료 대기
	await page.waitForNavigation();

	//Browse 페이지로 이동
	await page.click('#c_qe8pwk_dy-c_qe8pwk_dy > div > div:nth-child(2)');
	await page.waitForNavigation();
	await page.waitFor(5000);

	console.log("\npage load complete\n")

	//첫 EPI_ISL 번호와 1개 테이블의 크기를 계산한다.
	let parseResult = await page.$eval('.yui-dt-data', table => {
		let tr = table.getElementsByTagName('tr').item(0);
		let epiIsl = tr.getElementsByClassName('yui-dt0-col-f').item(0).textContent;
		
		let returnObj = {};
		returnObj.firstEpiIsl = epiIsl
		returnObj.pageSize = table.getElementsByTagName('tr').length;
		return returnObj;
	})

	//마지막에 크롤링한 EPI_ISL을 통하여 크롤링할 페이지 넘버를 계산한다
	let startingPageNumber = getPageIndex(lastEpiIsl, parseResult.firstEpiIsl, parseResult.pageSize);
	console.log(`NODE LOG: starting crwaling from page #${startingPageNumber} to page #1`);

	//해당 페이지 넘버부터 1번 페이지까지 순차적으로 크롤링한다
	for(let targetPageNumber=startingPageNumber, currId=addIntToEpiIsl(lastEpiIsl, 1); targetPageNumber>0; targetPageNumber--) {
		
		console.log(`NODE LOG: moving to page #${targetPageNumber}`);
		//원하는 페이지까지 이동한다
		await page.$eval('.yui-pg-pages', (pages, targetPageNumber, currId) => {
			let firstPage = pages.querySelector(':nth-child(1)').textContent
			let currPage = pages.querySelector(".yui-pg-current-page").textContent;
			console.log(`first page = ${firstPage}, current page = ${currPage}`);
			
			
			for(;;) {
				let targetPageElement = pages.querySelector('[page='+targetPageNumber+']');

				if(targetPageElement != null) {
					console.log("targetpage is exsists in current index")
					let targetPageOrder = targetPageNumber-firstPage+1;
					await page.click( `#${page.id} > a:nth-child(${targetPageOrder})`);
					break;
				} else {
					console.log("targetpae is beyond at current index");
					break;
				}
			}
		})
	}
	//마지막 EPI_ISL을 업데이트한다


	// 모든 스크래핑 작업을 마치고 브라우저 닫기
	//await browser.close();
})();


