const mongoose = require('mongoose');

const gisaidCovMetaDataSchema = new mongoose.Schema({
        strain : { type : String },
        gisaid_epi_isl : { type : String, unique : true },
        
        age : { type : Number },
        sex : { type : String },

        submit_date : { type : Date },
        date : { type : Date },

        region : { type : String },
        country : { type : String },
        division : { type : String },
        location : { type : String },

        pangolin_lineage : { type : String },
        GISAID_clade : {type : String },
    },
    {
        timestamps : true
    }
)

gisaidCovMetaDataSchema.statics.create = function (payload) {
    const covMetaData = new this(payload);
    // Promise를 리턴
    return covMetaData.save();
}

gisaidCovMetaDataSchema.statics.findAll = function () {
    return this.find({});
}

gisaidCovMetaDataSchema.statics.findByEpiIsl = function (epi) {
    return this.find({ gisaid_epi_isl : epi});
}

gisaidCovMetaDataSchema.statics.findBySubmissionDate = function (submissionDate) {
    return this.find({ submit_date : submissionDate })
}

gisaidCovMetaDataSchema.statics.findByDate = function (date) {
    return this.find({ date : date });
}

gisaidCovMetaDataSchema.statics.deleteOneByEpiIsl = function (epi) {
    return this.remove({ gisaid_epi_isl : epi }, {sigle : true})
}

gisaidCovMetaDataSchema.statics.deleteBySubmissionDate = function (submissionDate) {
    return this.remove({ date : submissionDate})
}

//export
module.exports = mongoose.model('gisaidCovMetaData', gisaidCovMetaDataSchema);