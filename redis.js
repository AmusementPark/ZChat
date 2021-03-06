//======================================================================================
var rediz = require('redis');
var Q     = require('bluebird');
//--------------------------------------------------------------------------------------
Q.promisifyAll(rediz.RedisClient.prototype);
Q.promisifyAll(rediz.Multi.prototype);
//--------------------------------------------------------------------------------------
redis = rediz.createClient({
    host : '127.0.0.1',
    port : 6379
});
//--------------------------------------------------------------------------------------
redis.on('error', function (err) {
    console.log('error event - ' + redis.host + ':' + redis.port + ' - ' + err);
});
//======================================================================================
module.exports = redis;
//======================================================================================