//======================================================================================
var exp = require('express');
var path= require('path');
var app = exp();
var http= require('http').Server(app);
var ip  = require('request-ip');
var Q   = require('bluebird');
var bodyParser = require('body-parser');
var sio = require('socket.io')(http, {});
//--------------------------------------------------------------------------------------
var redis = require('./redis');
var mysql = require('./db');
var bkjob = require('./job');
//--------------------------------------------------------------------------------------
var ipAvaExpireTime = 3600*2;
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
    readHistory(statime).then(function(chats) {
        if (chats.length == 0 ) {
            return res.status(404).send("");
        }
        var timestamp = chats[chats.length-1].date;
        console.log(chats);
        var result = chats.map(function(chat) {
            chat.date = new Date(chat.date).pattern('yyyy-MM-dd HH:mm:ss');
            //return JSON.parse(chat);
            return chat;
        });
        res.status(200).send(JSON.stringify({
            timestamp : timestamp,
            chat : result
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

var AVATAR_SET_KEY = 'AVATAR-SET';
var IP_AVATAR_PAIR_HSET_KEY = 'IP-AVATAR-HSET';
var IP_AVATAR_PAIR_HISTORY_KEY_PREFIX = 'IP-AVATAR-HIST:';
//-----------------------------------------------------------------------------------
/**
 * 注册一个IP-AVA对
 * @param ip
 */
var onLogin = function(ip) {
    //检查IP-AVA中是否有未过期值
    var _ =
    redis.getAsync(IP_AVATAR_PAIR_HISTORY_KEY_PREFIX+ip).then(function(res) {
        //若没有记录，从AVATAR池中获取一个颜色
        if (res == null) {
            return redis.spopAsync(AVATAR_SET_KEY).then(function(ava) {
                ava = ava || "#000000";
                return Q.all([
                    redis.hsetAsync(IP_AVATAR_PAIR_HSET_KEY, [ip, ava]),
                    redis.setAsync (IP_AVATAR_PAIR_HISTORY_KEY_PREFIX+ip, ava)
                ]);
            });
        }
        //如果存在，那么将AVATAR池中对应的颜色清除
        else {
            return Q.all([
                redis.delAsync(IP_AVATAR_PAIR_HISTORY_KEY_PREFIX+ip),
                redis.setAsync(IP_AVATAR_PAIR_HISTORY_KEY_PREFIX+ip, res),
                redis.hsetAsync(IP_AVATAR_PAIR_HSET_KEY, [ip, res]),
                redis.sremAsync(AVATAR_SET_KEY, res)
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
    redis.hgetAsync(IP_AVATAR_PAIR_HSET_KEY, ip).then(function(ava) {
        var all = [
            redis.hdelAsync(IP_AVATAR_PAIR_HSET_KEY,ip),
            redis.expireAsync(IP_AVATAR_PAIR_HISTORY_KEY_PREFIX+ip,ipAvaExpireTime)
        ];
        if (ava != '#000000') {
            all.push(redis.saddAsync(AVATAR_SET_KEY,ava));
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
    return redis.hgetAsync(IP_AVATAR_PAIR_HSET_KEY, ip);
}
//-----------------------------------------------------------------------------------
/**
 * format : {
 *   '1': '#23c6b1',
 *   '9.115.85.54': '#e7e2c4'
 * }
 */
var getOnline = function() {
    return redis.hgetallAsync(IP_AVATAR_PAIR_HSET_KEY);
};
//-----------------------------------------------------------------------------------
/**
 * 存储聊天记录
 */
var CHAT_HASH_KEY_PREFIX = 'CHAT-HASH:';
var CHAT_IDS_ZSET_KEY = 'CHAT-IDS-ZSET';
var CHAT_HASH_KEY_EXPIRE = 2*3600;
var CHAT_EVERY_READ_COUNT = 8;
var chat_ids_read_end = false;

var saveHistory = function(date, json) {
    return Q.all([
        redis.zaddAsync  (CHAT_IDS_ZSET_KEY, date.getTime(), date.getTime()),
        redis.hmsetAsync (CHAT_HASH_KEY_PREFIX+date.getTime(), json),
        redis.expireAsync(CHAT_HASH_KEY_PREFIX+date.getTime(), CHAT_HASH_KEY_EXPIRE)
    ]);
};
//-----------------------------------------------------------------------------------
var readChatFromMysql = function(id) {
    return bkjob.ChatMysqlHelper.read(id);
};
//-----------------------------------------------------------------------------------
var readChatBatchFromMysql = function(ids) {
    return bkjob.ChatMysqlHelper.readBatch(ids);
}
//-----------------------------------------------------------------------------------
// @return Array
var readChatIDsFromMysql = function() {
    // 获取目前已经缓存的条数
    return redis.zcountAsync(CHAT_IDS_ZSET_KEY, ['-INF', '+INF']).then(function(count) {
        return bkjob.ChatMysqlHelper.readIDs(count);
    });
};
//-----------------------------------------------------------------------------------
var saveChatToMysql = function(json) {
    return bkjob.ChatMysqlHelper.save(json);
};
//-----------------------------------------------------------------------------------
/**
 * 读取聊天记录
 */
var readHistory = function(statime) {
    // 首先读取聊天记录id列表，获取区间内的id数组
    return redis.zrevrangebyscoreAsync(CHAT_IDS_ZSET_KEY, ["("+statime, '-INF', 'LIMIT', 0, CHAT_EVERY_READ_COUNT])
        .then(function(ids) {
            // 不到预定条数，准备从mysql中读取id列表
            if (ids.length < CHAT_EVERY_READ_COUNT) {
                if (chat_ids_read_end) {
                    return Q.resolve(ids);
                }
                return readChatIDsFromMysql().then(function(ids_from_mysql) {
                    if (ids_from_mysql.length < CHAT_EVERY_READ_COUNT) {
                        chat_ids_read_end = true;
                    }
                    var _ = Q.map(ids_from_mysql, function(id_from_mysql) {
                        return redis.zaddAsync(CHAT_IDS_ZSET_KEY, id_from_mysql, id_from_mysql);
                    });
                    return _.then(function() {
                        return redis.zrevrangebyscoreAsync(CHAT_IDS_ZSET_KEY, ["("+statime, '-INF', 'LIMIT', 0, CHAT_EVERY_READ_COUNT]);
                    });
                });
            } else {
                return Q.resolve(ids);
            }
        })
        .then(function(ids) {
            //获取到了聊天id，读取缓存
            return Q.map(ids, function(id) {
                return redis.hgetallAsync(CHAT_HASH_KEY_PREFIX+id).then(function(chat) {
                    if (chat == null) {
                        return Q.resolve({id: id, exist: false});
                    } else {
                        // 重新设置过期时间
                        return redis.expireAsync(CHAT_HASH_KEY_PREFIX+id, CHAT_HASH_KEY_EXPIRE).then(function(err) {
                            return (err == 1) ? Q.resolve({id: id, exist: true}) : Q.resolve({id: id, exist: false});
                        });
                    }
                });
            });
        })
        .then(function(packs) {
            var exist_ids = [], other_ids = [];
            packs.forEach(function(pack) {
                ( pack.exist ) ? exist_ids.push(pack.id) : other_ids.push(pack.id);
            });
            if (other_ids.length != 0)  {
                return readChatBatchFromMysql(other_ids).then(function(chats) {
                    return Q.map(chats, function(chat) {
                        return Q.all([
                            redis.hmsetAsync (CHAT_HASH_KEY_PREFIX+chat.TIME, chat),
                            redis.expireAsync(CHAT_HASH_KEY_PREFIX+chat.TIME, CHAT_HASH_KEY_EXPIRE)
                        ]);
                    });
                }).then(function(){
                    return Q.resolve(exist_ids.concat(other_ids).sort().reverse());
                });
            } else {
                return Q.resolve(exist_ids);
            }
        }).then(function(ids) {
            return Q.map(ids, function(id) {
                return redis.hgetallAsync(CHAT_HASH_KEY_PREFIX+id).then(function(chat) {
                    return Q.resolve({
                        msg : chat.MESSAGE,
                        ava : chat.AVATAR,
                        date: parseInt(chat.TIME),
                        ip  : chat.IP
                    });
                });
            });
        });
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
            var json = {
                IP      : ip,
                AVATAR  : ava,
                MESSAGE : msg,
                TIME    : date.getTime(),
                DATE    : date
            }
            saveHistory(date, json);
            saveChatToMysql(json);
            sio.emit('RESMSG', JSON.stringify({
                msg : msg,
                ava : ava,
                date: date.pattern('yyyy-MM-dd HH:mm:ss'),
                ip  : ip
            }));
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
var init_redis = function() {
    return [
        redis.delAsync(IP_AVATAR_PAIR_HSET_KEY),
        redis.delAsync(AVATAR_SET_KEY),
        readChatIDsFromMysql().then(function(ids_from_mysql) {
            return Q.map(ids_from_mysql, function(id_from_mysql) {
                return redis.zaddAsync(CHAT_IDS_ZSET_KEY, id_from_mysql, id_from_mysql);
            });
        }),
        Q.map(AVATARS,function(val) {
            return redis.saddAsync(AVATAR_SET_KEY, val);
        }),
        Q.map(redis.keysAsync(IP_AVATAR_PAIR_HISTORY_KEY_PREFIX+'*'),function(key) {
            return redis.delAsync(key);
        })
    ];
};
Q.all(init_redis()).then(function(arr) {
    http.listen(4567, function() {
        console.log('listening on *:4567');
    });
});
//======================================================================================