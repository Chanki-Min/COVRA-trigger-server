module.exports = function() {
    this.strToBase64 = function(str) {
        var buff = new Buffer(str);
        return buff.toString('base64');
    }

    this.base64ToStr = function(encStr) {
        var buff = new Buffer(encStr, 'base64');
        return buff.toString('utf-8');
    }

    /**
     * GISAID 유전정보 ID인 EPI_ISL을 만든다
     * 
     * @param {Number or String} postfix : ISL 뒤의 숫자
     * @return {String} : EPI_ISL_${postfix} 
     */
    this.numberToEpi = function(postfix) {
        return "EPI_ISL_"+postfix;
    }

    this.epiToNumber = function(epi) {
        let reg = RegExp('^EPI_ISL_[0-9]*$');
        if(!reg.test(epi)) {
            return null;
        }
        epi = epi.replace("EPI_ISL_","")
        return parseInt(epi);
    }


    /**
     * 목표하는 ID의 "다음" ID가 속한 페이지 넘버를 반환한다
     * 
     * @param {Number} targetId : 페이지 넘버를 알고 싶은 EPI_ISL
     * @param {Number} firstId : DB페이지의 가장 첫 ID
     * @param {Number} tableSize : 현재 렌더링의 테이블 크기
     * @return {NUmber} : targetID가 속한 페이지 넘버 (1부터 시작함)
     */
    this.getPageIndex = function(targetIdMinusOne, firstId, tableSize) {
        if(isNaN(targetIdMinusOne)) {
            targetIdMinusOne = epiToNumber(targetIdMinusOne);
        }
        if(isNaN(firstId)) {
            firstId = epiToNumber(firstId);
        }
        targetIdMinusOne += 1;
        let idDiff = firstId - targetIdMinusOne;
        let pageDiff = parseInt(idDiff/tableSize)
        return pageDiff + 1;
    }


    this.RegionInfo = class {
        constructor(region, country, division, location) {
            this.region = region,
            this.country = country,
            this.division = division,
            this.location = location
        }
    }

    this.CladeInfo = class {
        constructor(lineage, clade) {
             this.pangolin_lineage = lineage
             this.GISAID_clade = clade
        }
    }

    /**
     * GISAID web db의 location을 metadata 형식으로 파싱한다
     * 
     * @param {string} location : North America / USA / Texas / Houston
     * @returns {RegionInfo} 리전 정보 객체
     */
    this.parseLocation = function(location) {
        let splitList = location.split(' / ');
        return new RegionInfo(splitList[0], splitList[1], splitList[2], splitList[3]);
    }

    /**
     * 
     * @param {string} clade : B.1.2 (GH) 형식
     * @returns {CladeInfo} 파싱된 클레이드 객체
     */
    this.parseClade = function(clade) {
        let splitList = clade.split(" ");
        splitList[1] = splitList[1].replace("(","").replace(")","");

        return new CladeInfo(splitList[0], splitList[1])
    }

    /**
     * EPI_ISL 에 inc만큼 산술 더하기를 실행한다
     * @param {*} epi 
     * @param {*} inc 
     */
    this.addIntToEpiIsl = function(epi, inc) {
        return "EPI_ISL_" + (epiToNumber(epi)+inc);
    }

    this.rangeReverse = function(start, end) {
        if(start === end) return [start];
        return [start, ...rangeReverse(start - 1, end)];
    }
};