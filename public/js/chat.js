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

angular.module("template/chat-item.html", []).run(["$templateCache", function($templateCache) {
$templateCache.put("template/chat-item.html",
    '<li class="media">\n'+
    '   <div class="media-body">\n'+
    '       <div class="media">\n'+
    '           <div class="pull-left">\n'+
    '               <div class="media-object img-circle zz-chat-avatar" ng-style="{\'background-color\':msg.avatar}"/>\n'+
    '           </div>\n'+
    '           <div class="media-body">{{msg.msg}}\n'+
    '               <br/><small class="text-muted">IP: {{msg.ip}} | {{msg.date}}</small><hr/>\n'+
    '           </div>\n'+
    '       </div>\n'+
    '   </div>\n'+
    '</li>');
}]);
angular.module("template/person-item.html", []).run(["$templateCache", function($templateCache) {
$templateCache.put("template/person-item.html",
    '<li class="media">\n'+
    '   <div class="media-body">\n'+
    '       <div class="media">\n'+
    '           <div class="pull-left">\n'+
    '               <div class="media-object img-circle zz-chat-avatar" ng-style="{\'background-color\':msg.avatar}"/>\n'+
    '           </div>\n'+
    '           <div class="media-body"><br/><small class="text-muted">IP: {{msg.ip}}</small><hr/></div>\n'+
    '       </div>\n'+
    '   </div>\n'+
    '</li>');
}]);

var ngApp = angular.module('zz.chat', ['template/chat-item.html', 'template/person-item.html']).constant('zz.chat.const', {
    QUERY_ROOM_FULL_URL : '/chat/auth'
});
ngApp.controller('zzChatMainCtrl', ['$scope', '$element', '$document',
    function($scope, $elem, $document) {
        $scope.main = function() {
            var win_height = $document.height();
            var chat_main_height = $elem.find('#chat-main').outerHeight();
            $scope.zzHH=(win_height-chat_main_height)/2+'px';

            var panel_head_height = $elem.find('.panel-heading').outerHeight()+
                                    $elem.find('.panel-footer') .outerHeight();
            $scope.zzBH=(chat_main_height-panel_head_height)+'px';
        };
        // 初始化socket.io
        $scope.socket = io();
    }]);
ngApp.controller('zzChatSendCtrl', ['$scope', '$element', '$http', '$document',
    function($scope, $elem, $http, $document) {
        $scope.zzIptMsg = '';
        $scope.submit = function() {
            if( $scope.zzIptMsg == '' ) {
                return;
            }
            $scope.socket.emit('REQMSG', $scope.zzIptMsg);
            $scope.zzIptMsg = '';
        }
        $scope.socket.on('RESMSG', function(msg){
            $scope.$parent.$broadcast('zzNewMsg', msg);
        });
        $scope.socket.on('disconnect', function() {
            console.log('disconnected');
        });

        $scope.chooseColor = function() {

        }
    }]);
ngApp.controller('zzChatOnlineCtrl', ['$scope', '$element', '$compile', '$templateCache',
    function($scope, $elem, $compile, $templateCache) {
        var onPersonOnlineHandler = function (msg) {
            var msgobj = JSON.parse(msg);
            Object.keys(msgobj).forEach(function(key){
                var newscp = $scope.$new(false);
                newscp.msg = {
                    avatar  : msgobj[key],
                    ip      : key
                };
                $scope.$evalAsync(function() {
                    var item = $compile($templateCache.get('template/person-item.html'))(newscp);
                    $elem.append(item);
                });
            });
        };
        $scope.socket.on('PERSONONLINE', function(msg) {
            $elem.children().remove();
            onPersonOnlineHandler(msg);
        });
    }]);
ngApp.controller('zzChatViewCtrl', ['$scope', '$element', '$compile', '$timeout', '$templateCache',
    function($scope, $elem, $compile, $timeout, $templateCache) {
        $scope.$on('zzNewMsg', function(event, msg) {
            var msgobj = JSON.parse(msg);
            var newscp = $scope.$new(false);
            newscp.msg = {
                author  : '',
                msg     : msgobj.msg,
                avatar  : msgobj.ava,
                date    : msgobj.date,
                ip      : msgobj.ip
            };
            console.log(msgobj);

            $scope.$apply(function() {
                var item = $compile($templateCache.get('template/chat-item.html'))(newscp);
                $elem.append(item);
                $timeout(function() {
                    var ul = document.getElementById("msg-list");
                    ul.scrollTop = ul.scrollHeight;
                }, 1, false);
            });
        });
        $scope.$on('zzOldMsg', function(event, msg) {
            msg.forEach(function(chat){
                var newscp = $scope.$new(false);
                newscp.msg = {
                    author  : '',
                    msg     : chat.msg,
                    avatar  : chat.ava,
                    date    : chat.date,
                    ip      : chat.ip
                };
                $scope.$evalAsync(function() {
                    var item = $compile($templateCache.get('template/chat-item.html'))(newscp);
                    $elem.prepend(item);
                });
            })
        });
    }]);
ngApp.controller('zzChatHistCtrl', ['$scope', '$element', '$http',
    function($scope, $elem, $http) {
        $scope.timestamp = new Date().getTime();   // 从现在时间开始请求
        $scope.isDisable = false;
        $scope.reqHistory = function() {
            $http.post('/chat', {
                timestamp : $scope.timestamp,
            }).success(function(res) {
                $scope.timestamp = res.timestamp;
                $scope.$parent.$broadcast('zzOldMsg', res.chat);
            }).error(function(err) {
                $scope.isDisable = true;
            });
        }
    }]);