const _MS_PER_DAY = 1000 * 60 * 60 * 24;
const path = require('path');
const fs = require('fs');


module.exports = function () {
    this.strToBase64 = function (str) {
        var buff = new Buffer(str);
        return buff.toString("base64");
    };

    this.base64ToStr = function (encStr) {
        var buff = new Buffer(encStr, "base64");
        return buff.toString("utf-8");
    };

    /**
    * 
    * @param {String} dirPath : 비울 디렉토리 경로 
    * @param {String} exceptionFiles : 삭제하지 않을 파일 이름 배열
    */
    this.clearDir = async (dirPath, targetExt, exceptionFiles) => {
       const dir = await fs.promises.readdir(dirPath);
       const unlinkPromises = dir.map(file => {
           if(exceptionFiles instanceof Array) {
               if(exceptionFiles.filter(name => name == file).length === 0 && path.extname(file) == targetExt)
                   fs.promises.unlink(path.resolve(dirPath, file));
   
           } else if (exceptionFiles === undefined)
               if(path.extname(file) == targetExt)
                   fs.promises.unlink(path.resolve(dirPath, file))
       });
       return Promise.all(unlinkPromises);
   }

    /**
     * Csv파일을 읽어 정렬한 후에 최신 아이디 이후를 가져온다
     *
     * @param {Buffer} fileBuffer : 읽을 파일 버퍼
     * @param {string} rowToken : CSV파일의 행 분리자
     * @param {string} columnToken : CSV 파일의 열 분리자
     * @param {Array} sortColumnList : 정렬 대상 컬럼들이 담긴 리스트
     * @param {string} latestId : 대상 컬럼의 최신 아이디, 이것을 초과하는 것만 반환한다
     * @param {string} compareatorGenerator : 정렬 함수를 생성하는 함수
     */
    this.processCsvAndReturnUpdatedData = function (
        fileBuffer,
        rowToken,
        columnToken,
        sortColumnList,
        latestId,
        compareatorGenerator
    ) {
        const fileStr = fileBuffer.toString();

        const rowIndex = fileStr.split(columnToken, 1)[0];
        const rowData = fileStr.substring(rowIndex.length + 1, fileStr.length);

        const indexArr = rowIndex.split(rowToken).map((str) => str.trim());
        let dataList = [];

        rowData.split(columnToken).map((row) => {
            const rowArr = row.split(rowToken);

            //잘못된 데이터는 거른다
            if (rowArr.length !== indexArr.length) {
                return;
            }
            const dataObj = new Object();

            // 인덱스를 키로 가지는 객체 생성
            for (let i = 0; i < indexArr.length; i++) {
                dataObj[indexArr[i]] = rowArr[i];
            }
            dataList.push(dataObj);
        });

        dataList = dataList.sort(compareatorGenerator(...sortColumnList));
        let lastRowIdx =
            dataList.findIndex((elemnt) => elemnt[sortColumnList[0]] == latestId) - 1;

        if(lastRowIdx+1 == -1) {
            lastRowIdx = dataList.length-1;
        }

        console.log(
            `Csv file parsing complete, total len : ${
                dataList.length
            }, updated : ${lastRowIdx + 1}`
        );
        return dataList.slice(0, lastRowIdx+1);
    };

    /**
     * 타임아웃 내에 파일의 다운로드가 끝나는지 확인한다.
     *
     * @param {string} filePath : 검사할 파일 경로
     * @param {number} timeout : 시간제한
     * @returns Promise<true>
     * @throws Error<string> when file dit not exist | download not finishid within timeout
     */
    this.checkFileDownloadedWithinTimeout = function (filePath, timeout) {
        return new Promise(function (resolve, reject) {
            const dir = path.dirname(filePath);
            const basename = path.basename(filePath);
            const watcher = fs.watch(dir, function (eventType, filename) {
                if (eventType === "rename" && filename === basename) {
                    clearTimeout(timer);
                    watcher.close();
                    resolve(true);
                }
            });

            const timer = setTimeout(function () {
                watcher.close();
                reject(
                    new Error(
                        `File : ${filePath} did not exists and was not created during the timeout.`
                    )
                );
            }, timeout);

            fs.access(filePath, fs.constants.R_OK, function (err) {
                if (!err) {
                    clearTimeout(timer);
                    watcher.close();
                    resolve(true);
                }
            });
        });
    };

    this.rangeReverse = function (start, end) {
        if (start === end) return [start];
        return [start, ...rangeReverse(start - 1, end)];
    };

    this.dateDiffInDays = function (a, b) {
        // Discard the time and time-zone information.
        const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
        const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

        return Math.floor((utc1 - utc2) / _MS_PER_DAY);
    };

    this.wrapAsyncFn = asyncFn => {
        return (async (req, res, next) => {
          try {
            return await asyncFn(req, res, next)
          } catch (error) {
            return next(error)
          }
        })  
      }

    // this.CovMetaData = class {
    //     /**
    //      *
    //      * @param {*} strainOrObj : 바이러스 이름 (hCoV-19/Brazil/PE-COV0260/2020)
    //      * @param {*} epi : EPI_ISL 등록번호 (EPI_ISL_502875)
    //      * @param {*} date : 발병일자 (2020-06-24)
    //      * @param {*} location : 발병 위치 (South America / Brazil / Pernambuco / Recife)
    //      * @param {*} age : 나이 (23)
    //      * @param {*} sex : 성별 (Male)
    //      * @param {*} clade : GISAID 홈페이지 계통 형식 (B.1.1.28 (G))
    //      * @param {*} submit_date : 제출일자 (2020-07-31)
    //      */
    //     constructor(strainOrObj, epi, date, location, age, sex, clade, submit_date) {
    //         if(arguments.length > 1) {
    //             this.strain = strainOrObj,
    //             this.gisaid_epi_isl = epi,
    //             this.date = date,
    //             this.age = age,
    //             this.sex = sex,
    //             this.submit_date = submit_date;

    //             let regionInfo = parseLocation(location);
    //             this.region = regionInfo.region;
    //             this.country = regionInfo.country;
    //             this.division = regionInfo.division;
    //             this.location = regionInfo.location;

    //             let cladeInfo = parseClade(clade);
    //             this.pangolin_lineage = cladeInfo.pangolin_lineage;
    //             this.GISAID_clade = cladeInfo.GISAID_clade;
    //         } else {
    //             this.strain = strainOrObj.strain,
    //             this.gisaid_epi_isl = strainOrObj.epi,
    //             this.date = strainOrObj.date,
    //             this.age = strainOrObj.age,
    //             this.sex = strainOrObj.sex,
    //             this.submit_date = strainOrObj.submit_date;

    //             let regionInfo = parseLocation(strainOrObj.location);
    //             this.region = regionInfo.region;
    //             this.country = regionInfo.country;
    //             this.division = regionInfo.division;
    //             this.location = regionInfo.location;

    //             let cladeInfo = parseClade(strainOrObj.clade);
    //             this.pangolin_lineage = cladeInfo.pangolin_lineage;
    //             this.GISAID_clade = cladeInfo.GISAID_clade;
    //         }
    //     }
    // }

    // /**
    //  * GISAID 유전정보 ID인 EPI_ISL을 만든다
    //  *
    //  * @param {Number or String} postfix : ISL 뒤의 숫자
    //  * @return {String} : EPI_ISL_${postfix}
    //  */
    // this.numberToEpi = function(postfix) {
    //     return "EPI_ISL_"+postfix;
    // }

    // this.epiToNumber = function(epi) {
    //     let reg = RegExp('^EPI_ISL_[0-9]*$');
    //     if(!reg.test(epi)) {
    //         return null;
    //     }
    //     epi = epi.replace("EPI_ISL_","")
    //     return parseInt(epi);
    // }

    // this.RegionInfo = class {
    //     constructor(region, country, division, location) {
    //         this.region = region,
    //         this.country = country,
    //         this.division = division,
    //         this.location = location
    //     }
    // }

    // this.CladeInfo = class {
    //     constructor(lineage, clade) {
    //          this.pangolin_lineage = lineage
    //          this.GISAID_clade = clade
    //     }
    // }

    // /**
    //  * GISAID web db의 location을 metadata 형식으로 파싱한다
    //  *
    //  * @param {string} location : North America / USA / Texas / Houston
    //  * @returns {RegionInfo} 리전 정보 객체
    //  */
    // this.parseLocation = function(location) {
    //     if (location === undefined || location === null) {
    //         return new RegionInfo();
    //     } else if (! location instanceof String) {
    //         console.log(`NODE : Warn:: function parseLocation() got non-string parameter, value : ${location}`);
    //         return new RegionInfo();
    //     }

    //     let splitList = location.split(' / ');
    //     splitList.map(str => str.trim())
    //     return new RegionInfo(...splitList);
    // }

    // /**
    //  *
    //  * @param {string} clade : B.1.2 (GH) 형식
    //  * @returns {CladeInfo} 파싱된 클레이드 객체
    //  */
    // this.parseClade = function(clade) {
    //     let splitList = clade.split(" ");
    //     splitList[1] = splitList[1].replace("(","").replace(")","");
    //     splitList.map(str => str.trim())
    //     return new CladeInfo(splitList[0], splitList[1])
    // }

    // /**
    //  * EPI_ISL 에 inc만큼 산술 더하기를 실행한다
    //  * @param {*} epi
    //  * @param {*} inc
    //  */
    // this.addIntToEpiIsl = function(epi, inc) {
    //     return "EPI_ISL_" + (epiToNumber(epi)+inc);
    // }

    // /**
    //  *
    //  * @param {Date} date
    //  * @param {Number} inc
    //  */
    // this.addOneDayToDate = function (date) {
    //     return new Date(date.getTime() + _MS_PER_DAY);
    // }
};
