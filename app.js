require("newrelic");
var express = require("express");
var app = express();
var server = require("http").createServer(app);
var config = require("./config.js");
var store = require("./store.js")(config.redis);
var io = require("socket.io")(server, config.io);

// error handling
var errorHandler;
if (config.airbrake && config.airbrake.key) {
  var airbrake = require("airbrake").createClient(config.airbrake.key, config.env);
  for (var setting in config.airbrake) {
    airbrake[setting] = config.airbrake[setting];
  }
  // this registers uncaughtException for node errors and then returns error handler
  errorHandler = airbrake.expressHandler();
}

// utilities
var url = require("url");
var httpClient = require("request");
var logger = require("./logger.js");
var genId = require("./genId.js");

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
logger.info({"category": "app start", "message": "Listening on " + port});
server.listen(port);

// send message to client
app.post("/send", function (req, res) {
  var reqId = genId();
  logger.info({
    "category": "send message request",
    "site":"/" + req.query.site,
    "requestId": reqId,
    "rooms": req.body.rooms,
    "event": req.body.event,
    "args": req.body.args
  });

  if (!req.query.site || !req.query.apiKey) {
    logger.error({"category":"send message error","site":"/" + req.query.site,"requestId":reqId,"message":"Missing query param 'site' or 'apiKey'."});
    return res.status(400).send("Missing query param 'site' or 'apiKey'.");
  }
  var site = config.sites[req.query.site];
  if (!site || site.apiKey.toString() !== req.query.apiKey) {
    logger.error({"category":"send message error","site":"/" + req.query.site,"requestId":reqId,"message":"ApiKey invalid"});
    return res.status(401).send("ApiKey invalid.");
  }

  var nsp = io.of("/" + req.query.site);
  var args = [req.body.event].concat(req.body.args);

  // turn shared rooms into array of private rooms for connected users
  var rooms = [];
  [].concat(req.body.rooms).forEach(function(room) {
    if (!site.userRoomEnabled || nsp.isUserRoom(room)) {
      rooms.push(room);
    } else {
      rooms = rooms.concat(nsp.getUserRooms(room));
    }
  });
  // only unique
  rooms = rooms.filter(function(value, index, self) { return self.indexOf(value) === index; });

  rooms.forEach(function(room) {
    if (!site.userRoomEnabled) {
      Object.values(nsp.to(room).sockets).forEach(function(socketId) {
        logger.info({"category":"message sent","site":nsp.name,"requestId":reqId,"room": room, "socketId": socketId, "event":req.body.event});
      });
      nsp.to(room).emit.apply(nsp, args);
      return;
    }
    if (!nsp.users[room]) {
      return;
    }
    nsp.users[room].devices.forEach(function(device) {
      // user not connected or TTL expired and requires a full sync so no need to store message
      if (config.device_ttl !== 0 && device.connected !== true &&
        (Date.now() - device.disconnectTime) > config.device_ttl * 1000) {
        nsp.removeDevice(room, device);
        if (nsp.users[room].devices.length === 0) {
          delete nsp.users[room];
        }
        logger.info({"category":"user not connected","site":nsp.name,"requestId":reqId,"deviceId": device.id, "message":"User " + room + " not connected"});
        return;
      }

      var dataId = store.add(nsp.name, device.storeListName, req.body.event, args, config.device_ttl);
      logger.info({"category":"message stored","site":nsp.name,"requestId":reqId,"dataId": dataId, "room": room, "deviceId": device.id});

      var socket = nsp.getSocket(device.socketId);
      if (socket) {
        var callback = function() {
          logger.info({"category":"message removed","site":nsp.name,"requestId":reqId,"deviceId":device.id, "socketId":socket.id, "message": "Remove message: " + dataId, "event":req.body.event, "dataId": dataId});
          store.remove(nsp.name, device.storeListName, req.body.event, dataId, !req.query.resync ? null : function() {
            socket.emit("_resync");
            logger.error({"category":"resync event","site":nsp.name,"requestId":reqId,"deviceId":device.id, "socketId":socket.id, "message":"Resync emitted from message: " + dataId, "event":req.body.event, "dataId": dataId});
            store.clear(nsp.name, device.storeListName, req.body.event);
          });
        };

        logger.info({"category":"message sent","site":nsp.name,"requestId":reqId,"dataId": dataId, "room": room, "deviceId": device.id, "socketId":socket.id, "event":req.body.event});
        socket.emit.apply(socket, args.concat(callback));
      }
    });
  });
  return res.sendStatus(200);
});

