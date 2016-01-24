//======================================================================================
var fs 		  = require('fs');
var path 	  = require('path');
var Sequelize = require('sequelize');
//--------------------------------------------------------------------------------------
var config = {
	database : 'ZCHAT',
	username : 'zsh',
	password : 'aq1sw2de',
	host     : 'localhost',
	dialect  : 'mysql',
	port     : '3306',
	dialectOptions : {
		insecureAuth : "true"
	}
};
var sequelize = new Sequelize(config.database, config.username, config.password, config);
var db 		  = {};
//--------------------------------------------------------------------------------------
fs.readdirSync(__dirname+'/models')
  	.filter (
		function(file) {
			return (file.indexOf(".") !== 0);
		})
	.forEach(
		function(file) {
			var model = sequelize["import"](path.join(__dirname+'/models', file));
			db[model.name] = model;
		});

Object.keys(db).forEach(
	function(modelName) {
		if ("associate" in db[modelName]) {
			db[modelName].associate(db);
		}
	});
//--------------------------------------------------------------------------------------
db.sequelize = sequelize;
db.Sequelize = Sequelize;
//======================================================================================
module.exports = db;
//======================================================================================