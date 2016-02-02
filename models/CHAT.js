// MYSQL TABLE MANAGER
var models 	= require('../db');
//======================================================================================
module.exports = function(sequelize, DataTypes) {
	var CHAT = sequelize.define('CHAT', {
		__ID : {
	    	type : DataTypes.INTEGER.UNSIGNED,
	    	autoIncrement: true,
	    	primaryKey : true
	    },
	    IP		: DataTypes.CHAR(20),
	    TIME	: DataTypes.BIGINT,
		DATE    : DataTypes.DATE,
	    MESSAGE : DataTypes.TEXT,
	    AVATAR	: DataTypes.CHAR(8),
	}, {
		paranoid: true,
		timestamps: false,
		freezeTableName: true,
		//
		classMethods : {
			associate : function(models) {
			}
		}
	});
	return CHAT;
};
//======================================================================================