for (var siteName in config.sites) {
  var site = config.sites[siteName];
  var nsp = io.of("/" + siteName);
  nsp.users = {};
  site.userRoomEnabled = site.userRoomPrefix && site.userRoomPrefix !== "";

  // helper functions
  nsp.isUserRoom = function(room) {
    return nsp.isPublicRoom(room) || room.indexOf(site.userRoomPrefix) === 0;
  };

  nsp.isPublicRoom = function(room) {
    return room === site.publicChannel;
  }

  nsp.userRoomID = function(room) {
    if(room.indexOf(site.userRoomPrefix) === 0) {
      return room.split("_")[1];
    }
  };

  nsp.getUserRooms = function(sharedRoom) {
    return Object.keys(nsp.users).filter(function(key) {
      return nsp.users[key].rooms.some(function(r) { return r.toLowerCase() == sharedRoom.toLowerCase(); });
    });
  };

  nsp.removeDevice = function(userRoom, device) {
    var devices = nsp.users[userRoom].devices;
    var idx = devices.indexOf(device);
    if (idx > -1) {
      devices.splice(idx, 1);
    }
  };

  nsp.getSocket = function(socketId) {
    return nsp.sockets[socketId];
  };

  // START: Update User's last connected/disconnected(online/offline) time
  nsp.userStateChange = function(userRoom, connected, socket) {
    var roomId = nsp.userRoomID(userRoom);
    var userParams = {id: roomId, user: {}};
    userParams["user"][connected ? "last_connected" : "last_disconnected"] = new Date();
    var userUpdateUrl = site.updateUserUrl.replace(":id", roomId);
    var query = url.parse(socket.request.url, true).query;
    var headers = {"Authorization": site.authScheme + " " + query.token};
    httpClient.put(userUpdateUrl, {headers:headers, json:userParams}, function(error, res, body) {
      if (error || (res.statusCode && res.statusCode !== 200)) {
        logger.error({"category":"User update error","site":nsp.name,"message":error || body,"status code":res.statusCode,"socketId":socket.id,"deviceId":socket.deviceId,"userRoom":userRoom});
      }
      else {
        logger.info({"category":"User updated","socketId":socket.id,"deviceId":socket.deviceId,"userRoom":userRoom});
      }
    })
  }
  // END

  // socket.io authentication and room registration
  nsp.use(function(socket, next) {
    nsp = socket.nsp; // for some reason without this, nsp referred to the last site's nsp
    var query = url.parse(socket.request.url, true).query;
    var headers = {"Authorization": site.authScheme + " " + query.token, "X-META": query.meta};
    httpClient.get(site.authUrl, {headers:headers, json:true}, function(error, res, data) {
      if (error) {
        logger.error({"category":"authentication","site":nsp.name,"message":"Client auth error: " + error});
        return next(new Error("Auth error: " + error));
      } else if (res.statusCode && res.statusCode === 401) {
        logger.error({"category":"authentication","site":nsp.name,"message":"Client auth failed"});
        return next(new Error("Authentication failed"));
      } else if (res.statusCode && res.statusCode !== 200) {
        logger.error({"category":"authentication","site":nsp.name,"message":"Auth " + res.statusCode + " error"});
        return next(new Error("Auth " + res.statusCode + " error"));
      } else if (site.userRoomEnabled && !data.some(function(r) { return nsp.isUserRoom(r); })) {
        logger.error({"category":"authentication","site":nsp.name,"message":"User is missing a private room"});
        return next(new Error("User is missing a private room"));
      } else if (!res.statusCode) {
        logger.error({"message":"Error status code not set"})
        return next(new Error("Error status code not set"));
      }
      logger.info({"category":"rooms registered","socketId":socket.id,"rooms":data});
      Object.keys(socket.rooms).forEach(function(room) { socket.leave(room); });

      if (!data.length) {
        return next();
      }

      // proceed once last room has completed joining
      data.slice(0,-1).forEach(function(room) { socket.join(room); });
      socket.join(data.slice(-1), next);
    });
  });

  // send missed messages
  nsp.on("connection", function(socket) {
    nsp = socket.nsp; // for some reason without this, nsp referred to the last site's nsp
    var socketRooms = Object.keys(socket.rooms);
    var deviceId = url.parse(socket.request.url, true).query.deviceId || "";
    socket.deviceId = deviceId;
    logger.info({"category":"socket connected","site":nsp.name,"socketId":socket.id,"rooms":socketRooms,"deviceId":deviceId});
    socket.emit("_settings", {"device_ttl":config.device_ttl});
    socketRooms.filter(nsp.isUserRoom).forEach(function(room) {
      if (!nsp.users[room]) {
        nsp.users[room] = {"rooms": socketRooms, "devices": []};
      }
      var device = nsp.users[room].devices.filter(function(d) { return d.id == deviceId; })[0];
      if (!device) {
        device = {"id": deviceId, "storeListName": room + ":" + deviceId};
        nsp.users[room].devices.push(device);
      }
      device.socketId = socket.id;

      store.get(nsp.name, device.storeListName, function(batchArgs) {
        logger.info({"category":"batch event","site":nsp.name,"socketId":socket.id,"deviceId":deviceId,"args":batchArgs});
        var callback = function() { store.clear(nsp.name, device.storeListName); };
        socket.emit.apply(socket, ["_batch", batchArgs, callback]);
      });

      if(site.updateUserUrl && !nsp.isPublicRoom(room)) {
        nsp.userStateChange(room, true, socket)
      }

      if (config.device_ttl > 0) {
        nsp.users[room].connected = true;
        store.persist(nsp.name, device.storeListName);

        socket.on("disconnect", function() {
          logger.info({"category":"socket disconnected","site":nsp.name,"socketId":socket.id,"deviceId":deviceId});
          device.connected = false;
          device.disconnectTime = Date.now();
          store.expire(nsp.name, device.storeListName, config.device_ttl);

          if(site.updateUserUrl && !nsp.isPublicRoom(room)) {
            nsp.userStateChange(room, false, socket)
          }
        });
      }
    });
  });
}

// this needs to came after other app.use that you want to record errors for
if (errorHandler) {
  app.use(errorHandler);
}
