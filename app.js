//======================================================================================
var exp = require('express');
var path= require('path');
var app = exp();
var http= require('http').Server(app);
var ip  = require('request-ip');
var bodyParser = require('body-parser');
var sio = require('socket.io')(http, {

});
var md5 = require('md5');
//--------------------------------------------------------------------------------------
var rediz = require('redis');
var Q     = require('bluebird');
Q.promisifyAll(rediz.RedisClient.prototype);
Q.promisifyAll(rediz.Multi.prototype);
var redis = rediz.createClient({
    host : '127.0.0.1',
    port : 6379
});
redis.on('error', function (err) {
    console.log('error event - ' + redis.host + ':' + redis.port + ' - ' + err);
});
var ipAvaExpireTime = 3600*2;
//--------------------------------------------------------------------------------------
var mysql = require('./db');
var bkjob = require('./job');
//======================================================================================
app.use(exp.static(path.join(__dirname, '/public')));
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use(bodyParser.urlencoded());

app.get('/chat', function(req, res) {
    var ip_ = ip.getClientIp(req);
    res.sendFile(__dirname + '/public/html/chat.html');
});
app.post('/chat', function(req, res) {
    var statime = req.body.timestamp;
    readHistory(statime).then(function(data) {
        var chatarr = [];
        if (data.length == 0 ) {
            return res.status(404).send("");
        }
        data.forEach(function(chat) {
            if (isNaN(Number.parseInt(chat))) {
                chatarr.push(JSON.parse(chat));
            }
        })
        return res.status(200).send(JSON.stringify({
            timestamp : data[data.length-1],
            chat : chatarr
        }));
    });
});
//--------------------------------------------------------------------------------------
Date.prototype.pattern=function(fmt) {
    var o = {
        "M+" : this.getMonth()+1, //月份
        "d+" : this.getDate(), //日
        "h+" : this.getHours()%12 == 0 ? 12 : this.getHours()%12, //小时
        "H+" : this.getHours(), //小时
        "m+" : this.getMinutes(), //分
        "s+" : this.getSeconds(), //秒
        "q+" : Math.floor((this.getMonth()+3)/3), //季度
        "S" : this.getMilliseconds() //毫秒
    };
    var week = {
        "0" : "/u65e5",
        "1" : "/u4e00",
        "2" : "/u4e8c",
        "3" : "/u4e09",
        "4" : "/u56db",
        "5" : "/u4e94",
        "6" : "/u516d"
    };
    if(/(y+)/.test(fmt)){
        fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length));
    }
    if(/(E+)/.test(fmt)){
        fmt=fmt.replace(RegExp.$1, ((RegExp.$1.length>1) ? (RegExp.$1.length>2 ? "/u661f/u671f" : "/u5468") : "")+week[this.getDay()+""]);
    }
    for(var k in o){
        if(new RegExp("("+ k +")").test(fmt)){
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length)));
        }
    }
    return fmt;
};
//-----------------------------------------------------------------------------------
/**
 * 注册IP地址
 */
var AVATARS = [
    '#23c6b1','#e7e2c4','#97c8c2','#ebd79a','#a0e7e1',
    '#eeccb1','#bfebee','#f5b1a8','#baf1d2','#fc6471'
];
//-----------------------------------------------------------------------------------
/**
 * 注册一个IP-AVA对
 * @param ip
 */
var onLogin = function(ip) {
    //检查IP-AVA中是否有未过期值
    var _ =
    redis.getAsync('IPAVA-HIST:'+ip).then(function(res) {
        //若没有记录，从AVATAR池中获取一个颜色
        if (res == null) {
            return redis.spopAsync('AVATAR').then(function(ava) {
                ava = ava || "#000000";
                return Q.all([
                    redis.hsetAsync('IPAVA', [ip, ava]),
                    redis.setAsync ('IPAVA-HIST:'+ip, ava)
                ]);
            });
        }
        //如果存在，那么将AVATAR池中对应的颜色清除
        else {
            return Q.all([
                redis.delAsync('IPAVA-HIST:'+ip),
                redis.setAsync('IPAVA-HIST:'+ip, res),
                redis.hsetAsync('IPAVA', [ip, res]),
                redis.sremAsync('AVATAR', res)
            ]);
        }
    });
    return _;
};
//-----------------------------------------------------------------------------------
/**
 * 保持IP-AVA对直到自动过期
 * @param ip
 */
