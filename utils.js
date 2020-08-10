const _MS_PER_DAY = 1000 * 60 * 60 * 24;
module.exports = function() {

    this.CovMetaData = class {
        /**
         * 
         * @param {*} strainOrObj : 바이러스 이름 (hCoV-19/Brazil/PE-COV0260/2020)
         * @param {*} epi : EPI_ISL 등록번호 (EPI_ISL_502875)
         * @param {*} date : 발병일자 (2020-06-24)
         * @param {*} location : 발병 위치 (South America / Brazil / Pernambuco / Recife)
         * @param {*} age : 나이 (23)
         * @param {*} sex : 성별 (Male)
         * @param {*} clade : GISAID 홈페이지 계통 형식 (B.1.1.28 (G))
         * @param {*} submit_date : 제출일자 (2020-07-31)
         */
        constructor(strainOrObj, epi, date, location, age, sex, clade, submit_date) {
            if(arguments.length > 1) {
                this.strain = strainOrObj,
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
            } else {
                this.strain = strainOrObj.strain,
                this.gisaid_epi_isl = strainOrObj.epi,
                this.date = strainOrObj.date,
                this.age = strainOrObj.age,
                this.sex = strainOrObj.sex,
                this.submit_date = strainOrObj.submit_date;
        
                let regionInfo = parseLocation(strainOrObj.location);
                this.region = regionInfo.region;
                this.country = regionInfo.country;
                this.division = regionInfo.division;
                this.location = regionInfo.location;
        
                let cladeInfo = parseClade(strainOrObj.clade);
                this.pangolin_lineage = cladeInfo.pangolin_lineage;
                this.GISAID_clade = cladeInfo.GISAID_clade;
            }
        }
    }

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
        if (location === undefined || location === null) {
            return new RegionInfo();
        } else if (! location instanceof String) {
            console.log(`NODE : Warn:: function parseLocation() got non-string parameter, value : ${location}`);
            return new RegionInfo();
        }

        let splitList = location.split(' / ');
        splitList.map(str => str.trim())
        return new RegionInfo(...splitList);
    }

    /**
     * 
     * @param {string} clade : B.1.2 (GH) 형식
     * @returns {CladeInfo} 파싱된 클레이드 객체
     */
    this.parseClade = function(clade) {
        let splitList = clade.split(" ");
        splitList[1] = splitList[1].replace("(","").replace(")","");
        splitList.map(str => str.trim())
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

    this.dateDiffInDays = function (a, b) {
        // Discard the time and time-zone information.
        const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
        const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
      
        return Math.floor((utc1 - utc2) / _MS_PER_DAY);
      }

    /**
     * 
     * @param {Date} date 
     * @param {Number} inc 
     */
    this.addOneDayToDate = function (date) {
        return new Date(date.getTime() + _MS_PER_DAY);
    }
};