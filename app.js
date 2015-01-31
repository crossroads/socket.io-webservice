require('newrelic');
var express = require("express");
var app = express();
var server = require("http").createServer(app);
var config = require("./config.js");
var io = require("socket.io")(server, config.io);
var store = require("./store.js")(config.redis, config.flakeid);

// utilities
var url = require("url");
var httpClient = require("request");
var debug = require("debug")("app");

// setup express to parse various content-type
var bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// configure socket.io redis
var redis = require("redis");
var redisAdapter = require("socket.io-redis");
config.redis.return_buffers = true;
var pub = redis.createClient(config.redis.port, config.redis.host, config.redis);
var sub = redis.createClient(config.redis.port, config.redis.host, config.redis);
io.adapter(redisAdapter({pubClient: pub, subClient: sub}));

// start app
var port = process.env.PORT || config.port || 1337;
debug("Listening on " + port);
server.listen(port);

// send message to client
app.post("/send", function (req, res) {
  if (!req.query.site || !req.query.apiKey) {
    return res.status(400).send("Missing query param 'site' or 'apiKey'.");
  }
  var site = config.sites[req.query.site];
  if (!site || site.apiKey !== req.query.apiKey) {
    return res.sendStatus(401);
  }

  var nsp = io.of("/" + req.query.site);
  [].concat(req.body.rooms).forEach(function(room) {
    var args = [req.body.event].concat(req.body.args);
    debug("Room:" + room + ", Args: " + JSON.stringify(args));

    if (nsp.isUserRoom(room)) {
      var dataId = store.add(nsp.name, room, req.body.event, args);
      var socket = nsp.getUserSocket(room);
      if (socket) {
        var callback = function() {
          store.remove(nsp.name, room, req.body.event, dataId, !req.query.resync ? null : function() {
            socket.emit("resync");
            store.clear(nsp.name, room, req.body.event);
          });
        };
        socket.emit.apply(socket, args.concat(callback));
      }
    } else {
      nsp.to(room).emit.apply(nsp, args);
    }
  });
  return res.sendStatus(200);
});

for (var siteName in config.sites) {
  var site = config.sites[siteName];
  var nsp = io.of("/" + siteName);

  // helper functions
  nsp.isUserRoom = function(room) {
    return room.indexOf(site.userRoomPrefix) === 0;
  };

  nsp.getUserSocket = function(userRoom) {
    if (!nsp.adapter.rooms[userRoom]) { return null; }
    var socketId = Object.keys(nsp.adapter.rooms[userRoom])[0];
    return nsp.sockets.filter(function(s) { return s.id === socketId; })[0];
  }

  // socket.io authentication and room registration
  nsp.use(function(socket, next) {
    var query = url.parse(socket.request.url, true).query;
    var headers = {"Authorization": site.authScheme + " " + query.token};

    httpClient.get(site.authUrl, {headers:headers, json:true}, function(error, res, data) {
      if (error) {
        return next(new Error("Auth error: " + error));
      } else if (res.statusCode === 401) {
        return next(new Error("Authentication error"));
      } else if (res.statusCode !== 200) {
        return next(new Error("Auth " + res.statusCode + " error"));
      }
      debug("Assigned rooms: " + data);
      data.forEach(function(room) { socket.join(room); });
      next();
    });
  });

  // send missed messages
  nsp.on("connection", function(socket) {
    debug("connection: " + JSON.stringify(socket.rooms));
    socket.rooms.filter(nsp.isUserRoom).forEach(function(room) {
      store.get(nsp.name, room, function(batchArgs) {
        var callback = function() { store.clear(nsp.name, room); };
        socket.emit.apply(socket, ["batch", batchArgs, callback]);
      });
    });
  });
}