var onLeave = function(ip) {
    // 1. 回收ip对应的颜色，放入颜色池
    // 2. 删除IP表中的ip
    // 3. 设置IP-AVA表中ip过期时间
    var _ =
    redis.hgetAsync('IPAVA', ip).then(function(ava) {
        var all = [
            redis.hdelAsync('IPAVA',ip),
            redis.expireAsync('IPAVA-HIST:'+ip,ipAvaExpireTime)
        ];
        if (ava != '#000000') {
            all.push(redis.saddAsync('AVATAR',ava));
        }
        return Q.all(all);
    });
    return _;
}
//-----------------------------------------------------------------------------------
/**
 * 根据ip获取头像
 * @param ip
 */
var getAvatar = function(ip) {
    return redis.hgetAsync('IPAVA', ip);
}
//-----------------------------------------------------------------------------------
/**
 * format : {
 *   '1': '#23c6b1',
 *   '9.115.85.54': '#e7e2c4'
 * }
 */
var getOnline = function() {
    return redis.hgetallAsync('IPAVA');
};
//-----------------------------------------------------------------------------------
/**
 * 存储聊天记录
 */
var CHAT_HISTORY_PREFIX = 'CHAT';
var saveHistory = function(date, json) {
    redis.zadd(CHAT_HISTORY_PREFIX, date.getTime(), JSON.stringify(json));
    //TODO expire key
};
//-----------------------------------------------------------------------------------
/**
 * 读取聊天记录
 */
var readHistory = function(statime) {
    return redis.zrevrangebyscoreAsync(CHAT_HISTORY_PREFIX, ["("+statime, '-INF', 'LIMIT', 0, 8, 'WITHSCORES']);
};
//-----------------------------------------------------------------------------------
/**
 * TODO 未搞清楚机制
 * 注册pub-sub监听过期的IP,需要在redis.conf中开启配置生效

 var regNofiticationHandler = function() {
    //监听notification
    redis.psubscribe('__key*__:*');

    redis.set('EXPIRE-TEST', 'VALUE');
    redis.expire('EXPIRE-TEST', 5);
    redis.on('pmessage', function(pattern, channel, message) {
        console.log(pattern);
    });
};
 */
//-----------------------------------------------------------------------------------
sio.on('connection', function(socket) {
    var _  = socket.request.connection.remoteAddress.split(":");
    var ip = _[_.length-1];

    onLogin(ip).then(function() {
        getOnline().then(function(res) {
            sio.emit('PERSONONLINE', JSON.stringify(res));
        });
    });

    socket.on('REQMSG', function(msg) {
        getAvatar(ip).then(function(ava) {
            var date = new Date();
            var json =  {
                msg : msg,
                ava : ava,
                date: date.pattern('yyyy-MM-dd HH:mm:ss'),
                ip  : ip
            }
            saveHistory(date, json);
            bkjob.ChatMysqlHelper.save({
                IP      : ip,
                AVATAR  : ava,
                MESSAGE : msg,
                TIME    : date.getTime(),
                DATE    : date
            });
            sio.emit('RESMSG', JSON.stringify(json));
        });
    });
    /**
     * 断开连接，断开的时候将颜色返回到颜色池，但是AVA-IP依旧保持一份映射，下次在未超时登录时可以继续取走续约颜色
     */
    socket.on('disconnect', function() {
        console.log(ip+' disconnected');
        onLeave(ip).then(function() {
            getOnline().then(function(res) {
                console.log(res);
                sio.emit('PERSONONLINE', JSON.stringify(res));
            });
        });
    });
});
//--------------------------------------------------------------------------------------
var kis = sio.of('/zsh-zcc');
kis.on('connection', function(socket) {
    socket.on('zsh-zcc:txt-msg', function(msg) {
        console.log(msg);
    });
});
//--------------------------------------------------------------------------------------
//redis.multi()
//    .set('AAAA','AAAA')
//    .set('BBBB','BBBB')
//    .execAsync().then(function(res) {
//        console.log(res);
//    });
//-----------------------------------------------------------------------------------
redis.del('AVATAR');
redis.del('IPAVA');

Q.all([
    Q.map(AVATARS,function(val) {
        return redis.saddAsync('AVATAR', val);
    }),
    Q.map(redis.keysAsync('IPAVA-HIST:'+'*'),function(key) {
        return redis.delAsync(key);
    })
]).then(function(arr) {
    http.listen(4567, function() {
        console.log('listening on *:4567');
    });
});
//======================================================================================