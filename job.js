/**
 * 定时任务。存储聊天记录进mysql数据库
 */
//===================================================================================
var Q		  = require('bluebird');
//-----------------------------------------------------------------------------------
var models 	  = require('./db');
var protos    = require('./prototypeExt');
var redis     = require('./redis');
//===================================================================================
var ChatMysqlBkJob = function() {
    this.backendJobTimeInterval = 1*3600*1000;   // 一小时
    this.timerHandler = {};
};
//-----------------------------------------------------------------------------------
ChatMysqlBkJob.prototype.start = function() {
    this.timerHandler = setInterval(function() {

    }, this.backendJobTimeInterval);
}
//-----------------------------------------------------------------------------------
ChatMysqlBkJob.prototype.stop = function() {
    clearInterval(this.timerHandler);
    this.timerHandler = {};
};
//-----------------------------------------------------------------------------------
ChatMysqlBkJob.prototype.setTimeInterval = function (interval) {
    this.backendJobTimeInterval = interval;
};
//-----------------------------------------------------------------------------------
var ChatMysqlHelper = function() {
    this.timeInterval = 1*3600*1000;
    this.timeArea = function(timestamp) {
        //寻找最近的一小时
        var _ = new Date(timestamp).pattern('yyyy-MM-dd HH:00:00');
        var bgnTime = new Date(_).getTime();
        var endTime = bgnTime + this.timeInterval;
        return {
            bgnTime : bgnTime,
            endTime : endTime
        };
    }
};
//-----------------------------------------------------------------------------------
ChatMysqlHelper.prototype.save = function(json) {
    return models.CHAT.create({
        IP      : json.IP,
        MESSAGE : json.MESSAGE,
        AVATAR  : json.AVATAR,
        TIME    : json.TIME,
        DATE    : new Date(json.TIME)
    });
};
//-----------------------------------------------------------------------------------
/**
 * 读取一条聊天
 */
ChatMysqlHelper.prototype.read = function(timestamp) {
    return models.CHAT.findAll({
        where : {
            TIME: timestamp
        }
    }).then(function(results) {
        return Q.map(results, function(result) {
            return Q.resolve(result.dataValues);
        });
    });
};
/**
 * 读取一批聊天
 * @param ids
 * @returns {*}
 */
ChatMysqlHelper.prototype.readBatch = function(ids) {
    return models.CHAT.findAll({
        order : [
            ['TIME', 'DESC']
        ],
        where : {
            TIME : {
                $in: ids
            }
        },
        attributes: { exclude: ['__ID'] }
    }).then(function(results) {
        return Q.map(results, function(result) {
            return Q.resolve(result.dataValues);
        });
    });
};
/**
 * 读取id列表
 * @type {ChatMysqlHelper}
 */
var READ_ID_COUNT = 100;
ChatMysqlHelper.prototype.readIDs = function(offset) {
    return models.CHAT.findAll({
        attributes  : ['TIME'],
        limit       : READ_ID_COUNT,
        offset      : offset
    }).then(function(ids) {
        var _ = ids.map(function (id) {return id.TIME});
        return Q.resolve(_);
    });
};
//===================================================================================
var ChatMysqlHelperInstance = new ChatMysqlHelper();
var ChatMysqlBkJobInstance  = new ChatMysqlBkJob();
exports.ChatMysqlHelper = ChatMysqlHelperInstance;
exports.ChatMysqlBkJob  = ChatMysqlBkJobInstance;
//===================================================================================