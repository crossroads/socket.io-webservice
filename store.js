var redis = require("redis");
var extend = require("util")._extend;
var genId = require("./genId.js");

module.exports = function(redisConfig) {

  var redisConfig = extend({}, redisConfig, {return_buffers:false});
  var redisClient = redis.createClient(redisConfig.port, redisConfig.host, redisConfig);

  function keyName(siteName, listName, event) {
    return siteName + ":socket.io:" + listName + ":" + event;
  }

  function itemMatchId(item, dataId) {
    return item && item.indexOf(dataId) === 0;
  }

  function forEachKey(siteName, listName, func) {
    var redisKeyPrefix = keyName(siteName, listName, "") + "*";
    redisClient.keys(redisKeyPrefix, function(err, keys) {
      for (var idx in keys) {
        func(keys[idx], keys);
      }
    });
  }

  return {
    add: function(siteName, listName, event, data) {
      var dataId = genId();
      var redisKey = keyName(siteName, listName, event);
      redisClient.rpush(redisKey, dataId + ":" + JSON.stringify(data));
      return dataId;
    },

    /**
     * Removes a single item from the store
     * @param {String} siteName - the site name this store belongs to
     * @param {String} listName - the name of the list
     * @param {String} dataId - the id of the item in the list to remove
     * @param {String} event - the event name used for notFirstCallback
     * @param {Function} notFirstCallback - if provided if item is not first in list for the specified event will call this function instead
     */
    remove: function(siteName, listName, event, dataId, notFirstCallback) {
      var redisKey = keyName(siteName, listName, event);
      if (notFirstCallback) {
        redisClient.lrange(redisKey, 0, 0, function(err, res) {
          if (itemMatchId(res[0], dataId)) {
            redisClient.lpop(redisKey);
          } else {
            notFirstCallback();
          }
        });
      } else {
        redisClient.lrange(redisKey, 0, -1, function(err, res) {
          for (var idx in res) {
            if (itemMatchId(res[idx], dataId)) {
              redisClient.lrem(redisKey, 1, res[idx]);
              break;
            }
          }
        });
      }
    },

    clear: function(siteName, listName, /*optional*/ event) {
      if (arguments.length === 2) {
        forEachKey(siteName, listName, function(key) {
          redisClient.del(key);
        });
      } else {
        redisClient.del(keyName(siteName, listName, event));
      }
    },

    get: function(siteName, listName, callback) {
      var returnedData = [];
      var results = 0;

      forEachKey(siteName, listName, function(key, keys) {
        redisClient.lrange(key, 0, -1, function(err, res) {
          res.forEach(function(item) {
            returnedData.push(JSON.parse(item.substring(item.indexOf(":") + 1)));
          });

          results++;
          if (results === keys.length) {
            callback(returnedData);
          }
        });
      });

    },

    expire: function(siteName, listName, ttl) {
      forEachKey(siteName, listName, function(key) {
        redisClient.expire(key, ttl);
      });
    },

    persist: function(siteName, listName, ttl) {
      forEachKey(siteName, listName, function(key) {
        redisClient.persist(key);
      });
    }
  };
}
