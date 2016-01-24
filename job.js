/**
 * 定时任务。存储聊天记录进mysql数据库
 */
//======================================================================================
var sequelize = require('sequelize');
var Q		  = require('bluebird');
//--------------------------------------------------------------------------------------
var models 	  = require('./db');
var protos    = require('./prototypeExt');
//======================================================================================
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
 * 按小时为单位读取
 */
ChatMysqlHelper.prototype.read = function(timestamp) {
    var timeAreas = this.timeArea(timestamp);
    console.log(timeAreas);
    return models.CHAT.findAll({
        order : [
            ['TIME', 'DESC']
        ],
        // where TIME >= timeAreas.bgnTime and TIME < timeAreas.endTime
        where : {
            TIME : {
                $gte: timeAreas.bgnTime,
                $lt : timeAreas.endTime
            }
        }
    }).then(function(msgs) {
        msgs.forEach(function(msg) {
            console.log(msg.MESSAGE);
        });
    });
};
//======================================================================================
exports.ChatMysqlHelper = new ChatMysqlHelper();
//======================================================================================